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

// This interface is agnostic of the domain, so the typing is generic on purpose
/** @namespace */
export interface Sorci {
  // Tooling

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
  cleanCurrentStream(): Promise<void>;

  /**
   * Will destroy every stream prefixed by 'test-'
   * Usefull to cleanup all test stream
   * @category Tooling
   */
  clearAllTestStream(payload?: {
    excludeCurrentStream: boolean;
  }): Promise<void>;

  // Commands

  /**
   * Will append an event. It will make sure there is no concurrency
   * issue if query & eventIdentifier is provided
   * @category Stream
   * @returns The event id
   */
  appendEvent(payload: AppendEventPayload): Promise<EventId>; // Proper append with check on eventIdentifier and query

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
}
