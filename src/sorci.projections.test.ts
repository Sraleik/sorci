import { SorciPostgres } from "./sorci.postgres";
import { createId } from "./common/utils";

afterEach(async () => {
  const projections = [
    "user-profile",
    "task-tracking",
    "empty-projection",
    "sourcing-dashboard",
    "account",
    "user"
  ];
  for (const projection of projections) {
    await sorciTestClient.dropProjection(projection).catch(() => "fine");
  }
});

describe("Projections", () => {
  describe("declareProjection", () => {
    test("creates table with correct schema, columns, primary keys and indexes", async () => {
      await sorciTestClient.declareProjection({
        name: "user-profile",
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

    test("supports ulid type and default values", async () => {
      await sorciTestClient.declareProjection({
        name: "task-tracking",
        schema: {
          taskId: { type: "ulid", primaryKey: true },
          title: { type: "text" },
          status: { type: "text", default: "pending" },
          priority: { type: "integer", default: 0 },
          isActive: { type: "boolean", default: true }
        }
      });

      const sorciPostgres = sorciTestClient as SorciPostgres;
      const sql = (sorciPostgres as any).sql;
      const streamName = (sorciPostgres as any).streamName;
      const tableName = `${streamName}_projection_task_tracking`;

      const columns = await sql`
        SELECT column_name, data_type, character_maximum_length, column_default
        FROM information_schema.columns
        WHERE table_name = ${tableName}
        ORDER BY ordinal_position
      `;

      const taskIdColumn = columns.find(
        (col: any) => col.column_name === "taskId"
      );
      expect(taskIdColumn.data_type).toBe("character");
      expect(taskIdColumn.character_maximum_length).toBe(26);

      const statusColumn = columns.find(
        (col: any) => col.column_name === "status"
      );
      expect(statusColumn.column_default).toBe("'pending'::text");

      const priorityColumn = columns.find(
        (col: any) => col.column_name === "priority"
      );
      expect(priorityColumn.column_default).toBe("0");

      const isActiveColumn = columns.find(
        (col: any) => col.column_name === "isActive"
      );
      expect(isActiveColumn.column_default).toBe("true");
    });

    test("Check default values are applied", async () => {
      await sorciTestClient.declareProjection({
        name: "task-tracking",
        schema: {
          taskId: { type: "ulid", primaryKey: true },
          title: { type: "text" },
          status: { type: "text", default: "pending" },
          priority: { type: "integer", default: 0 },
          isActive: { type: "boolean", default: true }
        }
      });

      await sorciTestClient.addEventReducingToProjection({
        name: "task-tracking",
        eventType: "task-created",
        reducer: (sql, tableName) => sql`
          INSERT INTO ${sql(tableName)} ("taskId", "title")
          VALUES (NEW.data->>'taskId', NEW.data->>'title')
          ON CONFLICT ("taskId") DO NOTHING 
        `
      });

      await sorciTestClient.insertEvents([
        {
          id: createId(),
          type: "task-created",
          data: {
            taskId: "01K8PAWC8F322G3T1KDYBG3DRY",
            title: "Test Task"
          },
          identifier: { taskId: "01K8PAWC8F322G3T1KDYBG3DRY" }
        }
      ]);

      const rows = await sorciTestClient.queryProjection("task-tracking");
      expect(rows).toEqual([
        {
          taskId: "01K8PAWC8F322G3T1KDYBG3DRY",
          title: "Test Task",
          status: "pending",
          priority: 0,
          isActive: true
        }
      ]);
    });
  });

  describe("dropProjection", () => {
    test("removes table, meta entry, and registry", async () => {
      await sorciTestClient.declareProjection({
        name: "user-profile",
        schema: {
          userId: { type: "text", primaryKey: true },
          email: { type: "text" }
        }
      });

      const rows = await sorciTestClient.queryProjection("user-profile");
      expect(rows).toEqual([]);

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
        schema: {
          userId: { type: "text", primaryKey: true },
          email: { type: "text" },
          displayName: { type: "text" }
        }
      });

      await sorciTestClient.addEventReducingToProjection({
        name: "user-profile",
        eventType: "user-created",
        reducer: (sql, tableName) => sql`
          INSERT INTO ${sql(tableName)} ("userId", "email", "displayName")
          VALUES (NEW.data->>'userId', NEW.data->>'email', NEW.data->>'displayName')
          ON CONFLICT ("userId") DO UPDATE SET
            "email" = EXCLUDED."email",
            "displayName" = EXCLUDED."displayName"
        `
      });

      const sorciPostgres = sorciTestClient as SorciPostgres;
      const projectionRegistry = (sorciPostgres as any)._projectionRegistry;
      const projection = projectionRegistry.get("user-profile");

      expect(projection).toBeDefined();
      expect(projection.reducers.has("user-created")).toBe(true);
    });

    test("silly reduction", async () => {
      await sorciTestClient.declareProjection({
        name: "account",
        schema: {
          accountId: { type: "ulid", primaryKey: true },
          name: { type: "text" },
          isDeleted: { type: "boolean", default: false }
        }
      });

      await sorciTestClient.declareProjection({
        name: "user",
        schema: {
          userId: { type: "ulid", primaryKey: true },
          name: { type: "text" },
          isDeleted: { type: "boolean", default: false }
        }
      });

      await sorciTestClient.addEventReducingToProjection({
        name: "account",
        eventType: "user-created",
        reducer: (sql, tableName) => sql`
          INSERT INTO ${sql(tableName)} ("accountId", "name")
          VALUES (NEW.data->>'userId', NEW.data->>'displayName')
          ON CONFLICT ("accountId") DO NOTHING 
        `
      });

      await sorciTestClient.addEventReducingToProjection({
        name: "user",
        eventType: "user-created",
        reducer: (sql, tableName) => sql`
          INSERT INTO ${sql(tableName)} ("userId", "name")
          VALUES (NEW.data->>'userId', NEW.data->>'displayName')
          ON CONFLICT ("userId") DO NOTHING 
        `
      });

      await sorciTestClient.addEventReducingToProjection({
        name: "account",
        eventType: "user-renamed",
        reducer: (sql, tableName) => sql`
          UPDATE ${sql(tableName)}
          SET "name" = NEW.data->>'newName'
          WHERE "accountId" = NEW.data->>'userId'
        `
      });

      await sorciTestClient.addEventReducingToProjection({
        name: "account",
        eventType: "user-deleted",
        reducer: (sql, tableName) => sql`
          UPDATE ${sql(tableName)}
          SET "isDeleted" = true
          WHERE "accountId" = NEW.data->>'userId'
        `
      });

      const userId = "01K8QEVWAG5K312PSXBFBGB0NS";
      await sorciTestClient.insertEvents([
        {
          id: createId(),
          type: "user-created",
          data: {
            userId,
            displayName: "Alice"
          },
          identifier: { userId }
        },
        {
          id: createId(),
          type: "user-renamed",
          data: {
            userId,
            newName: "Superman"
          },
          identifier: { userId }
        }
      ]);

      const rows = await sorciTestClient.queryProjection("account");
      expect(rows).toHaveLength(1);
      expect(rows[0]).toEqual({
        accountId: "01K8QEVWAG5K312PSXBFBGB0NS",
        name: "Superman",
        isDeleted: false
      });
      const userRows = await sorciTestClient.queryProjection("user");
      expect(userRows).toHaveLength(1);
      expect(userRows[0]).toEqual({
        userId: "01K8QEVWAG5K312PSXBFBGB0NS",
        name: "Alice",
        isDeleted: false
      });
    });

    test("throws error when projection does not exist", async () => {
      await expect(
        sorciTestClient.addEventReducingToProjection({
          name: "non-existent",
          eventType: "some-event",
          reducer: (sql, tableName) => sql`
            INSERT INTO ${sql(tableName)} (id) VALUES ('test')
          `
        })
      ).rejects.toThrow('Projection "non-existent" does not exist');
    });

    test("allows multiple reducers for different event types on same projection", async () => {
      await sorciTestClient.declareProjection({
        name: "user-profile",
        schema: {
          userId: { type: "text", primaryKey: true },
          email: { type: "text" }
        }
      });

      await sorciTestClient.addEventReducingToProjection({
        name: "user-profile",
        eventType: "user-created",
        reducer: (sql, tableName) => sql`
          INSERT INTO ${sql(tableName)} ("userId", "email")
          VALUES (NEW.data->>'userId', NEW.data->>'email')
        `
      });

      await sorciTestClient.addEventReducingToProjection({
        name: "user-profile",
        eventType: "user-updated",
        reducer: (sql, tableName) => sql`
          UPDATE ${sql(tableName)}
          SET "email" = NEW.data->>'email'
          WHERE "userId" = NEW.data->>'userId'
        `
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
        schema: {
          userId: { type: "text", primaryKey: true },
          email: { type: "text" },
          displayName: { type: "text" }
        }
      });

      await sorciTestClient.addEventReducingToProjection({
        name: "user-profile",
        eventType: "user-created",
        reducer: (sql, tableName) => sql`
          INSERT INTO ${sql(tableName)} ("userId", "email", "displayName")
          VALUES (NEW.data->>'userId', NEW.data->>'email', NEW.data->>'displayName')
          ON CONFLICT ("userId") DO UPDATE SET
            "email" = EXCLUDED."email",
            "displayName" = EXCLUDED."displayName"
        `
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
        schema: {
          userId: { type: "text", primaryKey: true },
          email: { type: "text" },
          displayName: { type: "text" }
        }
      });

      await sorciTestClient.addEventReducingToProjection({
        name: "user-profile",
        eventType: "user-created",
        reducer: (sql, tableName) => sql`
          INSERT INTO ${sql(tableName)} ("userId", "email", "displayName")
          VALUES (NEW.data->>'userId', NEW.data->>'email', NEW.data->>'displayName')
          ON CONFLICT ("userId") DO UPDATE SET
            "email" = EXCLUDED."email",
            "displayName" = EXCLUDED."displayName"
        `
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

    test("multiple event on same projection are processed in order", async () => {
      await sorciTestClient.declareProjection({
        name: "sourcing-dashboard",
        schema: {
          sourcingId: { type: "text", primaryKey: true },
          title: { type: "text" },
          isDeleted: { type: "boolean" }
        }
      });

      await sorciTestClient.addEventReducingToProjection({
        name: "sourcing-dashboard",
        eventType: "sourcing-created",
        reducer: (sql, tableName) => sql`
          INSERT INTO ${sql(tableName)} ("sourcingId", "title")
          VALUES (NEW.data->>'sourcingId', NEW.data->>'title')
          ON CONFLICT ("sourcingId") DO UPDATE SET
            "title" = EXCLUDED."title"
        `
      });

      await sorciTestClient.addEventReducingToProjection({
        name: "sourcing-dashboard",
        eventType: "sourcing-deleted",
        reducer: (sql, tableName) => sql`
          UPDATE ${sql(tableName)}
          SET "isDeleted" = true
          WHERE "sourcingId" = NEW.data->>'sourcingId'
        `
      });

      await sorciTestClient.insertEvents([
        {
          id: createId(),
          type: "sourcing-created",
          data: {
            sourcingId: "01K8PDQ0XQDVS8HVYVFQ2Z5GZV",
            title: "Dev Job"
          },
          identifier: { userId: "01K8PDQ0XQDVS8HVYVFQ2Z5GZV" }
        }
      ]);

      await sorciTestClient.insertEvents([
        {
          id: createId(),
          type: "sourcing-deleted",
          data: {
            sourcingId: "01K8PDQ0XQDVS8HVYVFQ2Z5GZV"
          },
          identifier: { sourcingId: "01K8PDQ0XQDVS8HVYVFQ2Z5GZV" }
        }
      ]);

      const sourcingRows =
        await sorciTestClient.queryProjection("sourcing-dashboard");

      expect(sourcingRows).toHaveLength(1);
      expect(sourcingRows[0]).toEqual({
        sourcingId: "01K8PDQ0XQDVS8HVYVFQ2Z5GZV",
        title: "Dev Job",
        isDeleted: true
      });
    });

    test("same event type is processed properly for multiple projections", async () => {
      await sorciTestClient.declareProjection({
        name: "user",
        schema: {
          userId: { type: "text", primaryKey: true },
          email: { type: "text" },
          displayName: { type: "text" }
        }
      });

      await sorciTestClient.declareProjection({
        name: "account",
        schema: {
          userId: { type: "text", primaryKey: true }
        }
      });

      await sorciTestClient.addEventReducingToProjection({
        name: "user",
        eventType: "user-created",
        reducer: (sql, tableName) => sql`
          INSERT INTO ${sql(tableName)} ("userId", "email", "displayName")
          VALUES (NEW.data->>'userId', NEW.data->>'email', NEW.data->>'displayName')
          ON CONFLICT ("userId") DO UPDATE SET
            "email" = EXCLUDED."email",
            "displayName" = EXCLUDED."displayName"
        `
      });

      await sorciTestClient.addEventReducingToProjection({
        name: "account",
        eventType: "user-created",
        reducer: (sql, tableName) => sql`
          INSERT INTO ${sql(tableName)} ("userId")
          VALUES (NEW.data->>'userId')
          ON CONFLICT ("userId") DO NOTHING
        `
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
        }
      ]);

      const userRows = await sorciTestClient.queryProjection("user");
      expect(userRows).toHaveLength(1);
      expect(userRows[0]).toEqual({
        userId: "user-1",
        email: "alice@example.com",
        displayName: "Alice"
      });

      const accountRows = await sorciTestClient.queryProjection("account");
      expect(accountRows).toHaveLength(1);
      expect(accountRows[0]).toEqual({
        userId: "user-1"
      });
    });
  });
});
