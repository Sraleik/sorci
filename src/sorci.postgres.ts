import postgres from "postgres";
import {
  EventId,
  Sorci,
  Query,
  ToPersistEvent,
  QueryOr,
  AppendEventPayload,
  QueryProperty,
  QueryAble,
  PersistedEvent,
  ProjectionDeclaration,
  ProjectionSchema,
  EventReducer
} from "./sorci.interface";
import { shortId } from "./common/utils";

type SorciConstructorPayload = {
  host: string;
  port: number;
  user: string;
  password: string;
  databaseName: string;
  streamName: string;
  buildAdvisoryLocks?: typeof buildAdvisoryLocks;
};

function isSorciConstructorPayload(
  payload?: any
): payload is SorciConstructorPayload {
  return (
    typeof payload === "object" &&
    payload.host &&
    payload.port &&
    payload.user &&
    payload.password &&
    payload.databaseName &&
    payload.streamName
  );
}

export function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

function extractIdentifiers(data: any): {
  identifiers: Record<string, string>;
  skipLockOn: string[];
} {
  const identifiers: Record<string, string> = {};
  let skipLockOn: string[] = [];

  if (!data || typeof data !== "object") {
    return { identifiers, skipLockOn };
  }

  if (data.identifiers && typeof data.identifiers === "object") {
    if (Array.isArray(data.identifiers.$skipLockOn)) {
      skipLockOn = data.identifiers.$skipLockOn;
    }

    for (const [key, value] of Object.entries(data.identifiers)) {
      if (key === "$skipLockOn") continue;

      if (value && typeof value === "object" && "$eq" in value) {
        const eqValue = (value as any).$eq;
        if (typeof eqValue === "string") {
          identifiers[key] = eqValue;
        }
      } else if (typeof value === "string") {
        identifiers[key] = value;
      }
    }
  }

  return { identifiers, skipLockOn };
}

function extractEventTypes(typeCondition: any): string[] {
  if (!typeCondition) {
    return [];
  }

  if (typeof typeCondition === "object") {
    if ("$eq" in typeCondition) {
      return [typeCondition.$eq];
    }
    if ("$in" in typeCondition) {
      return typeCondition.$in;
    }
  }

  if (typeof typeCondition === "string") {
    return [typeCondition];
  }

  return [];
}

function extractEventTypesForLocking(whereClause: any): string[] {
  if (whereClause.$or) {
    const allTypes: string[] = [];
    for (const condition of whereClause.$or) {
      const typeCondition = condition.type;
      if (typeCondition) {
        const types = extractEventTypes(typeCondition);
        const skipLockOn =
          typeof typeCondition === "object" && typeCondition.$skipLockOn
            ? typeCondition.$skipLockOn
            : [];
        allTypes.push(...types.filter((t) => !skipLockOn.includes(t)));
      }
    }
    return allTypes;
  }

  if (whereClause.$and) {
    const allTypes: string[] = [];
    for (const condition of whereClause.$and) {
      const typeCondition = condition.type;
      if (typeCondition) {
        const types = extractEventTypes(typeCondition);
        const skipLockOn =
          typeof typeCondition === "object" && typeCondition.$skipLockOn
            ? typeCondition.$skipLockOn
            : [];
        allTypes.push(...types.filter((t) => !skipLockOn.includes(t)));
      }
    }
    return allTypes;
  }

  const typeCondition = whereClause.type;
  if (!typeCondition) return [];

  const types = extractEventTypes(typeCondition);
  const skipLockOn =
    typeof typeCondition === "object" && typeCondition.$skipLockOn
      ? typeCondition.$skipLockOn
      : [];

  return types.filter((t) => !skipLockOn.includes(t));
}

export function buildAdvisoryLocks(payload: {
  query: Query;
}): Array<{ key: string; hash: number }> {
  const { query } = payload;

  const locks: Array<{ key: string; hash: number }> = [];

  if ("$or" in query.$where && query.$where.$or) {
    const topLevelExtracted = extractIdentifiers(query.$where);
    const topLevelIdentifiers = topLevelExtracted.identifiers;

    for (const orCondition of query.$where.$or) {
      const branchExtracted = extractIdentifiers({
        identifiers: orCondition.identifiers
      });
      const branchIdentifiers = branchExtracted.identifiers;
      const skipLockOn = branchExtracted.skipLockOn;

      const identifiers = { ...topLevelIdentifiers, ...branchIdentifiers };

      const filteredIdentifiers: Record<string, string> = {};
      for (const [key, value] of Object.entries(identifiers)) {
        if (!skipLockOn.includes(key)) {
          filteredIdentifiers[key] = value;
        }
      }

      const typeCondition = orCondition.type;
      const eventTypes = extractEventTypes(typeCondition);
      const typeSkipLockOn =
        typeof typeCondition === "object" && typeCondition.$skipLockOn
          ? typeCondition.$skipLockOn
          : [];
      const filteredEventTypes = eventTypes.filter(
        (t) => !typeSkipLockOn.includes(t)
      );
      const uniqueEventTypes = [...new Set(filteredEventTypes)];

      const sortedIdentifierEntries = Object.entries(filteredIdentifiers).sort(
        ([keyA], [keyB]) => keyA.localeCompare(keyB)
      );
      const identifiersPart = sortedIdentifierEntries
        .map(([key, value]) => `${key}:${value}`)
        .join(":");

      for (const eventType of uniqueEventTypes) {
        const lockKey = identifiersPart
          ? `${identifiersPart}:${eventType}`
          : eventType;
        locks.push({
          key: lockKey,
          hash: hashString(lockKey)
        });
      }
    }
  } else {
    const extracted = extractIdentifiers(query.$where);
    const allIdentifiers = extracted.identifiers;
    const skipLockOn = extracted.skipLockOn;

    const filteredIdentifiers: Record<string, string> = {};
    for (const [key, value] of Object.entries(allIdentifiers)) {
      if (!skipLockOn.includes(key)) {
        filteredIdentifiers[key] = value;
      }
    }

    const queryEventTypes = extractEventTypesForLocking(query.$where);
    const allEventTypes = [...new Set(queryEventTypes)];

    const sortedIdentifierEntries = Object.entries(filteredIdentifiers).sort(
      ([keyA], [keyB]) => keyA.localeCompare(keyB)
    );
    const identifiersPart = sortedIdentifierEntries
      .map(([key, value]) => `${key}:${value}`)
      .join(":");

    for (const eventType of allEventTypes) {
      const lockKey = identifiersPart
        ? `${identifiersPart}:${eventType}`
        : eventType;
      locks.push({
        key: lockKey,
        hash: hashString(lockKey)
      });
    }
  }

  locks.sort((a, b) => a.key.localeCompare(b.key));

  return locks;
}

export class SorciPostgres implements Sorci {
  //TODO put the type, resolving the issue will fix/avoid issue
  private _sql; //: postgres.Sql;
  private _streamName: string;
  private _buildAdvisoryLocks: typeof buildAdvisoryLocks;
  private _readyPromise: Promise<void>;
  private _projectionRegistry: Map<
    string,
    {
      schema: ProjectionSchema;
      reducers: Map<string, EventReducer>;
    }
  > = new Map();

  constructor(payload: SorciConstructorPayload);
  constructor(payload: {
    connectionString: string;
    streamName: string;
    buildAdvisoryLocks?: typeof buildAdvisoryLocks;
  });
  constructor(
    payload:
      | {
          connectionString: string;
          streamName: string;
          buildAdvisoryLocks?: typeof buildAdvisoryLocks;
        }
      | SorciConstructorPayload
  ) {
    this._streamName = payload.streamName;
    this._buildAdvisoryLocks = payload.buildAdvisoryLocks ?? buildAdvisoryLocks;

    if (isSorciConstructorPayload(payload)) {
      const { host, port, user, password, databaseName } = payload;

      this._sql = postgres({
        host,
        port,
        database: databaseName,
        username: user,
        password,
        onnotice(notice) {
          // simple notice of already existing table, index, relation
          if (notice.code === "42P07") return;
          // simple notice of truncate operation
          if (notice.code === "42622") return;
          // simple notice of not existing trigger
          if (notice.code === "00000") return;
          console.log(notice);
        }
      });
    } else {
      this._sql = postgres(payload.connectionString);
    }

    this._readyPromise = this.loadProjectionsFromDatabase().catch((error) => {
      console.error("Failed to load projections:", error);
    });
  }

  async ready(): Promise<void> {
    return this._readyPromise;
  }

  // Making them readonly outside of the instance
  get sql() {
    return this._sql;
  }

  get streamName() {
    return this._streamName;
  }

  /* Identifiers based on the simple strings */
  get streamNameIdentifier() {
    return this.sql(this._streamName);
  }

  async createBasicTable(tableName: string) {
    await this.sql.begin(async (sql) => {
      const currentTableIdentifier = sql(tableName);

      // const isUuidExtensionLoaded = !!(
      //   await sql`SELECT * FROM pg_extension WHERE extname = 'uuid-ossp'`
      // ).length;
      // if (!isUuidExtensionLoaded) {
      //   await sql`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`;
      // }

      //TODO, allow ulid or uuid
      await sql`
        CREATE TABLE IF NOT EXISTS ${currentTableIdentifier} (
          id char(26) PRIMARY KEY,
          type text NOT NULL,
          data JSONB NOT NULL,
          identifier JSONB NOT NULL, 
          timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        );
      `;

      //TODO: identifier should be identifiers with an S

      await sql`
        CREATE INDEX IF NOT EXISTS ${sql(`${tableName}_type_index`)} 
        ON ${currentTableIdentifier} USING btree ("type");
      `;

      await sql`
        CREATE INDEX IF NOT EXISTS ${sql(`${tableName}_identifier_index`)} 
        ON ${currentTableIdentifier} USING gin ("identifier");
      `;
    });
  }

  async createStream() {
    await this.createBasicTable(this.streamName);
    await this.createProjectionsMetaTable();
  }

  async setupTestStream(streamName?: string) {
    this._streamName = streamName || `test_${shortId()}`;

    this._projectionRegistry.clear();

    await this.createStream();
  }

  async cleanStream(streamName: string) {
    return this.sql.begin(async (sql) => {
      const allTables = await sql`
        SELECT table_name 
        FROM information_schema.tables
        WHERE table_schema = 'public' 
        AND table_name LIKE ${streamName + "%"}
      `;

      for (const { table_name } of allTables) {
        await sql`DROP TABLE IF EXISTS ${sql(table_name)} CASCADE`;
      }

      const allFunctions = await sql`
        SELECT routine_name 
        FROM information_schema.routines
        WHERE routine_schema = 'public' 
        AND routine_name LIKE ${streamName + "%"}
      `;

      for (const { routine_name } of allFunctions) {
        await sql.unsafe(`DROP FUNCTION IF EXISTS ${routine_name}() CASCADE`);
      }
    });
  }

  async dropCurrentStream() {
    await this.cleanStream(this.streamName);
  }

  async dropAllTestStream(payload?: { excludeCurrentStream: boolean }) {
    const { excludeCurrentStream } = payload || { excludeCurrentStream: false };
    const excludeStatement = excludeCurrentStream
      ? this.sql`AND table_name NOT LIKE ${this.streamName + "%"}`
      : this.sql``;

    const rawTableNames = await this.sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' 
      AND table_name LIKE 'test_%'
      AND table_name NOT LIKE '%_projection_%'
      AND table_name NOT LIKE '%_projections_meta'
      ${excludeStatement}
    `;

    const streamNames = rawTableNames.map(
      ({ table_name }) => table_name
    ) as Array<string>;
    const streamNamesSet = new Set(streamNames);
    const uniqStreamName = [...streamNamesSet];

    const promises = uniqStreamName.map(async (streamName) => {
      return this.cleanStream(streamName);
    });

    await Promise.all(promises);
  }

  async truncate() {
    await this.sql`
        TRUNCATE TABLE ${this.streamNameIdentifier}
      `;
  }

  async close() {
    return this.sql.end({ timeout: 5 }).catch((error) => {
      console.error("Error closing postgres connection:", error);
    });
  }

  async insertEvents(events: Array<ToPersistEvent>) {
    const res = (await this.sql`
      INSERT INTO ${this.streamNameIdentifier} ${this.sql(events)}
      RETURNING id
    `) as Array<{ id: string }>;

    return res.map((resItem) => resItem.id);
  }

  async getEventById(id: EventId) {
    const res = await this.sql`
      SELECT * FROM ${this.streamNameIdentifier} WHERE id = ${id} LIMIT 1;
    `;

    const rawEvent = res[0];
    if (!rawEvent) return;

    return {
      id: rawEvent.id,
      type: rawEvent.type,
      data: rawEvent.data,
      identifier: rawEvent.identifier,
      timestamp: rawEvent.timestamp
    };
  }

  // --- $Where to sql statements START
  private getInStatement(payload: {
    sql: postgres.Sql;
    key: string;
    values: readonly string[];
  }) {
    const { sql, key, values } = payload;
    return sql`${this.sql(key)} = ANY ( ${values}::text[] )`;
  }

  private getEqStatement(payload: {
    sql: postgres.Sql;
    key: string;
    value: string;
  }) {
    const { sql, key, value } = payload;

    if (key === "type") {
      return sql`${sql(key)} = ${value}`;
    }

    if (key === "id") {
      return sql`${sql(key)} = ${value}`;
    }

    if (key === "timestamp") {
      return sql`${sql(key)} = ${value}`;
    }

    return sql`identifier->>${key} = ${value}`;
  }

  private getGtStatement(payload: {
    sql: postgres.Sql;
    key: string;
    value: string | Date;
  }) {
    const { sql, key, value } = payload;

    if (key === "timestamp") {
      const dateValue = value instanceof Date ? value : new Date(value);
      return sql`${sql(key)} > ${dateValue}`;
    }

    if (key === "id") {
      return sql`${sql(key)} > ${String(value)}`;
    }

    throw new Error(`$gt operator is not supported for key: ${key}`);
  }

  private getGteStatement(payload: {
    sql: postgres.Sql;
    key: string;
    value: string | Date;
  }) {
    const { sql, key, value } = payload;

    if (key === "timestamp") {
      const dateValue = value instanceof Date ? value : new Date(value);
      return sql`${sql(key)} >= ${dateValue}`;
    }

    if (key === "id") {
      return sql`${sql(key)} >= ${String(value)}`;
    }

    throw new Error(`$gte operator is not supported for key: ${key}`);
  }

  private getLtStatement(payload: {
    sql: postgres.Sql;
    key: string;
    value: string | Date;
  }) {
    const { sql, key, value } = payload;

    if (key === "timestamp") {
      const dateValue = value instanceof Date ? value : new Date(value);
      return sql`${sql(key)} < ${dateValue}`;
    }

    if (key === "id") {
      return sql`${sql(key)} < ${String(value)}`;
    }

    throw new Error(`$lt operator is not supported for key: ${key}`);
  }

  private getLteStatement(payload: {
    sql: postgres.Sql;
    key: string;
    value: string | Date;
  }) {
    const { sql, key, value } = payload;

    if (key === "timestamp") {
      const dateValue = value instanceof Date ? value : new Date(value);
      return sql`${sql(key)} <= ${dateValue}`;
    }

    if (key === "id") {
      return sql`${sql(key)} <= ${String(value)}`;
    }

    throw new Error(`$lte operator is not supported for key: ${key}`);
  }

  private getBetweenStatement(payload: {
    sql: postgres.Sql;
    key: string;
    values: [string | Date, string | Date];
  }) {
    const { sql, key, values } = payload;
    const [start, end] = values;

    if (key === "timestamp") {
      const startDate = start instanceof Date ? start : new Date(start);
      const endDate = end instanceof Date ? end : new Date(end);
      return sql`${sql(key)} >= ${startDate}::timestamptz AND ${sql(key)} <= ${endDate}::timestamptz`;
    }

    if (key === "id") {
      return sql`${sql(key)} >= ${String(start)} AND ${sql(key)} <= ${String(end)}`;
    }

    throw new Error(`$between operator is not supported for key: ${key}`);
  }

  private getPropertySatetment(payload: {
    sql: postgres.Sql;
    key: string;
    property: QueryProperty;
  }) {
    const { sql, key, property } = payload;

    if (typeof property === "string") {
      return this.getEqStatement({ sql, key, value: property });
    }

    if ("$in" in property && property.$in) {
      return this.getInStatement({ sql, key, values: property.$in });
    }

    if ("$eq" in property && property.$eq) {
      return this.getEqStatement({ sql, key, value: property.$eq });
    }

    if ("$gt" in property && property.$gt !== undefined) {
      return this.getGtStatement({ sql, key, value: property.$gt });
    }

    if ("$gte" in property && property.$gte !== undefined) {
      return this.getGteStatement({ sql, key, value: property.$gte });
    }

    if ("$lt" in property && property.$lt !== undefined) {
      return this.getLtStatement({ sql, key, value: property.$lt });
    }

    if ("$lte" in property && property.$lte !== undefined) {
      return this.getLteStatement({ sql, key, value: property.$lte });
    }

    if ("$between" in property && property.$between) {
      return this.getBetweenStatement({ sql, key, values: property.$between });
    }

    throw new Error(`Unsupported QueryProperty for key: ${key}`);
  }

  private getPropertiesAndStatement(payload: {
    sql: postgres.Sql;
    data: QueryAble;
  }) {
    const { sql, data } = payload;
    const statements: any[] = [];

    if (data.id) {
      statements.push(
        this.getPropertySatetment({
          sql: this.sql,
          key: "id",
          property: data.id
        })
      );
    }

    if (data.type) {
      statements.push(
        this.getPropertySatetment({
          sql: this.sql,
          key: "type",
          property: data.type
        })
      );
    }

    if (data.timestamp) {
      statements.push(
        this.getPropertySatetment({
          sql: this.sql,
          key: "timestamp",
          property: data.timestamp
        })
      );
    }

    if (data.identifiers) {
      statements.push(sql`identifier @> ${sql.json(data.identifiers)}`);
    }

    if (statements.length === 0) {
      return sql`TRUE`;
    }

    const res = statements.reduce((acc, statement, index) => {
      if (index === 0) {
        return statement;
      }
      return sql`${acc} AND ${statement}`;
    });
    return sql`(${res})`;
  }

  private getOrStatement(payload: { sql: postgres.Sql; data: QueryOr }) {
    const { sql, data } = payload;

    const statements = data.map((item) => {
      return this.getPropertiesAndStatement({ sql, data: item });
    });

    return statements.reduce((acc, statement, index) => {
      if (index === 0) {
        return statement;
      }
      return sql`(${acc} OR ${statement})`;
    });
  }

  private getWhereStatement(where: Query["$where"], sql: postgres.Sql) {
    const keys = Object.keys(where);

    const hasOr = keys.includes("$or");
    const hasAnd = keys.includes("$and");

    if (!hasOr && !hasAnd) {
      return this.getPropertiesAndStatement({
        sql,
        data: where as QueryAble
      });
    }

    if (hasOr) {
      return this.getOrStatement({
        sql,
        data: (where as { $or: QueryOr }).$or!
      });
    }
  }
  // --- $Where to sql statements END

  async getEventsByQuery(query: Query, sql = this.sql) {
    const whereStatement = this.getWhereStatement(query.$where, sql);

    const rows = await sql`
      SELECT * FROM ${this.streamNameIdentifier}
      WHERE ${whereStatement} 
      ORDER BY id ASC;
    `;

    return rows as PersistedEvent[];
  }

  // TODO: add the advisory lock
  private async appendEventWithoutQuery(sourcingEvent: ToPersistEvent) {
    const id = await this.sql.begin(async (sql) => {
      await sql`
          LOCK TABLE ${this.streamNameIdentifier} IN SHARE ROW EXCLUSIVE MODE;
        `;

      const res = await sql`
          INSERT INTO ${this.streamNameIdentifier} (id, type, data, identifier)
          VALUES (${sourcingEvent.id}, ${sourcingEvent.type}, ${sourcingEvent.data}, ${sourcingEvent.identifier})
          RETURNING *
        `;

      return res[0].id;
    });
    return id as string;
  }

  private async appendEventWithQuery(payload: {
    sourcingEvent: ToPersistEvent;
    query: Query;
    lastKnownEventId: EventId;
    _testOnlyOnLockAcquired?: () => Promise<void> | void;
  }) {
    const { query, sourcingEvent, lastKnownEventId, _testOnlyOnLockAcquired } =
      payload;

    const locks = this._buildAdvisoryLocks({ query });

    return await this.sql.begin(async (sql) => {
      for (const lock of locks) {
        // if (_testOnlyOnLockAcquired) {
        //   console.log(
        //     `[${new Date().toISOString()}][${
        //       sourcingEvent.type
        //     }] Acquiring lock ${lock.key}`
        //   );
        // }

        await sql`
          SELECT pg_advisory_xact_lock(${lock.hash})
        `;
      }

      if (_testOnlyOnLockAcquired) {
        // console.log(
        //   `[${new Date().toISOString()}][${
        //     sourcingEvent.type
        //   }] Lock acquired`
        // );
        await _testOnlyOnLockAcquired();
        await new Promise((resolve) => setTimeout(resolve, 100));
        // console.log(
        //   `[${new Date().toISOString()}][${
        //     sourcingEvent.type
        //   }] Starting transaction`
        // );
      }

      const whereStatement = this.getWhereStatement(query.$where, sql);

      const [lastEvent] = await sql`
        SELECT id FROM ${this.streamNameIdentifier}
        WHERE ${whereStatement}
        ORDER BY id DESC
        LIMIT 1
      `;

      if (lastEvent?.id !== lastKnownEventId) {
        throw new Error(
          `Concurrency conflict detected: lastKnownEventId "${lastKnownEventId}" differs from the last event "${lastEvent.id}"`
        );
      }

      const result = await sql`
        INSERT INTO ${this.streamNameIdentifier} (id, type, data, identifier)
        VALUES (${sourcingEvent.id}, ${sourcingEvent.type}, ${sourcingEvent.data}, ${sourcingEvent.identifier})
        RETURNING id
      `;

      return result[0].id as string;
    });
  }

  async appendEvent(payload: AppendEventPayload) {
    if (!("query" in payload)) {
      return this.appendEventWithoutQuery(payload.sourcingEvent);
    }

    return this.appendEventWithQuery(payload);
  }

  private async createProjectionsMetaTable() {
    const metaTableName = `${this.streamName}_projections_meta`;
    await this.sql`
      CREATE TABLE IF NOT EXISTS ${this.sql(metaTableName)} (
        name text PRIMARY KEY,
        schema jsonb NOT NULL,
        reducers jsonb NOT NULL DEFAULT '{}',
        created_at timestamp DEFAULT NOW(),
        updated_at timestamp DEFAULT NOW()
      )
    `;
  }

  private mapColumnTypeToPostgres(type: string): string {
    const typeMap: Record<string, string> = {
      text: "text",
      integer: "integer",
      bigint: "bigint",
      boolean: "boolean",
      timestamp: "timestamp with time zone",
      jsonb: "jsonb",
      numeric: "numeric",
      ulid: "char(26)"
    };
    return typeMap[type] || "text";
  }

  private async createProjectionTable(name: string, schema: ProjectionSchema) {
    const tableName = `${this.streamName}_projection_${name.replace(/-/g, "_")}`;

    const primaryKeys = Object.entries(schema)
      .filter(([, definition]) => definition.primaryKey)
      .map(([columnName]) => columnName);

    if (primaryKeys.length === 0) {
      throw new Error(
        `Projection "${name}" must have at least one primary key column`
      );
    }

    const columnDefinitions = Object.entries(schema)
      .map(([columnName, definition]) => {
        const postgresType = this.mapColumnTypeToPostgres(definition.type);
        const nullable = definition.nullable !== false ? "" : " NOT NULL";
        let defaultClause = "";
        if (definition.default !== undefined) {
          if (typeof definition.default === "string") {
            defaultClause = ` DEFAULT '${definition.default.replace(/'/g, "''")}'`;
          } else if (typeof definition.default === "boolean") {
            defaultClause = ` DEFAULT ${definition.default}`;
          } else if (typeof definition.default === "number") {
            defaultClause = ` DEFAULT ${definition.default}`;
          }
        }
        return `"${columnName}" ${postgresType}${nullable}${defaultClause}`;
      })
      .join(", ");

    const primaryKeyConstraint = `PRIMARY KEY (${primaryKeys.map((k) => `"${k}"`).join(", ")})`;

    await this.sql.unsafe(`
      CREATE TABLE IF NOT EXISTS ${tableName} (
        ${columnDefinitions},
        ${primaryKeyConstraint}
      )
    `);

    for (const [columnName, definition] of Object.entries(schema)) {
      if (definition.index) {
        const indexName = `${tableName}_${columnName}_index`;
        const indexType = definition.index;
        await this.sql.unsafe(`
          CREATE INDEX IF NOT EXISTS ${indexName}
          ON ${tableName} USING ${indexType} ("${columnName}")
        `);
      }
    }
  }

  async createProjection(declaration: ProjectionDeclaration) {
    await this._readyPromise;
    const { name, schema } = declaration;

    if (this._projectionRegistry.has(name)) {
      throw new Error(`Projection "${name}" already exists`);
    }

    await this.createProjectionTable(name, schema);

    const metaTableName = `${this.streamName}_projections_meta`;
    await this.sql`
      INSERT INTO ${this.sql(metaTableName)} (name, schema, reducers)
      VALUES (${name}, ${this.sql.json(schema)}, '{}')
      ON CONFLICT (name) DO UPDATE SET
        schema = EXCLUDED.schema,
        updated_at = NOW()
    `;

    this._projectionRegistry.set(name, {
      schema,
      reducers: new Map()
    });
  }

  async queryProjection(
    name: string,
    options?: { where?: Record<string, any> }
  ): Promise<any[]> {
    const tableName = `${this.streamName}_projection_${name.replace(/-/g, "_")}`;

    if (options?.where) {
      const whereConditions = Object.entries(options.where)
        .map(([key, value]) => {
          return this.sql`${this.sql(key)} = ${value}`;
        })
        .reduce((acc, condition) => this.sql`${acc} AND ${condition}`);

      return this
        .sql`SELECT * FROM ${this.sql(tableName)} WHERE ${whereConditions}`;
    }

    return this.sql`SELECT * FROM ${this.sql(tableName)}`;
  }

  async dropProjection(name: string) {
    await this._readyPromise;
    if (!this._projectionRegistry.has(name)) {
      throw new Error(`Projection "${name}" does not exist`);
    }

    const projection = this._projectionRegistry.get(name);
    const eventTypes = Array.from(projection!.reducers.keys());

    const tableName = `${this.streamName}_projection_${name.replace(/-/g, "_")}`;

    await this.sql`DROP TABLE IF EXISTS ${this.sql(tableName)} CASCADE`;

    const metaTableName = `${this.streamName}_projections_meta`;
    await this.sql`
      DELETE FROM ${this.sql(metaTableName)}
      WHERE name = ${name}
    `;

    this._projectionRegistry.delete(name);

    for (const eventType of eventTypes) {
      await this.createOrUpdateEventTypeTrigger(eventType);
    }
  }

  async setEventReducingToProjection(payload: {
    name: string;
    eventType: string;
    reducer: EventReducer;
    refreshProjection?: boolean;
  }) {
    await this._readyPromise;

    const { name, eventType, reducer, refreshProjection } = payload;

    const projection = this._projectionRegistry.get(name);
    if (!projection) {
      throw new Error(`Projection "${name}" does not exist`);
    }

    projection.reducers.set(eventType, reducer);

    const tableName = `${this.streamName}_projection_${name.replace(/-/g, "_")}`;
    const mockSql = this.createMockSqlFunction();
    const result = reducer(mockSql, tableName) as any;

    if (result && typeof result === "object" && result.__mockSQL) {
      const sqlString = result.__mockSQL as string;
      const metaTableName = `${this.streamName}_projections_meta`;

      await this.sql`
        UPDATE ${this.sql(metaTableName)}
        SET reducers = jsonb_set(reducers, ${`{${eventType}}`}, ${this.sql.json(sqlString)})
        WHERE name = ${name}
      `;
    }

    await this.createOrUpdateEventTypeTrigger(eventType);

    if (refreshProjection) {
      await this.refreshProjection(name);
    }
  }

  async refreshProjection(name: string) {
    await this._readyPromise;

    const projection = this._projectionRegistry.get(name);
    if (!projection) {
      throw new Error(`Projection "${name}" does not exist`);
    }

    const eventTypes = Array.from(projection.reducers.keys());
    if (eventTypes.length === 0) {
      return;
    }

    const tableName = `${this.streamName}_projection_${name.replace(/-/g, "_")}`;

    await this.sql.begin(async (sql) => {
      await sql`TRUNCATE TABLE ${sql(tableName)}`;

      const events = await sql`
        SELECT * FROM ${sql(this.streamName)}
        WHERE type = ANY(${eventTypes})
        ORDER BY id
      `;

      for (const event of events) {
        const reducer = projection.reducers.get(event.type);
        if (!reducer) {
          continue;
        }

        const mockSql = this.createMockSqlFunction();
        const result = reducer(mockSql, tableName) as any;

        if (!result || typeof result !== "object" || !result.__mockSQL) {
          throw new Error(
            `Reducer for event type "${event.type}" in projection "${name}" did not return a valid SQL query`
          );
        }

        const reducerSQL = result.__mockSQL as string;

        const eventTypeEscaped = event.type.replace(/'/g, "''");
        const eventDataJson = JSON.stringify(event.data).replace(/'/g, "''");
        const eventIdentifierJson = JSON.stringify(event.identifier).replace(
          /'/g,
          "''"
        );
        const eventIdEscaped = event.id.replace(/'/g, "''");

        await sql.unsafe(`
          DO $$
          DECLARE
            NEW RECORD;
          BEGIN
            SELECT 
              '${eventTypeEscaped}'::text as type,
              '${eventDataJson}'::jsonb as data,
              '${eventIdentifierJson}'::jsonb as identifier,
              '${eventIdEscaped}'::text as id
            INTO NEW;
            
            ${reducerSQL};
          END $$;
        `);
      }
    });
  }

  async updateProjection(payload: {
    name: string;
    alterationSQL: (
      sql: postgres.Sql,
      tableName: string
    ) => postgres.PendingQuery<postgres.Row[]>;
  }) {
    await this._readyPromise;
    const { name, alterationSQL } = payload;

    const projection = this._projectionRegistry.get(name);
    if (!projection) {
      throw new Error(`Projection "${name}" does not exist`);
    }

    const tableName = `${this.streamName}_projection_${name.replace(/-/g, "_")}`;
    await alterationSQL(this.sql, tableName);

    const metaTableName = `${this.streamName}_projections_meta`;
    await this.sql`
      UPDATE ${this.sql(metaTableName)}
      SET updated_at = NOW()
      WHERE name = ${name}
    `;
  }

  private createMockSqlFunction(): any {
    const mockSql: any = (strings: TemplateStringsArray, ...values: any[]) => {
      let sql = "";
      for (let i = 0; i < strings.length; i++) {
        sql += strings[i];
        if (i < values.length) {
          const value = values[i];
          if (typeof value === "string") {
            sql += value;
          } else if (typeof value === "number" || typeof value === "boolean") {
            sql += value;
          } else if (value === null) {
            sql += "NULL";
          } else {
            sql += String(value);
          }
        }
      }
      return { __mockSQL: sql };
    };

    mockSql.__isIdentifier = false;

    return new Proxy(mockSql, {
      apply: (target, _thisArg, args) => {
        if (args[0] && typeof args[0] === "object" && args[0].raw) {
          return target(args[0], ...args.slice(1));
        } else if (typeof args[0] === "string") {
          return args[0];
        }
        return target(...args);
      }
    });
  }

  private createReducerFromSQL(sqlString: string): EventReducer {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    return (_sql: postgres.Sql, _tableName: string) => {
      return { __mockSQL: sqlString } as any as postgres.PendingQuery<
        postgres.Row[]
      >;
    };
  }

  private async loadProjectionsFromDatabase(): Promise<void> {
    const metaTableName = `${this.streamName}_projections_meta`;

    try {
      const projections = await this.sql`
        SELECT name, schema, reducers FROM ${this.sql(metaTableName)}
      `;

      for (const proj of projections) {
        const reducersMap = new Map<string, EventReducer>();

        for (const [eventType, sqlString] of Object.entries(proj.reducers)) {
          reducersMap.set(
            eventType,
            this.createReducerFromSQL(sqlString as string)
          );
        }

        this._projectionRegistry.set(proj.name, {
          schema: proj.schema,
          reducers: reducersMap
        });
      }
    } catch (error: any) {
      if (error.code !== "42P01") {
        throw error;
      }
    }
  }

  private async createOrUpdateEventTypeTrigger(eventType: string) {
    await this._readyPromise;
    const projectionsForEvent: Array<{
      name: string;
      reducer: EventReducer;
      schema: ProjectionSchema;
    }> = [];

    for (const [projectionName, projection] of this._projectionRegistry) {
      const reducer = projection.reducers.get(eventType);
      if (reducer) {
        projectionsForEvent.push({
          name: projectionName,
          reducer,
          schema: projection.schema
        });
      }
    }

    if (projectionsForEvent.length === 0) {
      await this.dropEventTypeTrigger(eventType);
      return;
    }

    const functionName = `${this.streamName}_${eventType.replace(/-/g, "_")}_projection_handler`;
    const triggerName = `${this.streamName}_${eventType.replace(/-/g, "_")}_projection_trigger`;

    let functionBody = "";

    for (const projection of projectionsForEvent) {
      const tableName = `${this.streamName}_projection_${projection.name.replace(/-/g, "_")}`;

      const mockSql = this.createMockSqlFunction();
      const result = projection.reducer(mockSql, tableName) as any;

      if (!result || typeof result !== "object" || !result.__mockSQL) {
        throw new Error(
          `Reducer for ${projection.name} did not return a valid SQL query`
        );
      }

      const sqlStatement = result.__mockSQL as string;
      functionBody += `  ${sqlStatement};\n`;
    }

    const functionSQL = `
      CREATE OR REPLACE FUNCTION ${functionName}()
      RETURNS TRIGGER AS $$
      BEGIN 
        ${functionBody}
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `;

    await this.sql.unsafe(functionSQL);

    await this.sql`
      DROP TRIGGER IF EXISTS ${this.sql(triggerName)} ON ${this.streamNameIdentifier}
    `;

    await this.sql.unsafe(`
      CREATE TRIGGER ${triggerName}
      AFTER INSERT ON ${this.streamName}
      FOR EACH ROW
      WHEN (NEW.type = '${eventType}')
      EXECUTE FUNCTION ${functionName}();
    `);
  }

  private async dropEventTypeTrigger(eventType: string) {
    const functionName = `${this.streamName}_${eventType.replace(/-/g, "_")}_projection_handler`;
    const triggerName = `${this.streamName}_${eventType.replace(/-/g, "_")}_projection_trigger`;

    await this.sql`
      DROP TRIGGER IF EXISTS ${this.sql(triggerName)} ON ${this.streamNameIdentifier}
    `;

    await this.sql.unsafe(`
      DROP FUNCTION IF EXISTS ${functionName}();
    `);
  }
}
