import { EventId } from "./sorci.interface";

/**
 * Thrown by {@link Sorci.appendEvent} and {@link Sorci.appendEvents} when the
 * query's last known event no longer matches the stream — someone else wrote
 * to the same consistency boundary first.
 */
export class ConcurrencyError extends Error {
  constructor(
    public readonly lastKnownEventId: EventId,
    public readonly actualLastEventId: EventId | undefined
  ) {
    super(
      `Concurrency conflict detected: lastKnownEventId "${lastKnownEventId}" differs from the last event "${actualLastEventId}"`
    );
    this.name = "ConcurrencyError";
  }
}
