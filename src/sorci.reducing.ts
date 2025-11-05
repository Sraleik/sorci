/* eslint-disable @typescript-eslint/no-explicit-any */
import { Query, PersistedEvent } from "./sorci.interface";

// ============= Core Type Utilities =============

// Deep prettify that works recursively on nested objects and arrays
type DeepPrettify<T> = T extends (...args: any[]) => any
  ? T
  : T extends Array<infer U>
    ? Array<DeepPrettify<U>>
    : T extends object
      ? {
          [K in keyof T]: DeepPrettify<T[K]>;
        } & unknown
      : T;

// Base union to intersection converter
type BaseUnionToIntersection<U> = (
  U extends any ? (k: U) => void : never
) extends (k: infer I) => void
  ? I
  : never;

// Helper to extract all values for a given key from a union type
type ExtractPropertyValues<U, K extends PropertyKey> =
  U extends Record<K, infer V> ? V : never;

// Get all keys from a union (not intersection)
type UnionKeys<U> = U extends any ? keyof U : never;

// Merge properties intelligently - arrays get their element types intersected
type MergeProperties<U> = {
  [K in UnionKeys<U>]: ExtractPropertyValues<U, K> extends Array<any>
    ? Array<
        DeepPrettify<
          BaseUnionToIntersection<
            ExtractPropertyValues<U, K> extends Array<infer Item> ? Item : never
          >
        >
      >
    : ExtractPropertyValues<U, K>;
};

// Convert union to intersection with proper array handling
export type UnionToIntersection<U> = DeepPrettify<MergeProperties<U>>;

// ============= Event Map Types =============

// Convert an EventMap to its full aggregate representation
export type EventMapToAggregate<TEventMap extends Record<string, any>> =
  DeepPrettify<UnionToIntersection<TEventMap[keyof TEventMap]>>;

// ============= Query Type Utilities =============

// Extract event types from QueryAble with type property
// Note: This currently handles the simple case where $where is QueryAble with type: { $in: [...] }
// Full support for $or/$and can be added later if needed
type ExtractTypesFromQueryAble<Q> = Q extends {
  type: { $in: readonly (infer T)[] };
}
  ? T
  : Q extends { type: { $eq: infer T } }
    ? T
    : Q extends { type: infer T }
      ? T
      : never;

// Extract event types from query
export type ExtractTypes<Q> = Q extends {
  $where: infer W;
}
  ? W extends { $or: infer Or }
    ? Or extends Array<infer Item>
      ? ExtractTypesFromQueryAble<Item>
      : never
    : W extends { $and: infer And }
      ? And extends Array<infer Item>
        ? ExtractTypesFromQueryAble<Item>
        : never
      : ExtractTypesFromQueryAble<W>
  : never;

// Get union of data properties for selected event types
type UnionData<Map, Types> = Types extends keyof Map ? Map[Types] : never;

// ============= Factory Function =============

/**
 * Factory function to create a typed aggregate getter for an EventMap.
 *
 * @param getEventsByQuery - Function to fetch events from the event store
 * @returns A typed function that builds aggregates from query results
 *
 * @example
 * ```typescript
 * type TodoListEventMap = {
 *   "todo-list-created": { todoListId: string; title: string };
 *   "todo-list-renamed": { title: string; renamedCount: number };
 * };
 *
 * const getAggregate = getAggregateByQueryFactory<TodoListEventMap>(
 *   (query) => sorci.getEventsByQuery(query)
 * );
 *
 * const query = {
 *   $where: {
 *     type: { $in: ["todo-list-created", "todo-list-renamed"] as const }
 *   }
 * };
 *
 * const result = await getAggregate(query, (state, event) => {
 *   return { ...state, ...event.data };
 * });
 *
 * // result.state is typed as: { todoListId: string; title: string; renamedCount: number }
 * // result.query is the original query with full type information
 * ```
 */
export function getAggregateByQueryFactory<TEventMap>(
  getEventsByQuery: (query: Query) => Promise<Array<PersistedEvent>>
) {
  return async function getAggregateByQuery<TQuery extends Query>(
    query: TQuery,
    reducer: (
      state: UnionToIntersection<UnionData<TEventMap, ExtractTypes<TQuery>>>,
      event: PersistedEvent
    ) => UnionToIntersection<UnionData<TEventMap, ExtractTypes<TQuery>>>
  ): Promise<{
    state: UnionToIntersection<UnionData<TEventMap, ExtractTypes<TQuery>>>;
    query: TQuery;
  }> {
    const events = await getEventsByQuery(query);

    const initialState = {} as UnionToIntersection<
      UnionData<TEventMap, ExtractTypes<TQuery>>
    >;

    const state = events.reduce((state, event) => {
      return reducer(state, event);
    }, initialState);

    return { state, query };
  };
}
