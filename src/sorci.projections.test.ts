import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer
} from "@testcontainers/postgresql";
import {
  describe,
  test,
  expect,
  beforeAll,
  beforeEach,
  afterEach,
  afterAll
} from "vitest";
import { Sorci } from "./sorci.interface";
import { SorciPostgres } from "./sorci.postgres";

let pgInstance: StartedPostgreSqlContainer;
let sorci: Sorci;

beforeAll(async () => {
  const pgInstanceNotReady = new PostgreSqlContainer("postgres:18-alpine");
  pgInstance = await pgInstanceNotReady.start();

  const host = pgInstance.getHost();
  const port = pgInstance.getPort();
  const user = pgInstance.getUsername();
  const password = pgInstance.getPassword();
  const databaseName = pgInstance.getDatabase();

  sorci = new SorciPostgres({
    host,
    port,
    user,
    password,
    databaseName,
    streamName: "useless_stream_name"
  });
}, 30000);

beforeEach(async () => {
  await sorci.setupTestStream();
});

afterEach(async () => {
  await sorci.dropCurrentStream();
});

afterAll(async () => {
  await sorci.close();
  await pgInstance.stop();
});

describe("Projections", () => {
  describe("declareProjection", () => {
    test("creates table with correct schema, columns, primary keys and indexes", async () => {
      await sorci.declareProjection({
        name: "user-profile",
        query: { $where: { type: { $in: ["user-created"] } } },
        schema: {
          userId: { type: "text", primaryKey: true },
          email: { type: "text", index: "btree" },
          displayName: { type: "text" },
          metadata: { type: "jsonb", index: "gin" }
        }
      });

      const rows = await sorci.queryProjection("user-profile");
      expect(rows).toEqual([]);

      const sorciPostgres = sorci as SorciPostgres;
      const sql = (sorciPostgres as any).sql;
      const streamName = (sorciPostgres as any).streamName;

      const tableName = `${streamName}_projection_user_profile`;

      const columns = await sql`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = ${tableName}
        ORDER BY ordinal_position
      `;

      expect(columns.map((col: any) => col.column_name)).toEqual([
        "userId",
        "email",
        "displayName",
        "metadata"
      ]);

      const userIdColumn = columns.find(
        (col: any) => col.column_name === "userId"
      );
      expect(userIdColumn.data_type).toBe("text");

      const emailColumn = columns.find(
        (col: any) => col.column_name === "email"
      );
      expect(emailColumn.data_type).toBe("text");

      const displayNameColumn = columns.find(
        (col: any) => col.column_name === "displayName"
      );
      expect(displayNameColumn.data_type).toBe("text");

      const metadataColumn = columns.find(
        (col: any) => col.column_name === "metadata"
      );
      expect(metadataColumn.data_type).toBe("jsonb");

      const primaryKeyConstraints = await sql`
        SELECT a.attname
        FROM pg_index i
        JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
        WHERE i.indrelid = ${tableName}::regclass
        AND i.indisprimary
      `;

      expect(primaryKeyConstraints.map((pk: any) => pk.attname)).toEqual([
        "userId"
      ]);

      const indexes = await sql`
        SELECT
          i.relname as index_name,
          a.attname as column_name,
          am.amname as index_type
        FROM pg_class t
        JOIN pg_index ix ON t.oid = ix.indrelid
        JOIN pg_class i ON i.oid = ix.indexrelid
        JOIN pg_am am ON i.relam = am.oid
        JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
        WHERE t.relname = ${tableName}
        AND NOT ix.indisprimary
      `;

      const emailIndex = indexes.find(
        (idx: any) => idx.column_name === "email"
      );
      expect(emailIndex).toBeDefined();
      expect(emailIndex.index_type).toBe("btree");

      const metadataIndex = indexes.find(
        (idx: any) => idx.column_name === "metadata"
      );
      expect(metadataIndex).toBeDefined();
      expect(metadataIndex.index_type).toBe("gin");
    });
  });

  describe("dropProjection", () => {
    test("removes table, meta entry, and registry", async () => {
      await sorci.declareProjection({
        name: "user-profile",
        query: { $where: { type: { $in: ["user-created"] } } },
        schema: {
          userId: { type: "text", primaryKey: true },
          email: { type: "text" }
        }
      });

      const rows = await sorci.queryProjection("user-profile");
      expect(rows).toEqual([]);

      await sorci.dropProjection("user-profile");

      const sorciPostgres = sorci as SorciPostgres;
      const sql = (sorciPostgres as any).sql;
      const streamName = (sorciPostgres as any).streamName;
      const tableName = `${streamName}_projection_user_profile`;

      const tableExists = await sql`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = ${tableName}
        )
      `;

      expect(tableExists[0].exists).toBe(false);

      const metaTableName = `${streamName}_projections_meta`;
      const metaRows = await sql`
        SELECT * FROM ${sql(metaTableName)}
        WHERE name = 'user-profile'
      `;

      expect(metaRows).toHaveLength(0);

      await expect(sorci.queryProjection("user-profile")).rejects.toThrow();
    });

    test("throws error when projection does not exist", async () => {
      await expect(
        sorci.dropProjection("non-existent-projection")
      ).rejects.toThrow('Projection "non-existent-projection" does not exist');
    });
  });

  describe("queryProjection", () => {
    test("retrieves data from projection table", async () => {
      await sorci.declareProjection({
        name: "user-profile",
        query: { $where: { type: { $in: ["user-created"] } } },
        schema: {
          userId: { type: "text", primaryKey: true },
          email: { type: "text" },
          displayName: { type: "text" }
        }
      });

      const sorciPostgres = sorci as SorciPostgres;
      const sql = (sorciPostgres as any).sql;
      const streamName = (sorciPostgres as any).streamName;
      const tableName = `${streamName}_projection_user_profile`;

      await sql`
        INSERT INTO ${sql(tableName)} ("userId", "email", "displayName")
        VALUES 
          ('user-1', 'alice@example.com', 'Alice'),
          ('user-2', 'bob@example.com', 'Bob'),
          ('user-3', 'charlie@example.com', 'Charlie')
      `;

      const allRows = await sorci.queryProjection("user-profile");
      expect(allRows).toHaveLength(3);
      expect(allRows[0]).toEqual({
        userId: "user-1",
        email: "alice@example.com",
        displayName: "Alice"
      });
      expect(allRows[1]).toEqual({
        userId: "user-2",
        email: "bob@example.com",
        displayName: "Bob"
      });
      expect(allRows[2]).toEqual({
        userId: "user-3",
        email: "charlie@example.com",
        displayName: "Charlie"
      });
    });

    test("queries projection with where clause", async () => {
      await sorci.declareProjection({
        name: "user-profile",
        query: { $where: { type: { $in: ["user-created"] } } },
        schema: {
          userId: { type: "text", primaryKey: true },
          email: { type: "text" },
          displayName: { type: "text" }
        }
      });

      const sorciPostgres = sorci as SorciPostgres;
      const sql = (sorciPostgres as any).sql;
      const streamName = (sorciPostgres as any).streamName;
      const tableName = `${streamName}_projection_user_profile`;

      await sql`
        INSERT INTO ${sql(tableName)} ("userId", "email", "displayName")
        VALUES 
          ('user-1', 'alice@example.com', 'Alice'),
          ('user-2', 'bob@example.com', 'Bob'),
          ('user-3', 'charlie@example.com', 'Charlie')
      `;

      const filteredRows = await sorci.queryProjection("user-profile", {
        where: { userId: "user-2" }
      });

      expect(filteredRows).toHaveLength(1);
      expect(filteredRows[0]).toEqual({
        userId: "user-2",
        email: "bob@example.com",
        displayName: "Bob"
      });
    });

    test("returns empty array for projection with no data", async () => {
      await sorci.declareProjection({
        name: "empty-projection",
        query: { $where: { type: { $in: ["some-event"] } } },
        schema: {
          id: { type: "text", primaryKey: true }
        }
      });

      const rows = await sorci.queryProjection("empty-projection");
      expect(rows).toEqual([]);
    });
  });
});
