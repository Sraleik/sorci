import { SorciPostgres } from "./sorci.postgres";
import { createId } from "./common/utils";
import { inject } from "vitest";

afterEach(async () => {
  const projections = [
    "user-profile",
    "user-profile-refresh-test",
    "user-profile-rebuild-test",
    "user-profile-persistence",
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
  describe("createProjection", () => {
    test("creates table with correct schema, columns, primary keys and indexes", async () => {
      await sorciTestClient.createProjection({
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
      await sorciTestClient.createProjection({
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
      await sorciTestClient.createProjection({
        name: "task-tracking",
        schema: {
          taskId: { type: "ulid", primaryKey: true },
          title: { type: "text" },
          status: { type: "text", default: "pending" },
          priority: { type: "integer", default: 0 },
          isActive: { type: "boolean", default: true }
        }
      });

      await sorciTestClient.setEventReducingToProjection({
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
      await sorciTestClient.createProjection({
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

  describe("updateProjection", () => {
    test("adds column to existing projection", async () => {
      await sorciTestClient.createProjection({
        name: "user-profile",
        schema: {
          userId: { type: "text", primaryKey: true },
          email: { type: "text" }
        }
      });

      await sorciTestClient.updateProjection({
        name: "user-profile",
        alterationSQL: (sql, tableName) => sql`
          ALTER TABLE ${sql(tableName)} 
          ADD COLUMN display_name text
        `
      });

      const sorciPostgres = sorciTestClient as SorciPostgres;
      const sql = (sorciPostgres as any).sql;
      const streamName = (sorciPostgres as any).streamName;
      const tableName = `${streamName}_projection_user_profile`;

      const columns = await sql`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = ${tableName}
        ORDER BY ordinal_position
      `;

      expect(columns.map((col: any) => col.column_name)).toEqual([
        "userId",
        "email",
        "display_name"
      ]);

      const metaTableName = `${streamName}_projections_meta`;
      const metaRows = await sql`
        SELECT updated_at FROM ${sql(metaTableName)}
        WHERE name = 'user-profile'
      `;

      expect(metaRows).toHaveLength(1);
      expect(metaRows[0].updated_at).toBeDefined();
    });

    test("adds index to existing projection", async () => {
      await sorciTestClient.createProjection({
        name: "user-profile",
        schema: {
          userId: { type: "text", primaryKey: true },
          email: { type: "text" }
        }
      });

      await sorciTestClient.updateProjection({
        name: "user-profile",
        alterationSQL: (sql, tableName) => sql`
          CREATE INDEX idx_user_profile_email 
          ON ${sql(tableName)} USING btree (email)
        `
      });

      const sorciPostgres = sorciTestClient as SorciPostgres;
      const sql = (sorciPostgres as any).sql;
      const streamName = (sorciPostgres as any).streamName;
      const tableName = `${streamName}_projection_user_profile`;

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
    });

    test("throws error if projection doesn't exist", async () => {
      await expect(
        sorciTestClient.updateProjection({
          name: "non-existent",
          alterationSQL: (sql, tableName) =>
            sql`ALTER TABLE ${sql(tableName)} ADD COLUMN test text`
        })
      ).rejects.toThrow('Projection "non-existent" does not exist');
    });

    test("works with setEventReducingToProjection and refreshProjection", async () => {
      await sorciTestClient.createProjection({
        name: "user-profile",
        schema: {
          userId: { type: "text", primaryKey: true },
          email: { type: "text" }
        }
      });

      await sorciTestClient.setEventReducingToProjection({
        name: "user-profile",
        eventType: "user-created",
        reducer: (sql, tableName) => sql`
          INSERT INTO ${sql(tableName)} ("userId", "email")
          VALUES (NEW.data->>'userId', NEW.data->>'email')
          ON CONFLICT ("userId") DO UPDATE SET
            "email" = EXCLUDED."email"
        `
      });

      const userId = createId();
      await sorciTestClient.insertEvents([
        {
          id: createId(),
          type: "user-created",
          data: {
            userId,
            email: "alice@example.com"
          },
          identifier: { userId }
        }
      ]);

      const rowsBefore = await sorciTestClient.queryProjection("user-profile");
      expect(rowsBefore).toHaveLength(1);
      expect(rowsBefore[0]).toEqual({
        userId,
        email: "alice@example.com"
      });

      await sorciTestClient.updateProjection({
        name: "user-profile",
        alterationSQL: (sql, tableName) => sql`
          ALTER TABLE ${sql(tableName)} 
          ADD COLUMN display_name text DEFAULT 'Unknown'
        `
      });

      await sorciTestClient.setEventReducingToProjection({
        name: "user-profile",
        eventType: "user-created",
        reducer: (sql, tableName) => sql`
          INSERT INTO ${sql(tableName)} ("userId", "email", "display_name")
          VALUES (NEW.data->>'userId', NEW.data->>'email', NEW.data->>'displayName')
          ON CONFLICT ("userId") DO UPDATE SET
            "email" = EXCLUDED."email",
            "display_name" = EXCLUDED."display_name"
        `,
        refreshProjection: true
      });

      const rowsAfter = await sorciTestClient.queryProjection("user-profile");
      expect(rowsAfter).toHaveLength(1);
      expect(rowsAfter[0]).toEqual({
        userId,
        email: "alice@example.com",
        display_name: null
      });
    });
  });

  describe("queryProjection", () => {
    test("retrieves data from projection table", async () => {
      await sorciTestClient.createProjection({
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
      await sorciTestClient.createProjection({
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
      await sorciTestClient.createProjection({
        name: "empty-projection",
        schema: {
          id: { type: "text", primaryKey: true }
        }
      });

      const rows = await sorciTestClient.queryProjection("empty-projection");
      expect(rows).toEqual([]);
    });
  });

  describe("setEventReducingToProjection", () => {
    test("registers a new reducer for an event type", async () => {
      await sorciTestClient.createProjection({
        name: "user-profile",
        schema: {
          userId: { type: "text", primaryKey: true },
          email: { type: "text" },
          displayName: { type: "text" }
        }
      });

      await sorciTestClient.setEventReducingToProjection({
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

      const userId = createId();

      await sorciTestClient.insertEvents([
        {
          id: createId(),
          type: "user-created",
          data: {
            userId,
            email: "alice@example.com",
            displayName: "Alice"
          },
          identifier: { userId }
        },
        {
          id: createId(),
          type: "user-renamed",
          data: {
            userId,
            displayName: "Bob"
          },
          identifier: { userId }
        }
      ]);

      const rows = await sorciTestClient.queryProjection("user-profile");
      expect(rows).toHaveLength(1);
      expect(rows[0]).toEqual({
        userId,
        email: "alice@example.com",
        displayName: "Alice"
      });

      await sorciTestClient.setEventReducingToProjection({
        name: "user-profile",
        eventType: "user-renamed",
        reducer: (sql, tableName) => sql`
          UPDATE ${sql(tableName)}
          SET "displayName" = NEW.data->>'displayName'
          WHERE "userId" = NEW.data->>'userId'
        `
      });

      const rowsBis = await sorciTestClient.queryProjection("user-profile");
      expect(rowsBis).toHaveLength(1);
      expect(rowsBis[0]).toEqual({
        userId,
        email: "alice@example.com",
        displayName: "Alice"
      });

      await sorciTestClient.insertEvents([
        {
          id: createId(),
          type: "user-renamed",
          data: {
            userId,
            displayName: "Charlie"
          },
          identifier: { userId }
        }
      ]);

      const rowsTer = await sorciTestClient.queryProjection("user-profile");
      expect(rowsTer).toHaveLength(1);
      expect(rowsTer[0]).toEqual({
        userId,
        email: "alice@example.com",
        displayName: "Charlie"
      });
    });

    test("registers a new reducer for an event type with projection refresh", async () => {
      await sorciTestClient.createProjection({
        name: "user-profile-refresh-test",
        schema: {
          userId: { type: "text", primaryKey: true },
          email: { type: "text" },
          displayName: { type: "text" }
        }
      });

      await sorciTestClient.setEventReducingToProjection({
        name: "user-profile-refresh-test",
        eventType: "user-created-refresh",
        reducer: (sql, tableName) => sql`
          INSERT INTO ${sql(tableName)} ("userId", "email", "displayName")
          VALUES (NEW.data->>'userId', NEW.data->>'email', NEW.data->>'displayName')
          ON CONFLICT ("userId") DO UPDATE SET
            "email" = EXCLUDED."email",
            "displayName" = EXCLUDED."displayName"
        `
      });

      const userId = createId();

      await sorciTestClient.insertEvents([
        {
          id: createId(),
          type: "user-created-refresh",
          data: {
            userId,
            email: "alice@example.com",
            displayName: "Alice"
          },
          identifier: { userId }
        },
        {
          id: createId(),
          type: "user-renamed-refresh",
          data: {
            userId,
            displayName: "Bob"
          },
          identifier: { userId }
        }
      ]);

      const rows = await sorciTestClient.queryProjection(
        "user-profile-refresh-test"
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]).toEqual({
        userId,
        email: "alice@example.com",
        displayName: "Alice"
      });

      await sorciTestClient.setEventReducingToProjection({
        name: "user-profile-refresh-test",
        eventType: "user-renamed-refresh",
        reducer: (sql, tableName) => sql`
          UPDATE ${sql(tableName)}
          SET "displayName" = NEW.data->>'displayName'
          WHERE "userId" = NEW.data->>'userId'
        `,
        refreshProjection: true
      });

      const rowsBis = await sorciTestClient.queryProjection(
        "user-profile-refresh-test"
      );
      expect(rowsBis).toHaveLength(1);
      expect(rowsBis[0]).toEqual({
        userId,
        email: "alice@example.com",
        displayName: "Bob"
      });

      await sorciTestClient.insertEvents([
        {
          id: createId(),
          type: "user-renamed-refresh",
          data: {
            userId,
            displayName: "Charlie"
          },
          identifier: { userId }
        }
      ]);

      const rowsTer = await sorciTestClient.queryProjection(
        "user-profile-refresh-test"
      );
      expect(rowsTer).toHaveLength(1);
      expect(rowsTer[0]).toEqual({
        userId,
        email: "alice@example.com",
        displayName: "Charlie"
      });
    });

    test("registers a reducer for an event type", async () => {
      await sorciTestClient.createProjection({
        name: "user-profile",
        schema: {
          userId: { type: "text", primaryKey: true },
          email: { type: "text" },
          displayName: { type: "text" }
        }
      });

      await sorciTestClient.setEventReducingToProjection({
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

    test("mutiple projection on same event", async () => {
      await sorciTestClient.createProjection({
        name: "account",
        schema: {
          accountId: { type: "ulid", primaryKey: true },
          name: { type: "text" },
          isDeleted: { type: "boolean", default: false }
        }
      });

      await sorciTestClient.createProjection({
        name: "user",
        schema: {
          userId: { type: "ulid", primaryKey: true },
          name: { type: "text" },
          isDeleted: { type: "boolean", default: false }
        }
      });

      await sorciTestClient.setEventReducingToProjection({
        name: "account",
        eventType: "user-created",
        reducer: (sql, tableName) => sql`
          INSERT INTO ${sql(tableName)} ("accountId", "name")
          VALUES (NEW.data->>'userId', NEW.data->>'displayName')
          ON CONFLICT ("accountId") DO NOTHING 
        `
      });

      await sorciTestClient.setEventReducingToProjection({
        name: "user",
        eventType: "user-created",
        reducer: (sql, tableName) => sql`
          INSERT INTO ${sql(tableName)} ("userId", "name")
          VALUES (NEW.data->>'userId', NEW.data->>'displayName')
          ON CONFLICT ("userId") DO NOTHING 
        `
      });

      await sorciTestClient.setEventReducingToProjection({
        name: "account",
        eventType: "user-renamed",
        reducer: (sql, tableName) => sql`
          UPDATE ${sql(tableName)}
          SET "name" = NEW.data->>'newName'
          WHERE "accountId" = NEW.data->>'userId'
        `
      });

      await sorciTestClient.setEventReducingToProjection({
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
        sorciTestClient.setEventReducingToProjection({
          name: "non-existent",
          eventType: "some-event",
          reducer: (sql, tableName) => sql`
            INSERT INTO ${sql(tableName)} (id) VALUES ('test')
          `
        })
      ).rejects.toThrow('Projection "non-existent" does not exist');
    });

    test("allows multiple reducers for different event types on same projection", async () => {
      await sorciTestClient.createProjection({
        name: "user-profile",
        schema: {
          userId: { type: "text", primaryKey: true },
          email: { type: "text" }
        }
      });

      await sorciTestClient.setEventReducingToProjection({
        name: "user-profile",
        eventType: "user-created",
        reducer: (sql, tableName) => sql`
          INSERT INTO ${sql(tableName)} ("userId", "email")
          VALUES (NEW.data->>'userId', NEW.data->>'email')
        `
      });

      await sorciTestClient.setEventReducingToProjection({
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
      await sorciTestClient.createProjection({
        name: "user-profile",
        schema: {
          userId: { type: "text", primaryKey: true },
          email: { type: "text" },
          displayName: { type: "text" }
        }
      });

      await sorciTestClient.setEventReducingToProjection({
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
      await sorciTestClient.createProjection({
        name: "user-profile",
        schema: {
          userId: { type: "text", primaryKey: true },
          email: { type: "text" },
          displayName: { type: "text" }
        }
      });

      await sorciTestClient.setEventReducingToProjection({
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
      await sorciTestClient.createProjection({
        name: "sourcing-dashboard",
        schema: {
          sourcingId: { type: "text", primaryKey: true },
          title: { type: "text" },
          isDeleted: { type: "boolean" }
        }
      });

      await sorciTestClient.setEventReducingToProjection({
        name: "sourcing-dashboard",
        eventType: "sourcing-created",
        reducer: (sql, tableName) => sql`
          INSERT INTO ${sql(tableName)} ("sourcingId", "title")
          VALUES (NEW.data->>'sourcingId', NEW.data->>'title')
          ON CONFLICT ("sourcingId") DO UPDATE SET
            "title" = EXCLUDED."title"
        `
      });

      await sorciTestClient.setEventReducingToProjection({
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
      await sorciTestClient.createProjection({
        name: "user",
        schema: {
          userId: { type: "text", primaryKey: true },
          email: { type: "text" },
          displayName: { type: "text" }
        }
      });

      await sorciTestClient.createProjection({
        name: "account",
        schema: {
          userId: { type: "text", primaryKey: true }
        }
      });

      await sorciTestClient.setEventReducingToProjection({
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

      await sorciTestClient.setEventReducingToProjection({
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

  describe("refreshProjection", () => {
    test("rebuilds projection from scratch with updated reducer logic", async () => {
      await sorciTestClient.createProjection({
        name: "user-profile-rebuild-test",
        schema: {
          userId: { type: "text", primaryKey: true },
          email: { type: "text" },
          displayName: { type: "text" },
          updateCount: { type: "integer", default: 0 }
        }
      });

      await sorciTestClient.setEventReducingToProjection({
        name: "user-profile-rebuild-test",
        eventType: "user-created-rebuild",
        reducer: (sql, tableName) => sql`
          INSERT INTO ${sql(tableName)} ("userId", "email", "displayName")
          VALUES (NEW.data->>'userId', NEW.data->>'email', NEW.data->>'displayName')
          ON CONFLICT ("userId") DO UPDATE SET
            "email" = EXCLUDED."email",
            "displayName" = EXCLUDED."displayName"
        `
      });

      await sorciTestClient.setEventReducingToProjection({
        name: "user-profile-rebuild-test",
        eventType: "user-renamed-rebuild",
        reducer: (sql, tableName) => sql`
          UPDATE ${sql(tableName)}
          SET "displayName" = NEW.data->>'displayName'
          WHERE "userId" = NEW.data->>'userId'
        `
      });

      const userId1 = createId();
      const userId2 = createId();

      await sorciTestClient.insertEvents([
        {
          id: createId(),
          type: "user-created-rebuild",
          data: {
            userId: userId1,
            email: "alice@example.com",
            displayName: "Alice"
          },
          identifier: { userId: userId1 }
        },
        {
          id: createId(),
          type: "user-created-rebuild",
          data: {
            userId: userId2,
            email: "bob@example.com",
            displayName: "Bob"
          },
          identifier: { userId: userId2 }
        },
        {
          id: createId(),
          type: "user-renamed-rebuild",
          data: {
            userId: userId1,
            displayName: "Alice Smith"
          },
          identifier: { userId: userId1 }
        },
        {
          id: createId(),
          type: "user-renamed-rebuild",
          data: {
            userId: userId2,
            displayName: "Bob Jones"
          },
          identifier: { userId: userId2 }
        }
      ]);

      const initialRows = await sorciTestClient.queryProjection(
        "user-profile-rebuild-test"
      );
      expect(initialRows).toHaveLength(2);
      expect(initialRows).toEqual(
        expect.arrayContaining([
          {
            userId: userId1,
            email: "alice@example.com",
            displayName: "Alice Smith",
            updateCount: 0
          },
          {
            userId: userId2,
            email: "bob@example.com",
            displayName: "Bob Jones",
            updateCount: 0
          }
        ])
      );

      await sorciTestClient.setEventReducingToProjection({
        name: "user-profile-rebuild-test",
        eventType: "user-renamed-rebuild",
        reducer: (sql, tableName) => sql`
          UPDATE ${sql(tableName)}
          SET 
            "displayName" = NEW.data->>'displayName',
            "updateCount" = "updateCount" + 1
          WHERE "userId" = NEW.data->>'userId'
        `
      });

      await sorciTestClient.refreshProjection("user-profile-rebuild-test");

      const refreshedRows = await sorciTestClient.queryProjection(
        "user-profile-rebuild-test"
      );
      expect(refreshedRows).toHaveLength(2);
      expect(refreshedRows).toEqual(
        expect.arrayContaining([
          {
            userId: userId1,
            email: "alice@example.com",
            displayName: "Alice Smith",
            updateCount: 1
          },
          {
            userId: userId2,
            email: "bob@example.com",
            displayName: "Bob Jones",
            updateCount: 1
          }
        ])
      );
    });

    test("processes events added during refresh after refresh completes", async () => {
      await sorciTestClient.createProjection({
        name: "account",
        schema: {
          accountId: { type: "text", primaryKey: true },
          balance: { type: "integer", default: 0 }
        }
      });

      await sorciTestClient.setEventReducingToProjection({
        name: "account",
        eventType: "account-created",
        reducer: (sql, tableName) => sql`
          INSERT INTO ${sql(tableName)} ("accountId", "balance")
          VALUES (NEW.data->>'accountId', (NEW.data->>'balance')::integer)
          ON CONFLICT ("accountId") DO NOTHING
        `
      });

      await sorciTestClient.setEventReducingToProjection({
        name: "account",
        eventType: "account-deposited",
        reducer: (sql, tableName) => sql`
          UPDATE ${sql(tableName)}
          SET "balance" = "balance" + (NEW.data->>'amount')::integer
          WHERE "accountId" = NEW.data->>'accountId'
        `
      });

      const accountId = createId();

      await sorciTestClient.insertEvents([
        {
          id: createId(),
          type: "account-created",
          data: {
            accountId,
            balance: 100
          },
          identifier: { accountId }
        }
      ]);

      const refreshPromise = sorciTestClient.refreshProjection("account");
      await sorciTestClient.insertEvents([
        {
          id: createId(),
          type: "account-deposited",
          data: {
            accountId,
            amount: 50
          },
          identifier: { accountId }
        }
      ]);

      await refreshPromise;

      const rows = await sorciTestClient.queryProjection("account");
      expect(rows).toHaveLength(1);
      expect(rows[0]).toEqual({
        accountId,
        balance: 150
      });
    });

    test("can refresh projection after reloading from database (simulating restart)", async () => {
      // Clean up any existing projection first
      await sorciTestClient
        .dropProjection("user-profile-persistence")
        .catch(() => {});

      // 1. Declare projection (no reducers yet)
      await sorciTestClient.createProjection({
        name: "user-profile-persistence",
        schema: {
          userId: { type: "text", primaryKey: true },
          email: { type: "text" },
          displayName: { type: "text" }
        }
      });

      // 2. Insert events BEFORE adding reducer (so triggers don't auto-process)
      const userId1 = createId();
      const userId2 = createId();

      await sorciTestClient.insertEvents([
        {
          id: createId(),
          type: "user-created-persistence-test",
          data: {
            userId: userId1,
            email: "alice@example.com",
            displayName: "Alice"
          },
          identifier: { userId: userId1 }
        },
        {
          id: createId(),
          type: "user-created-persistence-test",
          data: {
            userId: userId2,
            email: "bob@example.com",
            displayName: "Bob"
          },
          identifier: { userId: userId2 }
        },
        {
          id: createId(),
          type: "user-renamed-persistence-test",
          data: {
            userId: userId1,
            newName: "Alice Smith"
          },
          identifier: { userId: userId1 }
        }
      ]);

      // 3. Add reducer (creates triggers, but events already exist)
      await sorciTestClient.setEventReducingToProjection({
        name: "user-profile-persistence",
        eventType: "user-created-persistence-test",
        reducer: (sql, tableName) => sql`
          INSERT INTO ${sql(tableName)} ("userId", "email", "displayName")
          VALUES (NEW.data->>'userId', NEW.data->>'email', NEW.data->>'displayName')
          ON CONFLICT ("userId") DO UPDATE SET
            "email" = EXCLUDED."email",
            "displayName" = EXCLUDED."displayName"
        `
      });

      await sorciTestClient.setEventReducingToProjection({
        name: "user-profile-persistence",
        eventType: "user-renamed-persistence-test",
        reducer: (sql, tableName) => sql`
          UPDATE ${sql(tableName)}
          SET "displayName" = NEW.data->>'newName'
          WHERE "userId" = NEW.data->>'userId'
        `
      });

      // Verify projection is empty (events weren't processed by triggers)
      const emptyRows = await sorciTestClient.queryProjection(
        "user-profile-persistence"
      );
      expect(emptyRows).toHaveLength(0);

      // 4. Simulate restart: create new Sorci instance
      const sorciPostgres = sorciTestClient as SorciPostgres;
      const host = inject("host");
      const port = inject("port");
      const user = inject("user");
      const password = inject("password");
      const databaseName = inject("databaseName");
      const streamName = sorciPostgres.streamName;

      const sorciReloaded = new SorciPostgres({
        host,
        port,
        user,
        password,
        databaseName,
        streamName
      });

      // 6. Refresh projection should work without re-declaring
      await sorciReloaded.refreshProjection("user-profile-persistence");

      // 7. Verify projection was rebuilt correctly from events
      const rows = await sorciReloaded.queryProjection(
        "user-profile-persistence"
      );
      expect(rows).toHaveLength(2);
      expect(rows).toEqual(
        expect.arrayContaining([
          {
            userId: userId1,
            email: "alice@example.com",
            displayName: "Alice Smith"
          },
          { userId: userId2, email: "bob@example.com", displayName: "Bob" }
        ])
      );

      // Clean up: drop projection using reloaded instance
      await sorciReloaded.dropProjection("user-profile-persistence");
      await sorciReloaded.close();
    });
  });
});
