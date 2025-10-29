<!-- a98a30b3-dc0a-46ce-bf96-449fdc973878 8b059ca2-b995-40d0-a3b5-d6304fa729c5 -->

# Automatic Projection Feature for Sorci

## Overview

Add projection support with pure PostgreSQL automatic updates using a TDD approach. Start by testing and implementing `declareProjection`, then build up to automatic trigger-based updates.

## Terminology Update

The feature was renamed from "view models" to "projections" to better align with event sourcing terminology:

- `ViewModel` → `Projection`
- `declareViewModel()` → `declareProjection()`
- `queryViewModel()` → `queryProjection()`
- `addEventReducingToViewModel()` → `addEventReducingToProjection()`
- `refreshViewModel()` → `refreshProjection()`
- `updateViewModel()` → `updateProjection()`
- `dropViewModel()` → `dropProjection()`
- Table naming: `{streamName}_vm_{name}` → `{streamName}_projection_{name}`
- Meta table: `{streamName}_view_models_meta` → `{streamName}_projections_meta`
- Registry: `_viewModelRegistry` → `_projectionRegistry`

## Architecture Summary

- **Reducers** return mutation objects: `{ mutationType: 'upsert' | 'create' | 'update' | 'delete', data, where }`
- **Per-projection tables**: `{streamName}_projection_{projectionName}` with custom schemas
- **Meta table**: `{streamName}_projections_meta` tracks configurations
- **Reducer functions**: plpgsql functions generated from TypeScript reducers
- **Triggers**: One trigger per event type with WHEN clause for efficient filtering
  - Format: `{streamName}_{eventType}_projection_trigger`
  - Function: `{streamName}_{eventType}_projection_handler()`
  - WHEN clause: `WHEN (NEW.type = 'event-type')` for PostgreSQL-level filtering
  - Each trigger handles all projections subscribed to that event type

## Ordering & Concurrency Considerations

### Current State (Safe ✅)

- Single `appendEvent()` calls process sequentially - no concurrency issues
- PostgreSQL triggers fire in insertion order within a transaction
- Existing DCB (Dynamic Consistency Boundary) serializes events for same aggregate

### Future Considerations

- **appendEvents() (plural)**: If batch insert is added, ensure sequential insertion (single INSERT with multiple VALUES maintains order)
- **Concurrency on same projection row**: Potential race conditions if multiple events update same entity
  - Solution: Add row-level locking (`FOR UPDATE`) in generated reducer SQL
  - Alternative: Advisory locks per projection for strict serialization
- **Out-of-order events**: Not currently handled
  - Future enhancement: Add event sequence numbers for idempotent, order-safe updates

### Action Items

- Step 9 (SQL generation): Include row-level locks in UPDATE/SELECT statements
- Document that concurrent `appendEvent()` calls should target different aggregates
- Consider advisory locks if strict projection-level serialization is needed

## Step-by-Step Implementation (TDD)

### Step 1: Create Test File and First Test ✅

**File:** `src/sorci.projections.test.ts`

Write test verifying `declareProjection` creates table with correct schema:

```typescript
test("declareProjection creates table with correct schema", async () => {
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

  // Table exists and is empty
  const rows = await sorci.queryProjection("user-profile");
  expect(rows).toEqual([]);

  // Verify columns, primary keys, indexes via SQL queries
});
```

### Step 2: Add Type Definitions ✅

**File:** `src/sorci.interface.ts`

```typescript
export type ProjectionColumnType =
  | "text"
  | "integer"
  | "bigint"
  | "boolean"
  | "timestamp"
  | "jsonb"
  | "numeric"
  | "ulid"; // Maps to char(26)

export type ProjectionColumnDefinition = {
  type: ProjectionColumnType;
  primaryKey?: boolean;
  index?: "btree" | "gin" | "gist";
  nullable?: boolean;
  default?: string | number | boolean; // Support for default values
};

export type ProjectionSchema = Record<string, ProjectionColumnDefinition>;

export type ProjectionDeclaration = {
  name: string;
  schema: ProjectionSchema;
};

// Add to Sorci interface:
export interface Sorci {
  // ... existing methods
  declareProjection(declaration: ProjectionDeclaration): Promise<void>;
  queryProjection(
    name: string,
    options?: { where?: Record<string, any> }
  ): Promise<any[]>;
}
```

### Step 3: Implement `declareProjection()` ✅

**File:** `src/sorci.postgres.ts`

**3a. Add registry to class:**

```typescript
private _projectionRegistry: Map<string, {
  query: Query;
  schema: ProjectionSchema;
  reducers: Map<string, Function>;
}> = new Map();
```

**3b. Create meta table method:**

```typescript
private async createProjectionsMetaTable() {
  await this.sql`
    CREATE TABLE IF NOT EXISTS ${this.sql(this.streamName + "_projections_meta")} (
      name text PRIMARY KEY,
      query jsonb NOT NULL,
      schema jsonb NOT NULL,
      created_at timestamp DEFAULT NOW(),
      updated_at timestamp DEFAULT NOW()
    )
  `;
}
```

Call from `createStream()`.

**3c. Create projection table method:**

```typescript
private async createProjectionTable(name: string, schema: ProjectionSchema) {
  // Map schema to SQL column definitions
  // Handle primary keys, types, indexes
  // Execute CREATE TABLE and CREATE INDEX statements
}
```

**3d. Implement declareProjection:**

```typescript
async declareProjection(declaration: ProjectionDeclaration) {
  // 1. Validate schema (at least one primary key)
  // 2. Check name uniqueness
  // 3. Create table
  // 4. Insert to meta table
  // 5. Store in registry
}
```

### Step 4: Implement `queryProjection()` ✅

Simple SELECT for test support:

```typescript
async queryProjection(name: string, options?: { where?: Record<string, any> }) {
  // Build SELECT query
  // Apply WHERE if provided
  // Return rows
}
```

### Step 5: Test and Refine Table Creation ✅

Run test, verify table structure, fix issues.

### Step 6: Implement `dropProjection()` ✅

**File:** `src/sorci.projections.test.ts`

Add test for dropping a projection:

```typescript
test("dropProjection removes table, meta entry, and registry", async () => {
  await sorci.declareProjection({
    name: "user-profile",
    query: { $where: { type: { $in: ["user-created"] } } },
    schema: {
      userId: { type: "text", primaryKey: true },
      email: { type: "text" }
    }
  });

  // Verify projection exists
  const rows = await sorci.queryProjection("user-profile");
  expect(rows).toEqual([]);

  // Drop the projection
  await sorci.dropProjection("user-profile");

  // Verify table is dropped
  const sorciPostgres = sorci as SorciPostgres;
  const sql = (sorciPostgres as any).sql;
  const streamName = (sorciPostgres as any).streamName;
  const tableName = `${streamName}_proj_user_profile`;

  const tableExists = await sql`
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_name = ${tableName}
    )
  `;

  expect(tableExists[0].exists).toBe(false);

  // Verify meta entry is removed
  const metaTableName = `${streamName}_projections_meta`;
  const metaRows = await sql`
    SELECT * FROM ${sql(metaTableName)}
    WHERE name = 'user-profile'
  `;

  expect(metaRows).toHaveLength(0);

  // Verify querying throws error
  await expect(sorci.queryProjection("user-profile")).rejects.toThrow();
});
```

**File:** `src/sorci.interface.ts`

Uncomment and finalize:

```typescript
export interface Sorci {
  // ... add
  dropProjection(name: string): Promise<void>;
}
```

**File:** `src/sorci.postgres.ts`

Implement dropProjection:

```typescript
async dropProjection(name: string) {
  // 1. Check if projection exists in registry
  if (!this._projectionRegistry.has(name)) {
    throw new Error(`Projection "${name}" does not exist`);
  }

  // 2. Get table name
  const tableName = this.getProjectionTableName(name);

  // 3. Drop all triggers associated with this projection (if any exist)
  // await this.dropProjectionTriggers(name);

  // 4. Drop all reducer functions associated with this projection (if any exist)
  // await this.dropProjectionReducers(name);

  // 5. Drop the projection table
  await this.sql`DROP TABLE IF EXISTS ${this.sql(tableName)} CASCADE`;

  // 6. Remove from meta table
  const metaTableName = `${this.streamName}_projections_meta`;
  await this.sql`
    DELETE FROM ${this.sql(metaTableName)}
    WHERE name = ${name}
  `;

  // 7. Remove from registry
  this._projectionRegistry.delete(name);
}
```

### Step 7: Add Reducer Test ✅

**File:** `src/sorci.projections.test.ts`

```typescript
test("addEventReducingToProjection creates plpgsql function", async () => {
  await sorci.addEventReducingToProjection({
    name: "user-profile",
    eventType: "user-created",
    reducer: (state, event) => ({
      mutationType: "upsert",
      data: {
        userId: event.data.userId,
        email: event.data.email,
        displayName: event.data.displayName
      }
    })
  });

  // Verify plpgsql function exists
});
```

### Step 8: Add Reducer Types

**File:** `src/sorci.interface.ts`

```typescript
export type MutationResult = {
  mutationType: "create" | "upsert" | "update" | "delete";
  data?: Record<string, any>;
  where?: Record<string, any>;
};

export type EventReducer = (
  state: any,
  event: PersistedEvent
) => MutationResult;

export interface Sorci {
  // ... add
  addEventReducingToProjection(payload: {
    name: string;
    eventType: string;
    reducer: EventReducer;
  }): Promise<void>;
}
```

### Step 9: Create SQL Generator

**File:** `src/sorci.projection-sql-generator.ts`

```typescript
export function generateReducerFunction(params: {
  streamName: string;
  projectionName: string;
  eventType: string;
  schema: ProjectionSchema;
  mutationResult: MutationResult;
}): string {
  // Analyze mutation result
  // Generate appropriate SQL based on mutationType
  // Return CREATE FUNCTION statement
}
```

Handle upsert, update, delete, create.

### Step 10: Implement `addEventReducingToProjection()`

**File:** `src/sorci.postgres.ts`

```typescript
async addEventReducingToProjection(payload: {
  name: string;
  eventType: string;
  reducer: EventReducer;
}) {
  // 1. Get projection from registry
  // 2. Execute reducer with mock event to get mutation pattern
  // 3. Generate SQL via generator
  // 4. Create plpgsql function
  // 5. Store reducer in registry
  // 6. Update/create main trigger
}
```

### Step 11: Implement Trigger Management

```typescript
private async createOrUpdateMainTrigger() {
  // Iterate through registry
  // Build trigger function that routes events to reducers
  // CREATE OR REPLACE trigger function
  // CREATE TRIGGER if not exists
}
```

### Step 12: Add End-to-End Trigger Test

```typescript
test("trigger automatically updates projection on appendEvent", async () => {
  await sorci.appendEvent({
    sourcingEvent: {
      type: "user-created",
      data: { userId: "123", email: "test@test.com", displayName: "Test" }
    }
  });

  const rows = await sorci.queryProjection("user-profile");
  expect(rows).toHaveLength(1);
  expect(rows[0].userId).toBe("123");
});
```

### Step 13: Add Tests for Other Mutation Types

Test update, delete with appropriate reducers.

### Step 14: Implement `refreshProjection()`

```typescript
async refreshProjection(name: string) {
  // 1. TRUNCATE table
  // 2. Fetch events matching query
  // 3. Apply reducers sequentially
  // 4. Insert/update rows
}
```

### Step 15: Additional Methods

- `updateProjection()` - update query
- Consider cleanup in `dropProjection()` for triggers/functions

### Step 16: Documentation

- JSDoc comments
- README examples

## Files to Create

- `src/sorci.projections.test.ts` ✅
- `src/sorci.projection-sql-generator.ts`

## Files to Modify

- `src/sorci.interface.ts` ✅ (partial)
- `src/sorci.postgres.ts` ✅ (partial)
- `src/index.ts`
- `README.md`

## Key Decisions

- TDD approach: test first, implement to pass
- Start simple: table creation before triggers
- Pure PostgreSQL: triggers handle automatic updates
- Mutation-based: simple format enables SQL generation
- Renamed to "projections" for better event sourcing alignment

## Progress Checklist

- [x] Add projection type definitions to sorci.interface.ts
- [x] Create projections meta table schema and integrate with createStream()
- [x] Add in-memory projection registry to SorciPostgres class
- [x] Implement declareProjection() method
- [x] Implement queryProjection() method
- [x] Implement dropProjection() method
- [x] Implement addEventReducingToProjection() method
- [x] Create SQL generator for reducer functions
- [x] Implement trigger management system
- [x] **Optimized: One trigger per event type with WHEN clause** ✅
- [x] **End-to-end automatic projection updates working!** ✅
- [x] **Add support for UPDATE mutation type** ✅
  - Handles both event data and hardcoded constants in reducers
  - WHERE clause inferred from primary keys or explicit `where` property
- [x] **Removed unnecessary `query` parameter from ProjectionDeclaration** ✅
  - Event types are now defined solely by registered reducers
  - Single source of truth: `addEventReducingToProjection()` defines what events matter
- [x] **Added ULID type and default values support** ✅
  - New `ulid` column type maps to `char(26)` in PostgreSQL
  - Default values supported for all column types (string, number, boolean)
  - Proper SQL escaping for string defaults
- [x] **Migrated to SQL-based reducers** ✅
  - Replaced mutation object approach with postgres.js SQL tag
  - Reducers now return SQL queries directly for maximum flexibility
  - Full PostgreSQL power: CTEs, subqueries, conditionals, etc.
  - Type-safe SQL construction via postgres.js
  - Direct access to trigger context (NEW.data)
  - Removed MutationResult type (no longer needed)
- [ ] Implement refreshProjection() method
- [ ] Add JSDoc comments and update README
