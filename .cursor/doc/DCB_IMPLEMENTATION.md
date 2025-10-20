# Dynamic Consistency Boundary (DCB) Implementation

## Overview

This document describes the implementation of Dynamic Consistency Boundary (DCB) with optimistic concurrency control for event sourcing in Sorci, without using pessimistic table locks.

## What is Dynamic Consistency Boundary (DCB)?

Dynamic Consistency Boundary (DCB) is a pattern in event sourcing where consistency boundaries are determined by queries rather than fixed aggregate boundaries. This allows:

- **Flexible consistency rules** based on any query, not just aggregate IDs
- **Cross-aggregate invariants** (e.g., "no more than 10 items across all todo lists")
- **Dynamic boundaries** that can change based on business rules

## The Problem

### Example Scenario

Two users simultaneously try to add a todo-list-item to a todo-list that already has 9 items. Business rule: maximum 10 items per list.

**Without proper concurrency control:**

```
Time →
User A: Reads (9 items) → Validates (OK, 9 < 10) → Inserts item #10 ✓
User B: Reads (9 items) → Validates (OK, 9 < 10) → Inserts item #11 ✓
Result: 11 items! Rule violated! 💥
```

**With DCB:**

```
Time →
User A: Reads (9 items) → Validates (OK) → Inserts item #10 ✓
User B: Reads (9 items) → Validates (OK) → Tries to insert → ❌ CONFLICT!
Result: 10 items. Rule enforced! ✓
```

## Solution Evolution

### Attempt 1: Pessimistic Table Lock ❌

```typescript
await sql`LOCK TABLE events IN SHARE ROW EXCLUSIVE MODE`;
```

**Problems:**

- Locks the ENTIRE table
- Poor concurrency: even unrelated operations wait
- Not suitable for high-throughput systems

### Attempt 2: SERIALIZABLE Isolation ❌

```typescript
await this.sql.begin("serializable", async (sql) => {
  // Check for conflicts
  // Insert if no conflicts
});
```

**Problems:**

- PostgreSQL's SERIALIZABLE is too conservative
- Causes serialization failures even for non-conflicting operations
- Different consistency boundaries (different queries) would still conflict
- Error code `40001`: "could not serialize access due to read/write dependencies among transactions"

### Attempt 3: CTE with Atomic Check-and-Insert ❌

```sql
WITH conflict_check AS (
  SELECT id FROM events
  WHERE <query>
  AND id > lastKnownEventId
  LIMIT 1
)
INSERT INTO events (...)
SELECT ...
WHERE NOT EXISTS (SELECT 1 FROM conflict_check)
RETURNING id;
```

**Problems:**

- Not truly atomic for concurrent transactions
- Both transactions can execute their CTE before either inserts
- Both see "no conflicts" and both succeed

### Attempt 4: Row-Level Locking with FOR UPDATE ⚠️

```typescript
const existingEvents = await sql`
  SELECT id FROM events
  WHERE <query>
  ORDER BY id DESC
  LIMIT 1
  FOR UPDATE
`;
```

**Problems:**

- `FOR UPDATE` locks existing rows, but in event sourcing we only INSERT
- What if there are no existing events matching the query?
- Nothing to lock = no synchronization

### Final Solution: PostgreSQL Advisory Locks with Cartesian Product ✅

**Evolution:** Initially implemented with a single advisory lock per query hash, but this missed conflicts when different queries overlapped in event types. The solution evolved to use **cartesian product locks** (identifier × eventType) to ensure proper conflict detection while maintaining fine-grained concurrency.

## Implementation Details

### Core Concept

Use PostgreSQL advisory locks based on a **cartesian product** of identifiers and event types to serialize access to specific consistency boundaries, while allowing parallel access to different boundaries.

The lock strategy ensures that:

- Operations on the same entity with overlapping event types will conflict
- Operations on different entities run in parallel
- Operations on the same entity but different event types (e.g., rename list vs. rename item) run in parallel

### Key Components

#### 1. Identifier Extraction

```typescript
private extractIdentifiers(data: any): Record<string, string> {
  const identifiers: Record<string, string> = {};

  if (!data || typeof data !== "object") {
    return identifiers;
  }

  for (const [key, value] of Object.entries(data)) {
    if (key === "type") continue;

    if (value && typeof value === "object" && "$eq" in value) {
      const eqValue = (value as any).$eq;
      if (typeof eqValue === "string") {
        identifiers[key] = eqValue;
      }
    } else if (typeof value === "string") {
      identifiers[key] = value;
    }
  }

  return identifiers;
}
```

**Purpose:** Extract all identifier fields from both query conditions and event data (e.g., `todoListId`, `todoListItemId`).

#### 2. Event Type Extraction

```typescript
private extractEventTypes(typeCondition: any): string[] {
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
```

**Purpose:** Extract event types from query conditions and include the event type being inserted.

#### 3. Cartesian Product Lock Acquisition

```typescript
// Extract identifiers from query + event
const queryIdentifiers = this.extractIdentifiers(payload.queryV2.$where);
const eventIdentifier = payload.sourcingEvent.identifier;
const allIdentifiers = { ...queryIdentifiers, ...eventIdentifier };

// Extract event types from query + event being inserted
const queryEventTypes = this.extractEventTypes(payload.queryV2.$where.type);
const allEventTypes = [
  ...new Set([...queryEventTypes, payload.sourcingEvent.type])
];

// Create cartesian product: (identifier × eventType)
const locks: Array<{ key: string; hash: number }> = [];
for (const [idKey, idValue] of Object.entries(allIdentifiers)) {
  for (const eventType of allEventTypes) {
    const lockKey = `${idKey}:${idValue}:${eventType}`;
    locks.push({
      key: lockKey,
      hash: this.hashString(lockKey)
    });
  }
}

// Sort locks and acquire them in order (deadlock prevention)
locks.sort((a, b) => a.key.localeCompare(b.key));
for (const lock of locks) {
  await sql`SELECT pg_advisory_xact_lock(${lock.hash})`;
}
```

**Key Properties:**

- `pg_advisory_xact_lock`: Transaction-scoped advisory lock
- Automatically released when transaction commits/rolls back
- Multiple locks acquired per transaction (one for each identifier×eventType combination)
- Locks acquired in sorted order to prevent deadlocks
- Does NOT lock any table or row
- Zero storage overhead

#### 4. Optimistic Concurrency Check

```typescript
const existingEvents = await sql`
  SELECT id FROM ${this.streamNameWritableIdentifier}
  WHERE ${whereStatement}
  ORDER BY id DESC
  LIMIT 1
`;

if (existingEvents.length > 0) {
  const lastEventId = existingEvents[0].id;

  if (lastEventId !== payload.lastKnownEventId) {
    throw new Error(
      `Concurrency conflict detected: expected lastKnownEventId to be ${payload.lastKnownEventId}, but found ${lastEventId}`
    );
  }
}
```

**Purpose:** Verify that no events matching the query were added since the caller last read.

### Complete Flow

```typescript
private async appendEventWithQueryV2(payload: {
  sourcingEvent: ToPersistEvent;
  queryV2: QueryV2;
  lastKnownEventId: EventId;
}) {
  // 1. Extract identifiers from query + event (BEFORE transaction)
  const queryIdentifiers = this.extractIdentifiers(payload.queryV2.$where);
  const eventIdentifier = payload.sourcingEvent.identifier;
  const allIdentifiers = { ...queryIdentifiers, ...eventIdentifier };

  // 2. Extract event types from query + event being inserted (BEFORE transaction)
  const typeCondition =
    "$or" in payload.queryV2.$where || "$and" in payload.queryV2.$where
      ? undefined
      : payload.queryV2.$where.type;
  const queryEventTypes = this.extractEventTypes(typeCondition);
  const allEventTypes = [
    ...new Set([...queryEventTypes, payload.sourcingEvent.type])
  ];

  // 3. Create cartesian product locks (BEFORE transaction)
  const locks: Array<{ key: string; hash: number }> = [];
  for (const [idKey, idValue] of Object.entries(allIdentifiers)) {
    for (const eventType of allEventTypes) {
      const lockKey = `${idKey}:${idValue}:${eventType}`;
      locks.push({
        key: lockKey,
        hash: this.hashString(lockKey)
      });
    }
  }

  locks.sort((a, b) => a.key.localeCompare(b.key));

  return await this.sql.begin(async (sql) => {
    // 4. Acquire locks IMMEDIATELY when transaction starts
    for (const lock of locks) {
      await sql`SELECT pg_advisory_xact_lock(${lock.hash})`;
    }

    // 5. Get the current last event matching the query
    const whereStatement = this.getWhereStatementV2(payload.queryV2.$where, sql);
    const existingEvents = await sql`
      SELECT id FROM ${this.streamNameWritableIdentifier}
      WHERE ${whereStatement}
      ORDER BY id DESC
      LIMIT 1
    `;

    // 6. Verify optimistic concurrency
    if (existingEvents.length > 0) {
      const lastEventId = existingEvents[0].id;

      if (lastEventId !== payload.lastKnownEventId) {
        throw new Error(
          `Concurrency conflict detected: expected lastKnownEventId to be ${payload.lastKnownEventId}, but found ${lastEventId}`
        );
      }
    } else if (payload.lastKnownEventId) {
      throw new Error(
        `Concurrency conflict detected: no events matching the query found, but lastKnownEventId was provided`
      );
    }

    // 7. Insert the new event
    const result = await sql`
      INSERT INTO ${this.streamNameWritableIdentifier} (id, type, data, identifier)
      VALUES (${payload.sourcingEvent.id}, ${payload.sourcingEvent.type}, ${payload.sourcingEvent.data}, ${payload.sourcingEvent.identifier})
      RETURNING id
    `;

    return result[0].id as string;
    // 8. Locks automatically released on transaction commit
  });
}
```

## How It Works in Practice

### Scenario 1: Delete Todo-List + Rename Todo-List (CONFLICT)

```
Transaction A (Delete):
  Query: {type: "todo-list-created", todoListId: "abc"}
  Event: {type: "todo-list-deleted", data: {todoListId: "abc"}}
  Locks:
    - hash("todoListId:abc:todo-list-created")
    - hash("todoListId:abc:todo-list-deleted")

Transaction B (Rename):
  Query: {type: {$in: ["todo-list-created", "todo-list-deleted"]}, todoListId: "abc"}
  Event: {type: "todo-list-renamed", data: {todoListId: "abc"}}
  Locks:
    - hash("todoListId:abc:todo-list-created")  ← OVERLAP!
    - hash("todoListId:abc:todo-list-deleted")  ← OVERLAP!
    - hash("todoListId:abc:todo-list-renamed")

Time →
Tx A: Acquire locks ────→ Check (lastId matches) ──→ INSERT ──→ COMMIT ✓
Tx B: Acquire locks (waits on overlapping locks...) ──→ Check (lastId MISMATCH!) ──→ THROW ❌
```

**Result:** One succeeds, one fails with concurrency conflict because they have overlapping locks.

### Scenario 2: Rename Todo-List + Rename Todo-List-Item (NO CONFLICT)

```
Transaction A (Rename List):
  Query: {type: "todo-list-renamed", todoListId: "abc"}
  Event: {type: "todo-list-renamed", data: {todoListId: "abc"}}
  Locks:
    - hash("todoListId:abc:todo-list-renamed")

Transaction B (Rename Item):
  Query: {type: "todo-list-item-renamed", todoListItemId: "xyz"}
  Event: {type: "todo-list-item-renamed", data: {todoListItemId: "xyz"}}
  Locks:
    - hash("todoListItemId:xyz:todo-list-item-renamed")

Time →
Tx A: Acquire locks ─→ Check ─→ INSERT ─→ COMMIT ✓
Tx B: Acquire locks ─→ Check ─→ INSERT ─→ COMMIT ✓
```

**Result:** Both succeed because they have no overlapping locks (different identifiers).

### Scenario 3: Delete Todo-List + Create Todo-List-Item (WITH parent check)

```
Transaction A (Delete List):
  Query: {type: "todo-list-created", todoListId: "abc"}
  Event: {type: "todo-list-deleted", data: {todoListId: "abc"}}
  Locks:
    - hash("todoListId:abc:todo-list-created")
    - hash("todoListId:abc:todo-list-deleted")

Transaction B (Create Item with parent check):
  Query: {type: {$in: ["todo-list-item-created", "todo-list-deleted"]}, todoListId: "abc", todoListItemId: "xyz"}
  Event: {type: "todo-list-item-created", data: {todoListId: "abc", todoListItemId: "xyz"}}
  Locks:
    - hash("todoListId:abc:todo-list-item-created")
    - hash("todoListId:abc:todo-list-deleted")  ← OVERLAP!
    - hash("todoListItemId:xyz:todo-list-item-created")
    - hash("todoListItemId:xyz:todo-list-deleted")

Time →
Tx A: Acquire locks ────→ INSERT ──→ COMMIT ✓
Tx B: Acquire locks (waits on hash("todoListId:abc:todo-list-deleted")...) ──→ Check (finds deletion!) ──→ THROW ❌
```

**Result:** Transaction B blocks on the overlapping lock and detects the parent deletion.

## Why Cartesian Product?

The cartesian product approach solves a critical problem that simple query hashing cannot:

### The Problem with Query-Only Hashing

```typescript
// Old approach: hash the entire query
Transaction A: hash({type: "todo-list-created", todoListId: "abc"}) → 123
Transaction B: hash({type: {$in: ["todo-list-created", "todo-list-deleted"]}, todoListId: "abc"}) → 456
// Different hashes → No conflict → Both succeed → WRONG!
```

Even though Transaction B's query includes the event type that Transaction A is checking, they get different hashes and don't conflict.

### The Solution: Identifier × Event Type

By creating locks for each combination of identifier and event type, we ensure that:

1. **Overlapping event types create conflicts**: If Transaction A is inserting `todo-list-deleted` and Transaction B is checking for `todo-list-deleted`, they share a lock.

2. **Fine-grained concurrency**: Different identifiers don't conflict, even with the same event types.

3. **Explicit consistency boundaries**: Developers control what conflicts by choosing which identifiers and event types to include in their queries.

4. **Parent-child relationships**: By including parent identifiers in child queries, you can enforce referential integrity.

### Lock Count

The number of locks acquired = `|identifiers| × |eventTypes|`

Example:

- 1 identifier (`todoListId`) × 2 event types (`created`, `deleted`) = 2 locks
- 2 identifiers (`todoListId`, `todoListItemId`) × 3 event types = 6 locks

This is acceptable because:

- Advisory locks are lightweight (no storage overhead)
- Locks are acquired in sorted order (no deadlocks)
- Most operations involve 2-6 locks maximum

## API Usage

```typescript
// 1. Read current state and get last event ID
const events = await sorci.getEventsByQueryV2({
  $where: {
    type: { $eq: "todo-list-item-created" },
    todoListId: { $eq: todoListId }
  }
});

// 2. Apply business logic
if (events.length >= 10) {
  throw new Error("Cannot add more than 10 items");
}

// 3. Attempt to append with concurrency check
const lastKnownEventId = events[events.length - 1]?.id;
try {
  await sorci.appendEventV2({
    sourcingEvent: newItemEvent,
    queryV2: {
      $where: {
        type: { $eq: "todo-list-item-created" },
        todoListId: { $eq: todoListId }
      }
    },
    lastKnownEventId
  });
} catch (error) {
  // Concurrency conflict detected
  // Retry or inform user
}
```

## Benefits

### ✅ No Table Locks

- Only locks the specific consistency boundary via advisory lock
- Different boundaries can be modified in parallel

### ✅ True Optimistic Concurrency

- Read without locks
- Validate on write
- Fail fast if data changed

### ✅ Perfect for Event Sourcing

- Works with INSERT-only operations
- No need for row-level locks on existing data
- Scales with number of consistency boundaries, not total events

### ✅ Flexible Boundaries

- Any query can define a consistency boundary
- Can change boundaries dynamically
- Supports complex cross-aggregate rules

### ✅ Optimized Lock Acquisition

- Locks are computed before transaction starts
- Advisory locks acquired immediately when transaction begins
- Minimizes time spent inside transaction before acquiring locks
- Reduces wasted computation if waiting for locks

## Potential Improvements

### 1. Retry Logic

Add automatic retry on conflict with exponential backoff:

```typescript
async appendEventV2WithRetry(payload: AppendEventPayloadV2, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await this.appendEventV2(payload);
    } catch (error) {
      if (error.message.includes('Concurrency conflict') && attempt < maxRetries - 1) {
        await new Promise(resolve =>
          setTimeout(resolve, 10 * Math.pow(2, attempt))
        );
        continue;
      }
      throw error;
    }
  }
}
```

### 2. Better Hash Function

Use a cryptographic hash (SHA-256) for better collision resistance:

```typescript
import crypto from 'crypto';

private hashString(input: string): number {
  const hash = crypto.createHash('sha256').update(input).digest();
  // Take first 8 bytes and convert to bigint, then to int
  return Math.abs(hash.readInt32BE(0));
}
```

This would reduce the already-low probability of hash collisions between different lock keys.

### 3. Metrics and Monitoring

Track conflict rates to identify hotspots:

```typescript
private conflictCounter = new Map<string, number>();

private recordConflict(lockKey: string) {
  const count = this.conflictCounter.get(lockKey) || 0;
  this.conflictCounter.set(lockKey, count + 1);
}
```

This would help identify which specific identifier+eventType combinations have the most contention.

### 4. Timeout on Advisory Locks

Set a timeout to avoid indefinite waits:

```typescript
const acquired = await sql`SELECT pg_try_advisory_xact_lock(${lock.hash})`;
if (!acquired) {
  throw new Error("Failed to acquire lock within timeout");
}
```

### 5. Support for Multiple Consistency Boundaries

Allow checking multiple boundaries in a single append:

```typescript
interface AppendEventPayloadV2Multi {
  sourcingEvent: ToPersistEvent;
  boundaries: Array<{
    queryV2: QueryV2;
    lastKnownEventId: EventId;
  }>;
}
```

## Testing

See `src/dcb-concurrency.test.ts` for comprehensive tests covering:

- ✅ No conflicts when boundaries are different
- ✅ Conflict detection when boundaries overlap
- ✅ One succeeds, one fails in race conditions
- ✅ Works without query (simple append)

## References

- PostgreSQL Advisory Locks: https://www.postgresql.org/docs/current/explicit-locking.html#ADVISORY-LOCKS
- Event Sourcing Patterns: https://martinfowler.com/eaaDev/EventSourcing.html
- Dynamic Consistency Boundaries in Event Sourcing (concept)
