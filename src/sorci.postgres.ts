import postgres from "postgres";
import { EventId, Sorci, Query, ToPersistEvent } from "./sorci.interface";
import { shortId } from "./common/utils";

export class SorciPostgres implements Sorci {
  private _sql;
  private _streamName: string;

  constructor(
    host: string,
    port: number,
    user: string,
    password: string,
    databaseName: string,
    streamName: string
  ) {
    this._streamName = streamName;

    this._sql = postgres({
      host,
      port,
      database: databaseName,
      username: user,
      password,
    });
  }

  // Making them readonly outside of the instance
  get sql() {
    return this._sql;
  }

  get streamName() {
    return this._streamName;
  }

  /* Getter from stream name to be able to clean every test stream easily */
  private getStreamNameWritable(streamName: string) {
    return `${streamName}_writable`;
  }

  private getStreamNameReadOnly(streamName: string) {
    return `${streamName}_readonly`;
  }

  // For now it only synchronize insert, might need to rename to something more specific
  private getSyncronizationFunctionName(streamName: string) {
    const streamNameWritable = this.getStreamNameWritable(streamName);
    return `sync_row_${streamNameWritable}_to_readonly`;
  }

  // Trigger for insert only, might need to rename to something more specific
  private getSyncronizationTriggerName(streamName: string) {
    const streamNameWritable = this.getStreamNameWritable(streamName);
    return `trigger_from_${streamNameWritable}_to_sync_read`;
  }

  /* Simple strings */
  get streamNameWritable() {
    return this.getStreamNameWritable(this.streamName);
  }

  get streamNameReadOnly() {
    return this.getStreamNameReadOnly(this.streamName);
  }

  get syncronizationFunctionName() {
    return this.getSyncronizationFunctionName(this.streamName);
  }

  get syncronizationTriggerName() {
    return this.getSyncronizationTriggerName(this.streamName);
  }

  /* Identifiers based on the simple strings */
  get streamNameWritableIdentifier() {
    return this.sql(this.streamNameWritable);
  }

  get streamNameReadOnlyIdentifier() {
    return this.sql(this.streamNameReadOnly);
  }

  get syncronizationFunctionNameIdentifier() {
    return this.sql(this.syncronizationFunctionName);
  }

  get syncronizationTriggerNameIdentifier() {
    return this.sql(this.syncronizationTriggerName);
  }

  async createBasicTable(tableName: string) {
    await this.sql.begin(async (sql) => {
      const currentTableIdentifier = sql(tableName);

      const isUuidExtensionLoaded = !!(
        await sql`SELECT * FROM pg_extension WHERE extname = 'uuid-ossp'`
      ).length;
      if (!isUuidExtensionLoaded) {
        await sql`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`;
      }

      await sql`
        CREATE TABLE IF NOT EXISTS ${currentTableIdentifier} (
          id text PRIMARY KEY DEFAULT uuid_generate_v4(),
          type text NOT NULL,
          data JSONB NOT NULL,
          identifier JSONB NOT NULL,
          timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        );
      `;

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

  async createSyncronizationPgFunction() {
    await this.sql`
      CREATE OR REPLACE FUNCTION ${this.syncronizationFunctionNameIdentifier}()
      RETURNS TRIGGER AS $$
      BEGIN
        INSERT INTO ${this.streamNameReadOnlyIdentifier} (id, type, data, identifier)
        VALUES (NEW.id, NEW.type, NEW.data, NEW.identifier);
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
   `;
  }

  async createSyncronizationTrigger() {
    await this.sql`
      CREATE TRIGGER ${this.syncronizationTriggerNameIdentifier} 
      AFTER INSERT ON ${this.streamNameWritableIdentifier} 
      FOR EACH ROW
      EXECUTE FUNCTION ${this.syncronizationFunctionNameIdentifier}()
    `;
  }

  async createStream() {
    await this.createBasicTable(this.streamNameWritable);
    await this.createBasicTable(this.streamNameReadOnly);
    await this.createSyncronizationPgFunction();
    await this.createSyncronizationTrigger();
  }

  async setupTestStream(streamName?: string) {
    this._streamName = streamName || `test_${shortId()}`;

    await this.createStream();
  }

  async cleanStream(streamName: string) {
    return this.sql.begin(async (sql) => {
      const syncronizationTriggerNameIdentifier = sql(
        this.getSyncronizationTriggerName(streamName)
      );
      const syncronizationFunctionNameIdentifier = sql(
        this.getSyncronizationFunctionName(streamName)
      );
      const streamNameReadOnlyIdentifier = sql(
        this.getStreamNameReadOnly(streamName)
      );
      const streamNameWritableIdentifier = sql(
        this.getStreamNameWritable(streamName)
      );
      await sql`
        DROP TRIGGER IF EXISTS ${syncronizationTriggerNameIdentifier} ON ${streamNameWritableIdentifier} 
      `;
      await sql`
        DROP FUNCTION IF EXISTS ${syncronizationFunctionNameIdentifier}()
      `;
      await sql`
        DROP TABLE IF EXISTS ${streamNameReadOnlyIdentifier} 
      `;
      await sql`
        DROP TABLE IF EXISTS ${streamNameWritableIdentifier} 
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
    await this.sql.begin(async (sql) => {
      await sql`
        TRUNCATE TABLE ${this.streamNameWritableIdentifier}
      `;

      await sql`
        TRUNCATE TABLE ${this.streamNameReadOnlyIdentifier}
      `;
    });
  }

  async insertEvents(events: Array<ToPersistEvent>) {
    const res = (await this.sql`
      INSERT INTO ${this.streamNameWritableIdentifier} ${this.sql(events)}
      RETURNING id
    `) as Array<{ id: string }>;

    return res.map((resItem) => resItem.id);
  }

  private getWhereStatement(sql: postgres.Sql, query: Query) {
    const { identifiers, types } = query;
    const hasIdentifier = !!identifiers?.length;
    const hasType = !!types?.length;

    const containIdentifier = hasIdentifier
      ? //@ts-expect-error don't know why but there is a typing issue here
        sql`identifier @> ANY (${query.identifiers!}::jsonb[])`
      : sql``;

    const containType = hasType
      ? sql`type = ANY ( ${query.types!}::text[])`
      : sql``;
    const and = hasType && hasIdentifier ? sql`AND` : sql``;

    return sql`
      WHERE ${containIdentifier} ${and} ${containType}
    `;
  }

  async getEventById(id: EventId) {
    const res = await this.sql`
      SELECT * FROM ${this.streamNameWritableIdentifier} WHERE id = ${id} LIMIT 1;
    `;

    const rawEvent = res[0];
    if (!rawEvent) return;

    return {
      id: rawEvent.id,
      type: rawEvent.type,
      data: rawEvent.data,
      identifier: rawEvent.identifier,
      timestamp: rawEvent.timestamp,
    };
  }

  async getEventsByQuery(query: Query) {
    const whereStatement = this.getWhereStatement(this.sql, query);

    const rows = await this.sql`
      SELECT * FROM ${this.streamNameReadOnlyIdentifier}
      ${whereStatement}
      ORDER BY ctid ASC;
    `;

    if (!rows?.length) return [];

    //TODO: check if map is really needed
    return rows.map((rawEvent: any) => {
      return {
        id: rawEvent.id,
        type: rawEvent.type,
        data: rawEvent.data,
        identifier: rawEvent.identifier,
        timestamp: rawEvent.timestamp,
      };
    });
  }

  async appendEvent(
    payload:
      | {
          sourcingEvent: ToPersistEvent;
        }
      | {
          sourcingEvent: ToPersistEvent;
          query: Query;
          eventIdentifier: string;
        }
  ) {
    //@ts-expect-error typing issue
    if (!payload.query) {
      const eventId = await this.appendEventWithoutQuery(payload.sourcingEvent);
      return eventId;
    }

    const id = await this.appendEventWithQuery(
      payload as {
        sourcingEvent: ToPersistEvent;
        query: Query;
        eventIdentifier: string;
      }
    );

    return id;
  }

  private async appendEventWithQuery(payload: {
    sourcingEvent: ToPersistEvent;
    query: Query;
    eventIdentifier: string;
  }) {
    const eventPersistedId = await this.sql.begin(async (sql) => {
      await sql`
        LOCK TABLE ${this.streamNameWritableIdentifier} IN EXCLUSIVE MODE;
      `;

      // TODO: rename in a way that remove the "aggregate" word
      const lastEventIdentifierRaw = await sql`
          SELECT id as last_event_identifier
          FROM ${this.streamNameWritableIdentifier}
          ${this.getWhereStatement(sql, payload.query)}
          ORDER BY ctid DESC 
          LIMIT 1
        `;

      if (
        !lastEventIdentifierRaw.length ||
        !lastEventIdentifierRaw[0].last_event_identifier
      ) {
        throw new Error("Aggregate not found");
      }

      const lastEventIdentifier =
        lastEventIdentifierRaw[lastEventIdentifierRaw.length - 1]
          .last_event_identifier;

      if (lastEventIdentifier === payload.eventIdentifier) {
        const res = await sql`
          INSERT INTO ${this.streamNameWritableIdentifier} (id, type, data, identifier)
          VALUES (${payload.sourcingEvent.id}, ${payload.sourcingEvent.type}, ${payload.sourcingEvent.data}, ${payload.sourcingEvent.identifier})
          RETURNING *
        `;

        return res[0].id as string;
      } else {
        throw new Error(
          `Event Identifier mismatch, given: ${payload.eventIdentifier}, found: ${lastEventIdentifier}`
        );
      }
    });
    return eventPersistedId;
  }

  private async appendEventWithoutQuery(sourcingEvent: ToPersistEvent) {
    const id = await this.sql.begin(async (sql) => {
      await sql`
          LOCK TABLE ${this.streamNameWritableIdentifier} IN EXCLUSIVE MODE;
        `;

      const res = await sql`
          INSERT INTO ${this.streamNameWritableIdentifier} (id, type, data, identifier)
          VALUES (${sourcingEvent.id}, ${sourcingEvent.type}, ${sourcingEvent.data}, ${sourcingEvent.identifier})
          RETURNING *
        `;

      return res[0].id;
    });
    return id as string;
  }
}
