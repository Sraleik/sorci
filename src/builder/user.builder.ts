import { faker } from "@faker-js/faker";
import { createId } from "../common/utils";
import { SorciEvent } from "../sorci-event";
import { Sorci } from "../sorci.interface";

export class UserBuilder {
  private sorci: Sorci;
  private _aggregateId: string;
  private _events: SorciEvent[] = [];

  constructor(payload: { sorci: Sorci }) {
    const { sorci } = payload;
    this.sorci = sorci;
    this._aggregateId = createId();

    this._events.push(
      SorciEvent.create({
        data: {
          email: faker.internet.email(),
          name: faker.person.fullName(),
          userId: this.aggregateId
        },
        type: "user-created"
      })
    );
  }

  get aggregateId() {
    return this._aggregateId;
  }

  get email() {
    return [...this._events].reverse().find((event) => event.data.email)?.data
      .email;
  }

  get name() {
    return [...this._events].reverse().find((event) => event.data.name)?.data
      .name;
  }

  get events() {
    return [...this._events];
  }

  withId(id: string) {
    this._aggregateId = id;
    this._events.forEach((event) => {
      event.data.userId = id;
      event.identifier.userId = id;
    });
    return this;
  }

  withInitialEmail(email: string) {
    this._events[0].data.email = email;
    return this;
  }

  withInitialName(name: string) {
    this._events[0].data.name = name;
    return this;
  }

  emailChanged(email?: string) {
    const newEmail = email || faker.internet.email();
    this._events.push(
      SorciEvent.create({
        type: "user-email-changed",
        data: {
          email: newEmail,
          userId: this.aggregateId
        }
      })
    );
    return this;
  }

  renamed(name?: string) {
    const newName = name || faker.person.fullName();
    this._events.push(
      SorciEvent.create({
        type: "user-renamed",
        data: {
          name: newName,
          userId: this.aggregateId
        }
      })
    );
    return this;
  }

  deleted() {
    this._events.push(
      SorciEvent.create({
        type: "user-deleted",
        data: {
          userId: this.aggregateId
        }
      })
    );
    return this;
  }

  async build() {
    await this.sorci.insertEvents(this._events);

    const events = await this.sorci.getEventsByQuery({
      $where: {
        identifiers: { userId: this.aggregateId }
      }
    });

    return { userBuilder: this, events };
  }
}
