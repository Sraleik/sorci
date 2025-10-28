describe("View Models", () => {
  describe("declareViewModel", () => {
    test("creates table with correct schema, columns, primary keys and indexes", async () => {
      await sorciTestClient.declareViewModel({
        name: "user-profile",
        query: { $where: { type: { $in: ["user-created"] } } },
        schema: {
          userId: { type: "text", primaryKey: true },
          email: { type: "text", index: "btree" },
          displayName: { type: "text" },
          isDeleted: { type: "boolean" },
          metadata: { type: "jsonb", index: "gin" }
        }
      });

      const rows = await sorciTestClient.queryViewModel("user-profile");
      expect(rows).toEqual([]);

      const sorciPostgres = sorciTestClient;
      const sql = (sorciPostgres as any).sql;
      const streamName = (sorciPostgres as any).streamName;

      const tableName = `${streamName}_vm_user_profile`;

      const columns = await sql`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = ${tableName}
        ORDER BY ordinal_position
      `;

      console.log("🚀 ~ sorci.view-models.test.ts:30 ~ columns:", columns);

      expect(columns.map((col: any) => col.column_name)).toEqual([
        "userId",
        "email",
        "displayName",
        "isDeleted",
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
});
