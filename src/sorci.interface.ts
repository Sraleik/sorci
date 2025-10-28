/* eslint-disable @typescript-eslint/no-explicit-any */
export type EventId = string;

export type QueryProperty =
  | { $eq: string; $in?: never; $skipLockOn?: string[] }
  | { $in: readonly string[]; $eq?: never; $skipLockOn?: string[] }
  | string;
export type QueryOr = Array<QueryAble>;
export type QueryAnd = Array<QueryAble>;

export type QueryAble = {
  // id?: QueryProperty; //TODO
  type?: QueryProperty;
  // data?: Record<string, QueryProperty>; //TODO
  identifiers?: {
    [key: string]: string | Array<string> | undefined;
    $skipLockOn?: Array<string>;
  };
  // timestamp?: QueryProperty; //TODO
};

export type Query = {
  $where:
    | {
        $or: QueryOr;
      }
    | {
        $and: QueryAnd;
      }
    | QueryAble;
  $limit?: number;
  $offset?: number;
  $order?: "ASC" | "DESC";
};

/**
 * This is the structure of an event to give to the {@link Sorci.appendEvent} function
 * @example
 * ```typescript
 *  const sourcingEvent: ToPersistEvent = {
 *   type: "course-created",
 *    data: {
 *      courseId: "6c811e1c-a441-4dc0-af89-b92f6e1784ed",
 *      name: "Maths",
 *    },
 *    identifier: {
 *      courseId: "6c811e1c-a441-4dc0-af89-b92f6e1784ed",
 *    },
 *  }
 *
 *  await sorci.appendEvent({
 *    sourcingEvent
 *  }),
 * ```
 */

export type ToPersistEvent = {
  /**
   * @remarks The id of the event. If not provided, it will be generated automatically
   */
  id?: EventId;
  type: string;
  data: Record<string, any>;
  identifier: Record<string, any>;
  /**
   * @remarks The creation date of the event. If not provided will be generated automatically
   */
  timestamp?: Date;
};

/**
 * This is the structure of an event returned by the {@link Sorci.getEventsByQuery} and {@link Sorci.getEventById} function
 */
export type PersistedEvent = Omit<ToPersistEvent, "timestamp" | "id"> & {
  id: EventId;
  timestamp: Date;
};

/**
 * This is the structure of an event returned by the {@link Sorci.getEventsByQuery} and {@link Sorci.getEventById} function
 */
export type AppendEventPayload =
  | {
      sourcingEvent: ToPersistEvent;
    }
  | {
      sourcingEvent: ToPersistEvent;
      query: Query;
      lastKnownEventId: EventId;
      _testOnlyOnLockAcquired?: () => Promise<void> | void;
    };

export type ProjectionColumnType =
  | "text"
  | "integer"
  | "bigint"
  | "boolean"
  | "timestamp"
  | "jsonb"
  | "numeric";

export type ProjectionColumnDefinition = {
  type: ProjectionColumnType;
  primaryKey?: boolean;
  index?: "btree" | "gin" | "gist";
  nullable?: boolean;
};

export type ProjectionSchema = Record<string, ProjectionColumnDefinition>;

export type ProjectionDeclaration = {
  name: string;
  query: Query;
  schema: ProjectionSchema;
};

export type MutationResult = {
  mutationType: "create" | "upsert" | "update" | "delete";
  data?: Record<string, any>;
  where?: Record<string, any>;
};

export type EventReducer = (
  state: any,
  event: PersistedEvent
) => MutationResult;

// This interface is agnostic of the domain, so the typing is generic on purpose
/** @namespace */
export interface Sorci {
  // Tooling

  /**
   * Will create necessary table
   * @category Tooling
   */
  createStream(): Promise<void>;

  /**
   * Will remove every events of the stream
   * @category Tooling
   */
  truncate(): Promise<void>;

  /**
   * Will insert events in the stream without any concurrency check
   * Usefull to setup a test stream with a lot of events
   * @category Tooling
   * @return An array of event id
   */
  insertEvents(events: Array<ToPersistEvent>): Promise<Array<EventId>>; // Simple insert no check of any kind

  /**
   * Will create a stream with random name prefixed by 'test-'
   * Usefull to setup a test stream
   * @remarks You can give a name to the stream if you want to
   * @category Tooling
   */
  setupTestStream(streamName?: string): Promise<void>;

  /**
   * Will drop the current stream
   * Usefull to cleanup a test stream
   * @category Tooling
   */
  dropCurrentStream(): Promise<void>;

  /**
   * Will destroy every stream prefixed by 'test-'
   * Usefull to cleanup all test stream
   * @category Tooling
   */
  dropAllTestStream(payload?: { excludeCurrentStream: boolean }): Promise<void>;

  /**
   * Will close all database connections
   * Usefull to cleanup after tests
   * @category Tooling
   */
  close(): Promise<void>;

  // Commands

  /**
   * Will append an event with optimistic concurrency control.
   * Uses Dynamic Consistency Boundary (DCB) to detect conflicts without table locks.
   * If queryV2 & lastKnownEventId are provided, it checks if any relevant events
   * were added since lastKnownEventId. If yes, throws a concurrency error.
   * @category Stream
   * @returns The event id
   */
  appendEvent(payload: AppendEventPayload): Promise<EventId>;

  // Query

  /**
   * Will retrieve one event by it's id
   * @category Stream
   */
  getEventById(id: EventId): Promise<PersistedEvent | undefined>;

  /**
   * Will retrieve every event that match the Query
   * @category Stream
   */
  getEventsByQuery(query: Query): Promise<PersistedEvent[]>;

  // Projections

  /**
   * Declare a projection with schema and query
   * @category Projections
   */
  declareProjection(declaration: ProjectionDeclaration): Promise<void>;

  /**
   * Query a projection
   * @category Projections
   */
  queryProjection(
    name: string,
    options?: { where?: Record<string, any> }
  ): Promise<any[]>;

  /**
   * Add an event-specific reducer to a projection
   * @category Projections
   */
  addEventReducingToProjection(payload: {
    name: string;
    eventType: string;
    reducer: EventReducer;
  }): Promise<void>;

  /**
   * Manually refresh a projection by reprocessing all events
   * @category Projections
   */
  // refreshProjection(name: string): Promise<void>;

  /**
   * Update a projection's configuration
   * @category Projections
   */
  // updateProjection(payload: {
  //   name: string;
  //   query?: Query;
  //   resetState?: boolean;
  // }): Promise<void>;

  /**
   * Drop a projection completely
   * @category Projections
   */
  dropProjection(name: string): Promise<void>;
}
