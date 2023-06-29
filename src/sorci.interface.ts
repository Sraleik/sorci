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

export type ToPersistEvent = {
  id: EventId;
  type: string;
  data: Record<string, any>;
  identifier: Record<string, any>;
  timestamp?: Date; //TODO this should be a string
};

export type PersistedEvent = Omit<ToPersistEvent, 'timestamp'> & {
  timestamp: Date; //TODO this should be a string
};

export type AppendEventPayload = {
  sourcingEvent: ToPersistEvent;
  query?: Query;
  eventIdentifier?: string;
};

// This interface is agnostic of the domain, so the typing is generic on purpose
export interface Sorci {
  // Tooling
  truncate(): Promise<void>;
  insertEvents(events: Array<ToPersistEvent>): Promise<Array<EventId>>; // Simple insert no check of any kind
  setupTestStream(streamName?: string): Promise<void>;
  cleanCurrentStream(): Promise<void>;
  clearAllTestStream(payload?: { excludeCurrentStream: boolean }): Promise<void>;

  // Commands
  appendEvent(payload: AppendEventPayload): Promise<EventId>; // Proper append with check on eventIdentifier and query

  // Query
  // appendEvents(payload: AppendEventPayload[]): Promise<EntityId[]>;
  getEventById(id: EventId): Promise<PersistedEvent | undefined>;
  getEventsByQuery(query: Query): Promise<PersistedEvent[]>;
}
