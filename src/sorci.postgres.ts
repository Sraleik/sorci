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
  PersistedEvent
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
          console.log(notice);
        }
      });
    } else {
      this._sql = postgres(payload.connectionString);
    }
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
  }

  async setupTestStream(streamName?: string) {
    this._streamName = streamName || `test_${shortId()}`;

    await this.createStream();
  }

  async cleanStream(streamName: string) {
    return this.sql.begin(async (sql) => {
      await sql`
        DROP TABLE IF EXISTS ${sql(streamName)} 
      `;
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
      ${excludeStatement}
    `;

    const streamNames = rawTableNames.map(({ table_name }) => {
      const realTableName = table_name.split("_");
      realTableName.pop();
      return realTableName.join("_");
    }) as Array<string>;

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

    //TODO user @> '{"listId": "uuid"}'
    // beter performance with GIN index
    return sql`identifier->>${key} = ${value}`;
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

    if ("$in" in property) {
      return this.getInStatement({ sql, key, values: property.$in! });
    }
    return this.getEqStatement({ sql, key, value: property.$eq! });
  }

  private getPropertiesAndStatement(payload: {
    sql: postgres.Sql;
    data: QueryAble;
  }) {
    const { sql, data } = payload;
    const statements: any[] = [];

    if (data.type) {
      statements.push(
        this.getPropertySatetment({
          sql: this.sql,
          key: "type",
          property: data.type
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
}
