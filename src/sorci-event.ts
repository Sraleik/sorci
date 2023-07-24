import { createId as createIdDefault } from "./common/utils";
import { EventId, PersistedEvent } from "./sorci.interface";

export type SorciEventCreatePayload = {
  type: string;
  data: Record<string, any>;
  identifier?: Record<string, any>;
};

export type SorciEventReconstitutePayload = Omit<
  SorciEventCreatePayload,
  "identifier"
> & {
  id: EventId;
  identifier: Record<string, any>;
  timestamp: Date;
};

export type createIdType = (id?: string) => EventId;

/**
 * This class is an helper to focus on the relevant part of your sourcing events
 * Wich are the `type` of event and the `data` of the event.
 *
 * If you don't want to be heavily coupled with this library you could make your own
 * implementation of it and use the type {@link ToPersistEvent} to append event and
 * {@link PersistedEvent} to query events
 *
 * @remarks The class will genereate automatically the identifier if not provided
 */
export class SorciEvent {
  /**
   * This is used to automatically create the identifier.
   * It retrieve every key/pair from the data object where the 'key' end with 'Id'
   */
  static extractKeyValuePairContainingId(payload: Record<string, any>) {
    return Object.keys(payload).reduce((acc, key) => {
      if (key.match(/Id$/)) {
        return {
          ...acc,
          [key]: payload[key]
        };
      }
      return acc;
    }, {});
  }

  static create(
    payload: SorciEventCreatePayload,
    createId: createIdType = createIdDefault
  ) {
    let identifier = payload.identifier ? payload.identifier : {};
    if (!payload.identifier) {
      identifier = SorciEvent.extractKeyValuePairContainingId(payload.data);
    }

    return new SorciEvent(
      createId(),
      payload.type,
      payload.data,
      identifier,
      new Date()
    );
  }

  static reconstitute(payload: SorciEventReconstitutePayload) {
    return new SorciEvent(
      payload.id,
      payload.type,
      payload.data,
      payload.identifier,
      payload.timestamp
    );
  }

  constructor(
    public readonly id: EventId,
    public readonly type: string,
    public readonly data: Record<string, any>,
    public readonly identifier: Record<string, any>,
    public readonly timestamp: Date
  ) {
    this.id = id;
    this.type = type;
    this.data = data;
    this.identifier = identifier;
    this.timestamp = timestamp;
  }

  //MAYBE: probably useless
  toPlain(): PersistedEvent {
    return {
      id: this.id,
      type: this.type,
      data: this.data,
      identifier: this.identifier,
      timestamp: this.timestamp
    };
  }
}

/**
 * This is a factory to create a SorciEvent class with a custom createId function
 *
 * @example
 * ```typescript
 *  import { sorciEventFactory } from 'sorci';
 *  import { v4 as createId } from 'uuid';
 *
 *  const SorciEvent = sorciEventFactory(() => createId());
 *
 *  const event = SorciEvent.create({
 *    type: 'course-created',
 *    data: {
 *      courseId: '6c811e1c-a441-4dc0-af89-b92f6e1784ed',
 *      name: 'Maths'
 *    }
 *  });
 *
 *  console.log(event.id); // 98e4654d-ff79-4636-854b-7f51fcf54988
 * ```
 */
export function sorciEventFactory(createId: createIdType) {
  return class SorciEventCustomized extends SorciEvent {
    static create(payload: SorciEventCreatePayload) {
      return SorciEvent.create(payload, createId);
    }
  };
}
