// POC: Typed getAggregate method with discriminated unions
// This file is for R&D - no exports. Production code is in sorci.reducing.ts

// ============= Type System =============

// Map each property to the event types that contain it
type PropertiesToEventTypes<TEventMap extends Record<string, any>> = {
  [Property in keyof EventMapToAggregate<TEventMap>]: {
    [EventType in keyof TEventMap]: Property extends keyof TEventMap[EventType]
      ? EventType
      : never;
  }[keyof TEventMap];
};

// Extract selected property keys from property selection object
type SelectedProperties<TPropertySelection> = {
  [K in keyof TPropertySelection]: TPropertySelection[K] extends true
    ? K
    : never;
}[keyof TPropertySelection];

// Extract event types from a property selection object
type ExtractEventTypesFromProperties<
  TEventMap extends Record<string, any>,
  TPropertySelection extends Partial<
    Record<keyof EventMapToAggregate<TEventMap>, boolean>
  >
> =
  SelectedProperties<TPropertySelection> extends keyof PropertiesToEventTypes<TEventMap>
    ? PropertiesToEventTypes<TEventMap>[SelectedProperties<TPropertySelection>]
    : never;

// Constrained property selection type
type PropertySelection<TEventMap extends Record<string, any>> = Partial<
  Record<keyof EventMapToAggregate<TEventMap>, boolean>
>;

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

// Factory function to create a typed getAggregate function
function getAggregateByQueryFactory<TEventMap>() {
  return async function getAggregate<TQuery extends Query>(
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
  };
}

// Create a typed instance for TodoListEventMap
const getTodoListByQuery = getAggregateByQueryFactory<TodoListEventMap>();

// Build property-to-event-type mapping from event map schema
function buildPropertyToEventTypeMap<TEventMap extends Record<string, any>>(
  eventMapSchema: TEventMap
): Record<string, string[]> {
  const propertyMap: Record<string, string[]> = {};

  for (const [eventType, sampleData] of Object.entries(eventMapSchema)) {
    for (const property of Object.keys(sampleData)) {
      if (!propertyMap[property]) {
        propertyMap[property] = [];
      }
      propertyMap[property].push(eventType);
    }
  }

  return propertyMap;
}

// Factory function for property-based aggregate getter
function getAggregateByPropertyFactory<TEventMap extends Record<string, any>>(
  eventMapSchema: TEventMap
) {
  const getByQuery = getAggregateByQueryFactory<TEventMap>();
  const propertyToEventTypeMap = buildPropertyToEventTypeMap(eventMapSchema);

  return async function getAggregateByProperty<
    TPropertySelection extends PropertySelection<TEventMap>
  >(
    properties: TPropertySelection,
    reducer: (
      state: UnionToIntersection<
        UnionData<
          TEventMap,
          ExtractEventTypesFromProperties<TEventMap, TPropertySelection>
        >
      >,
      event: any
    ) => UnionToIntersection<
      UnionData<
        TEventMap,
        ExtractEventTypesFromProperties<TEventMap, TPropertySelection>
      >
    >
  ): Promise<
    UnionToIntersection<
      UnionData<
        TEventMap,
        ExtractEventTypesFromProperties<TEventMap, TPropertySelection>
      >
    >
  > {
    const selectedProperties = Object.keys(properties).filter(
      (key) => properties[key as keyof TPropertySelection]
    );

    const eventTypes = Array.from(
      new Set(
        selectedProperties.flatMap((prop) => propertyToEventTypeMap[prop] || [])
      )
    );

    const query = {
      $where: {
        type: { $in: eventTypes as any }
      }
    } as const;

    return getByQuery(query, reducer);
  };
}

// Runtime schema that mirrors TodoListEventMap structure
// This is used to automatically build the property-to-event-type mapping
const todoListEventMapSchema = {
  "todo-list-created": {
    todoListId: "",
    title: ""
  },
  "todo-list-renamed": {
    title: "",
    renamedCount: 0
  },
  "todo-list-deleted": {
    isDeleted: false
  },
  "todo-list-item-created": {
    todoListItems: []
  },
  "todo-list-item-renamed": {
    todoListItems: []
  },
  "todo-list-item-deleted": {
    todoListItems: []
  }
} satisfies Record<keyof TodoListEventMap, any>;

// Create a typed instance for TodoListEventMap - no manual mapping needed!
const getTodoListByProperty = getAggregateByPropertyFactory<TodoListEventMap>(
  todoListEventMapSchema
);

// ============= Usage Example =============

// Example: Automatic type inference
async function exampleAutoInference() {
  // Define the query as const for literal type inference
  const query = {
    $where: {
      type: {
        $in: [
          "todo-list-created",
          "todo-list-renamed",
          "todo-list-deleted"
        ] as const
      }
    }
  };

  // Call getAggregate - no type parameters needed!
  const res = await getTodoListByQuery(query, (state, event) => {
    // Simple reducer that merges event data
    if (event.type === "todo-list-created") {
      return { ...state, ...event.data };
    }
    if (event.type === "todo-list-renamed") {
      return { ...state, ...event.data };
    }
    return state;
  });

  // res is automatically typed as:
  // { todoListId: string; title: string; renamedCount: number }

  // TypeScript knows the shape!
  console.log("TodoList ID:", res.todoListId); // ✓ Valid
  console.log("Title:", res.title); // ✓ Valid
  console.log("Renamed Count:", res.renamedCount); // ✓ Valid
  // console.log("Deleted:", res.isDeleted);     // Would error - not in filtered events

  console.log("Full result:", res);
}

// Example: Property-based aggregate getter
async function examplePropertyBased() {
  console.log("\n=== Property-Based Getter Example ===\n");

  // Call with property selection - TypeScript will enforce valid properties!
  const result = await getTodoListByProperty(
    { todoListId: true, title: true, isDeleted: true, coco: true },
    (state, event) => {
      if (event.type === "todo-list-created") {
        return { ...state, ...event.data };
      }
      if (event.type === "todo-list-renamed") {
        return { ...state, ...event.data };
      }
      if (event.type === "todo-list-deleted") {
        return { ...state, ...event.data };
      }
      return state;
    }
  );

  // TypeScript knows the shape based on selected properties!
  console.log("TodoList ID:", result.todoListId);
  console.log("Title:", result.title);
  console.log("Is Deleted:", result.isDeleted);
  console.log("Full result:", result);

  // Try with different properties
  const result2 = await getTodoListByProperty(
    { title: true, renamedCount: true },
    (state, event) => {
      return { ...state, ...event.data };
    }
  );

  console.log("\nWith title & renamedCount:");
  console.log("Title:", result2.title);
  console.log("Renamed Count:", result2.renamedCount);

  // TypeScript will error on invalid properties:
  // const invalid = await getTodoListByProperty(
  //   { invalidProperty: true },  // ❌ Type error: invalidProperty doesn't exist
  //   (state, event) => state
  // );

  // TypeScript will error on accessing properties not selected:
  // console.log(result2.todoListId);  // ❌ Type error: todoListId not in result2
  // console.log(result2.isDeleted);   // ❌ Type error: isDeleted not in result2
}

// Run the examples
async function runExamples() {
  await exampleAutoInference();
  await examplePropertyBased();
}

runExamples();
