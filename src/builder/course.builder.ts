import { faker } from "@faker-js/faker";
import { createId } from "../common/utils";
import { SorciEvent } from "../sorci-event";
import { Sorci, PersistedEvent } from "../sorci.interface";
import { UserBuilder } from "./user.builder";
import { BuilderOrId } from "../type";

export class CourseBuilder {
  private sorci: Sorci;
  private _aggregateId: string;
  private _events: {
    data: Record<string, any>;
    identifier?: Record<string, any>;
    type: string;
  }[] = [];
  private defaultActorBuilderOrId: BuilderOrId<UserBuilder>;

  constructor(payload: { sorci: Sorci; aUser: () => UserBuilder }) {
    const { sorci, aUser } = payload;
    this.sorci = sorci;
    this._aggregateId = createId();

    const userBuilder = aUser();
    this.defaultActorBuilderOrId = { builder: userBuilder };

    this._events.push({
      data: {
        courseId: this.aggregateId,
        name: faker.lorem.sentence(),
        capacity: faker.number.int({ min: 10, max: 25 }),
        actorId: userBuilder.aggregateId
      },
      identifier: {
        courseId: this.aggregateId,
        actorId: userBuilder.aggregateId
      },
      type: "course-created"
    });
  }

  get aggregateId() {
    return this._aggregateId;
  }

  get events() {
    return [...this._events];
  }

  get name() {
    return this.events.reverse().find((event) => event.data.name)?.data.name;
  }

  get capacity() {
    return (
      this.events
        .reverse()
        .find((event) => event.data.capacity || event.data.newCapacity)?.data
        .capacity ||
      this.events.reverse().find((event) => event.data.newCapacity)?.data
        .newCapacity
    );
  }

  private getActorId(providedActorId?: string) {
    if (providedActorId) return providedActorId;

    return (
      this.defaultActorBuilderOrId.builder?.aggregateId ||
      this.defaultActorBuilderOrId.id!
    );
  }

  withId(id: string) {
    this._aggregateId = id;
    this._events.forEach((event) => {
      event.data.courseId = id;
      if (event.identifier) {
        event.identifier.courseId = id;
      }
    });
    return this;
  }

  withInitialName(name: string) {
    this._events[0].data.name = name;
    return this;
  }

  withInitialCapacity(capacity: number) {
    this._events[0].data.capacity = capacity;
    return this;
  }

  capacityChanged(payload?: { capacity?: number; actorId?: string }) {
    const currentCapacity = this.capacity;
    const newCapacity =
      payload?.capacity !== undefined
        ? payload.capacity
        : faker.number.int({ min: 10, max: 25 });
    const actorId = this.getActorId(payload?.actorId);

    this._events.push({
      type: "course-capacity-changed",
      data: {
        courseId: this.aggregateId,
        oldCapacity: currentCapacity,
        newCapacity,
        actorId
      },
      identifier: {
        courseId: this.aggregateId,
        actorId
      }
    });
    return this;
  }

  renamed(payload?: { name?: string; actorId?: string }) {
    const newName = payload?.name || faker.lorem.sentence();
    const actorId = this.getActorId(payload?.actorId);

    this._events.push({
      type: "course-renamed",
      data: {
        courseId: this.aggregateId,
        oldName: this.name,
        newName,
        actorId
      },
      identifier: {
        courseId: this.aggregateId,
        actorId
      }
    });
    return this;
  }

  private async buildDefaultActorAndGetId() {
    if (this.defaultActorBuilderOrId.builder) {
      const { userBuilder } =
        await this.defaultActorBuilderOrId.builder.build();
      this.defaultActorBuilderOrId = { id: userBuilder.aggregateId };
      return userBuilder.aggregateId;
    }
    return this.defaultActorBuilderOrId.id;
  }

  async build(): Promise<{
    courseBuilder: CourseBuilder;
    events: PersistedEvent[];
  }> {
    await this.buildDefaultActorAndGetId();

    await this.sorci.insertEvents(
      this._events.map((event) => SorciEvent.create(event))
    );

    const events = await this.sorci.getEventsByQuery({
      $where: {
        identifiers: { courseId: this.aggregateId }
      }
    });

    return { courseBuilder: this, events };
  }
}
