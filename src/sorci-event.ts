import { createId } from "./common/utils";
import { EventId, PersistedEvent } from "./sorci.interface";

export type SorciEventCreatePayload = {
  type: string;
  data: Record<string, any>;
  identifier?: Record<string, any>;
};

export type SorciEventReconstitutePayload = Omit<SorciEventCreatePayload, 'identifier'> & {
  id: EventId;
  identifier: Record<string, any>;
  timestamp: Date;
};

export class SorciEvent {
	static extractKeyValuePairContainingId(payload: Record<string, any>) {
		return Object.keys(payload).reduce((acc, key) => {
			if(key.match(/Id$/)) {
				return {
					...acc,
					[key]: payload[key]
				}
			}
			return acc
		}, {})
	}

  static create(payload: SorciEventCreatePayload) {
		let identifier = payload.identifier ? payload.identifier : {} 
		if(!payload.identifier) {
			identifier = SorciEvent.extractKeyValuePairContainingId(payload.data)
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
      timestamp: this.timestamp,
    };
  }
}
