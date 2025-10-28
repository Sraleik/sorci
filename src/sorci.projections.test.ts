import { SorciPostgres } from "./sorci.postgres";
import { createId } from "./common/utils";

afterEach(async () => {
  await sorciTestClient.dropProjection("user-profile").catch(() => "fine");
});

describe("Projections", () => {
  describe("declareProjection", () => {
    test("creates table with correct schema, columns, primary keys and indexes", async () => {
      await sorciTestClient.declareProjection({
        name: "user-profile",
        query: { $where: { type: { $in: ["user-created"] } } },
        schema: {
          userId: { type: "text", primaryKey: true },
          email: { type: "text", index: "btree" },
          displayName: { type: "text" },
          metadata: { type: "jsonb", index: "gin" }
        }
      });

      const rows = await sorciTestClient.queryProjection("user-profile");
      expect(rows).toEqual([]);

      const sorciPostgres = sorciTestClient as SorciPostgres;
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
      await sorciTestClient.declareProjection({
        name: "user-profile",
        query: { $where: { type: { $in: ["user-created"] } } },
        schema: {
          userId: { type: "text", primaryKey: true },
          email: { type: "text" }
        }
      });

      const rows = await sorciTestClient.queryProjection("user-profile");
      expect(rows).toEqual([]);

      console.log("🚀 ~ sorci.projections.test.ts:117 ~ rows:", rows);

      await sorciTestClient.dropProjection("user-profile");

      const sorciPostgres = sorciTestClient as SorciPostgres;
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

      await expect(
        sorciTestClient.queryProjection("user-profile")
      ).rejects.toThrow();
    });

    test("throws error when projection does not exist", async () => {
      await expect(
        sorciTestClient.dropProjection("non-existent-projection")
      ).rejects.toThrow('Projection "non-existent-projection" does not exist');
    });
  });

  describe("queryProjection", () => {
    test("retrieves data from projection table", async () => {
      await sorciTestClient.declareProjection({
        name: "user-profile",
        query: { $where: { type: { $in: ["user-created"] } } },
        schema: {
          userId: { type: "text", primaryKey: true },
          email: { type: "text" },
          displayName: { type: "text" }
        }
      });

      const sorciPostgres = sorciTestClient as SorciPostgres;
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

      const allRows = await sorciTestClient.queryProjection("user-profile");
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
      await sorciTestClient.declareProjection({
        name: "user-profile",
        query: { $where: { type: { $in: ["user-created"] } } },
        schema: {
          userId: { type: "text", primaryKey: true },
          email: { type: "text" },
          displayName: { type: "text" }
        }
      });

      const sorciPostgres = sorciTestClient as SorciPostgres;
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

      const filteredRows = await sorciTestClient.queryProjection(
        "user-profile",
        {
          where: { userId: "user-2" }
        }
      );

      expect(filteredRows).toHaveLength(1);
      expect(filteredRows[0]).toEqual({
        userId: "user-2",
        email: "bob@example.com",
        displayName: "Bob"
      });
    });

    test("returns empty array for projection with no data", async () => {
      await sorciTestClient.declareProjection({
        name: "empty-projection",
        query: { $where: { type: { $in: ["some-event"] } } },
        schema: {
          id: { type: "text", primaryKey: true }
        }
      });

      const rows = await sorciTestClient.queryProjection("empty-projection");
      expect(rows).toEqual([]);
    });
  });

  describe("addEventReducingToProjection", () => {
    test("registers a reducer for an event type", async () => {
      await sorciTestClient.declareProjection({
        name: "user-profile",
        query: { $where: { type: { $in: ["user-created"] } } },
        schema: {
          userId: { type: "text", primaryKey: true },
          email: { type: "text" },
          displayName: { type: "text" }
        }
      });

      await sorciTestClient.addEventReducingToProjection({
        name: "user-profile",
        eventType: "user-created",
        reducer: (_state, event) => ({
          mutationType: "upsert",
          data: {
            userId: event.data.userId,
            email: event.data.email,
            displayName: event.data.displayName
          }
        })
      });

      const sorciPostgres = sorciTestClient as SorciPostgres;
      const projectionRegistry = (sorciPostgres as any)._projectionRegistry;
      const projection = projectionRegistry.get("user-profile");

      expect(projection).toBeDefined();
      expect(projection.reducers.has("user-created")).toBe(true);
    });

    test("throws error when projection does not exist", async () => {
      await expect(
        sorciTestClient.addEventReducingToProjection({
          name: "non-existent",
          eventType: "some-event",
          reducer: () =>
            ({
              mutationType: "upsert",
              data: {}
            }) as any
        })
      ).rejects.toThrow('Projection "non-existent" does not exist');
    });

    test("allows multiple reducers for different event types on same projection", async () => {
      await sorciTestClient.declareProjection({
        name: "user-profile",
        query: {
          $where: { type: { $in: ["user-created", "user-updated"] } }
        },
        schema: {
          userId: { type: "text", primaryKey: true },
          email: { type: "text" }
        }
      });

      await sorciTestClient.addEventReducingToProjection({
        name: "user-profile",
        eventType: "user-created",
        reducer: (_state, event) => ({
          mutationType: "create",
          data: { userId: event.data.userId, email: event.data.email }
        })
      });

      await sorciTestClient.addEventReducingToProjection({
        name: "user-profile",
        eventType: "user-updated",
        reducer: (_state, event) => ({
          mutationType: "update",
          where: { userId: event.data.userId },
          data: { email: event.data.email }
        })
      });

      const sorciPostgres = sorciTestClient as SorciPostgres;
      const projectionRegistry = (sorciPostgres as any)._projectionRegistry;
      const projection = projectionRegistry.get("user-profile");

      expect(projection.reducers.has("user-created")).toBe(true);
      expect(projection.reducers.has("user-updated")).toBe(true);
      expect(projection.reducers.size).toBe(2);
    });
  });

  describe("End-to-End: Automatic projection updates", () => {
    test("projection is automatically updated when event is inserted", async () => {
      await sorciTestClient.declareProjection({
        name: "user-profile",
        query: { $where: { type: { $in: ["user-created"] } } },
        schema: {
          userId: { type: "text", primaryKey: true },
          email: { type: "text" },
          displayName: { type: "text" }
        }
      });

      await sorciTestClient.addEventReducingToProjection({
        name: "user-profile",
        eventType: "user-created",
        reducer: (_state, event) => ({
          mutationType: "upsert",
          data: {
            userId: event.data.userId,
            email: event.data.email,
            displayName: event.data.displayName
          }
        })
      });

      await sorciTestClient.insertEvents([
        {
          id: createId(),
          type: "user-created",
          data: {
            userId: "01K8PAWC8F322G3T1KDYBG3DRY",
            email: "alice@example.com",
            displayName: "Alice"
          },
          identifier: { userId: "01K8PAWC8F322G3T1KDYBG3DRY" }
        }
      ]);

      const rows = await sorciTestClient.queryProjection("user-profile");
      expect(rows).toHaveLength(1);
      expect(rows[0]).toEqual({
        userId: "01K8PAWC8F322G3T1KDYBG3DRY",
        email: "alice@example.com",
        displayName: "Alice"
      });
    });

    test("projection is updated by multiple events", async () => {
      await sorciTestClient.declareProjection({
        name: "user-profile",
        query: { $where: { type: { $in: ["user-created"] } } },
        schema: {
          userId: { type: "text", primaryKey: true },
          email: { type: "text" },
          displayName: { type: "text" }
        }
      });

      await sorciTestClient.addEventReducingToProjection({
        name: "user-profile",
        eventType: "user-created",
        reducer: (_state, event) => ({
          mutationType: "upsert",
          data: {
            userId: event.data.userId,
            email: event.data.email,
            displayName: event.data.displayName
          }
        })
      });

      await sorciTestClient.insertEvents([
        {
          id: createId(),
          type: "user-created",
          data: {
            userId: "user-1",
            email: "alice@example.com",
            displayName: "Alice"
          },
          identifier: { userId: "user-1" }
        },
        {
          id: createId(),
          type: "user-created",
          data: {
            userId: "user-2",
            email: "bob@example.com",
            displayName: "Bob"
          },
          identifier: { userId: "user-2" }
        },
        {
          id: createId(),
          type: "user-created",
          data: {
            userId: "user-3",
            email: "charlie@example.com",
            displayName: "Charlie"
          },
          identifier: { userId: "user-3" }
        }
      ]);

      const rows = await sorciTestClient.queryProjection("user-profile");
      expect(rows).toHaveLength(3);
      expect(rows).toEqual(
        expect.arrayContaining([
          {
            userId: "user-1",
            email: "alice@example.com",
            displayName: "Alice"
          },
          {
            userId: "user-2",
            email: "bob@example.com",
            displayName: "Bob"
          },
          {
            userId: "user-3",
            email: "charlie@example.com",
            displayName: "Charlie"
          }
        ])
      );
    });
  });
});
