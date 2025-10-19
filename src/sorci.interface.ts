/* eslint-disable @typescript-eslint/no-explicit-any */
export type EventId = string;

export type Query =
  | {
      identifiers: Array<Record<string, any>>;
      types?: Array<string>;
    }
  | {
      identifiers?: Array<Record<string, any>>;
      types: Array<string>;
    };

export type QueryV2Property =
  | { $eq: string; $in?: never }
  | { $in: Array<string>; $eq?: never };

export type QueryV2Or = Array<Record<string, QueryV2Property>>;
export type QueryV2And = Array<Record<string, QueryV2Property>>;
export type QueryV2 = {
  $where:
    | {
        $or: QueryV2Or;
      }
    | {
        $and: QueryV2And;
      }
    | {
        [key: string]: QueryV2Property;
      };
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
      eventIdentifier: EventId;
    };

export type AppendEventPayloadV2 =
  | {
      sourcingEvent: ToPersistEvent;
    }
  | {
      sourcingEvent: ToPersistEvent;
      queryV2: QueryV2;
      lastKnownEventId: EventId;
    };

// This interface is agnostic of the domain, so the typing is generic on purpose
/** @namespace */
export interface Sorci {
  // Tooling

  /**
   * Will create necessary tables, function & triggers
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

  // Commands

  /**
   * Will append an event. It will make sure there is no concurrency
   * issue if query & eventIdentifier is provided
   * @category Stream
   * @returns The event id
   */
  appendEvent(payload: AppendEventPayload): Promise<EventId>; // Proper append with check on eventIdentifier and query

  /**
   * Will append an event with optimistic concurrency control.
   * Uses Dynamic Consistency Boundary (DCB) to detect conflicts without table locks.
   * If queryV2 & lastKnownEventId are provided, it checks if any relevant events
   * were added since lastKnownEventId. If yes, throws a concurrency error.
   * @category Stream
   * @returns The event id
   */
  appendEventV2(payload: AppendEventPayloadV2): Promise<EventId>;

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
  // appendEvents(payload: AppendEventPayload[]): Promise<EntityId[]>;

  /**
   * Will retrieve every event that match the Query
   * @category Stream
   */
  getEventsByQueryV2(query: QueryV2): Promise<PersistedEvent[]>;
}
