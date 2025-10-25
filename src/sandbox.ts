// POC: Typed getAggregate method with discriminated unions

// ============= Type System =============

//PropertiesToEventTypes

//EventTypeToReducedProperties
type TodoListItemEventMap = {
  "todo-list-item-created": {
    todoListId: string;
    todoListItemId: string;
    title: string;
  };
  "todo-list-item-renamed": {
    title: string;
    renamedCount: number;
  };
  "todo-list-item-deleted": {
    isDeleted: boolean;
  };
};

// This produces the following type structure:
// {
//   todoListId: ["todo-list-item-created"];
//   todoListItemId: ["todo-list-item-created"];
//   title: ["todo-list-item-created", "todo-list-item-renamed"];
//   renamedCount: ["todo-list-item-renamed"];
//   isDeleted: ["todo-list-item-deleted"];
// }

type TodoListItemState = EventMapToAggregate<TodoListItemEventMap>;

// User defines their event map as a type
type TodoListEventMap = {
  "todo-list-created": {
    todoListId: string;
    title: string;
  };
  "todo-list-renamed": { title: string; renamedCount: number };
  "todo-list-deleted": { isDeleted: boolean };
  "todo-list-item-created": {
    todoListItems: Array<TodoListItemEventMap["todo-list-item-created"]>;
  };
  "todo-list-item-renamed": {
    todoListItems: Array<TodoListItemEventMap["todo-list-item-renamed"]>;
  };
  "todo-list-item-deleted": {
    todoListItems: Array<TodoListItemEventMap["todo-list-item-deleted"]>;
  };
};

type Prettify<T> = {
  [K in keyof T]: T[K];
} & unknown;

// Deep prettify that works recursively on nested objects and arrays
type DeepPrettify<T> = T extends (...args: any[]) => any
  ? T // Don't prettify functions
  : T extends Array<infer U>
    ? Array<DeepPrettify<U>> // Recursively prettify array elements
    : T extends object
      ? {
          [K in keyof T]: DeepPrettify<T[K]>;
        } & unknown // Prettify object properties recursively
      : T; // Leave primitives as-is

// Convert an EventMap to its full aggregate representation
type EventMapToAggregate<TEventMap extends Record<string, any>> = DeepPrettify<
  UnionToIntersection<TEventMap[keyof TEventMap]>
>;

type TodoListState = EventMapToAggregate<TodoListEventMap>;

// Extract event types from query
type ExtractTypes<Q> = Q extends {
  $where: { type: { $in: readonly (infer T)[] } };
}
  ? T
  : never;

// Get union of data properties for selected event types
type UnionData<Map, Types> = Types extends keyof Map ? Map[Types] : never;

// Base union to intersection converter
type BaseUnionToIntersection<U> = (
  U extends any ? (k: U) => void : never
) extends (k: infer I) => void
  ? I
  : never;

// Helper to extract all values for a given key from a union type
type ExtractPropertyValues<U, K extends PropertyKey> =
  U extends Record<K, infer V> ? V : never;

// Merge properties intelligently - arrays get their element types intersected
type MergeProperties<U> = {
  [K in keyof BaseUnionToIntersection<U>]: BaseUnionToIntersection<U>[K] extends Array<any>
    ? Array<
        DeepPrettify<
          BaseUnionToIntersection<
            ExtractPropertyValues<U, K> extends Array<infer Item> ? Item : never
          >
        >
      >
    : BaseUnionToIntersection<U>[K];
};

// Convert union to intersection with proper array handling
type UnionToIntersection<U> = DeepPrettify<MergeProperties<U>>;

// Mock Query type (simplified version of your actual Query)
type Query = {
  $where: {
    type?: { $in?: readonly string[]; $eq?: string };
    [key: string]: any;
  };
  $limit?: number;
  $offset?: number;
  $order?: "ASC" | "DESC";
};

// ============= Mock Implementation =============

// Mock event data
const mockEvents = [
  {
    id: "evt1",
    type: "todo-list-created" as const,
    data: { todoListId: "list-123", title: "My Todo List" },
    identifier: { todoListId: "list-123" },
    timestamp: new Date("2024-01-01")
  },
  {
    id: "evt2",
    type: "todo-list-renamed" as const,
    data: { title: "My Important Tasks" },
    identifier: { todoListId: "list-123" },
    timestamp: new Date("2024-01-02")
  },
  {
    id: "evt3",
    type: "todo-list-item-created" as const,
    data: { todoListItemId: "item-1", title: "Buy milk" },
    identifier: { todoListId: "list-123", todoListItemId: "item-1" },
    timestamp: new Date("2024-01-03")
  },
  {
    id: "evt4",
    type: "todo-list-renamed" as const,
    data: { title: "Urgent Tasks" },
    identifier: { todoListId: "list-123" },
    timestamp: new Date("2024-01-04")
  }
];

// Mock getAggregate function
async function getAggregate<TEventMap, TQuery extends Query>(
  _query: TQuery,
  reducer: (
    state: UnionToIntersection<UnionData<TEventMap, ExtractTypes<TQuery>>>,
    event: any
  ) => UnionToIntersection<UnionData<TEventMap, ExtractTypes<TQuery>>>
): Promise<UnionToIntersection<UnionData<TEventMap, ExtractTypes<TQuery>>>> {
  // Filter events based on query (simplified for POC)
  const events = mockEvents;

  // Apply reducer to build aggregate
  const initialState = {} as UnionToIntersection<
    UnionData<TEventMap, ExtractTypes<TQuery>>
  >;
  return events.reduce((state, event) => {
    return reducer(state, event);
  }, initialState);
}

// ============= Usage Example =============

// Example: Automatic type inference
async function exampleAutoInference() {
  // Define the query as const for literal type inference
  const query = {
    $where: {
      type: {
        $in: ["todo-list-created", "todo-list-renamed"] as const
      }
    }
  };

  // Call getAggregate with TodoListEventMap
  const res = await getAggregate<TodoListEventMap, typeof query>(
    query,
    (state, event) => {
      // Simple reducer that merges event data
      if (event.type === "todo-list-created") {
        return { ...state, ...event.data };
      }
      if (event.type === "todo-list-renamed") {
        return { ...state, ...event.data };
      }
      return state;
    }
  );

  // res is automatically typed as:
  // { todoListId: string; title: string; renamedCount: number }

  // TypeScript knows the shape!
  console.log("TodoList ID:", res.todoListId); // ✓ Valid
  console.log("Title:", res.title); // ✓ Valid
  console.log("Renamed Count:", res.renamedCount); // ✓ Valid
  // console.log("Deleted:", res.isDeleted);     // Would error - not in filtered events

  console.log("Full result:", res);
}

// Run the example
exampleAutoInference();
