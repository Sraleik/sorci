import { faker } from "@faker-js/faker";
import { createId } from "../common/utils";
import { SorciEvent } from "../sorci-event";
import { Sorci } from "../sorci.interface";

export class CompanyBuilder {
  private sorci: Sorci;
  private _aggregateId: string;
  private _events: {
    data: Record<string, any>;
    identifier?: Record<string, any>;
    type: string;
  }[] = [];

  constructor(payload: { sorci: Sorci }) {
    const { sorci } = payload;
    this.sorci = sorci;
    this._aggregateId = createId();

    this._events.push({
      data: {
        companyId: this.aggregateId,
        name: faker.company.name(),
        email: faker.internet.email(),
        address: faker.location.streetAddress()
      },
      type: "company-created"
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

  get email() {
    return this.events.reverse().find((event) => event.data.email)?.data.email;
  }

  get address() {
    return this.events.reverse().find((event) => event.data.address)?.data
      .address;
  }

  withId(id: string) {
    this._aggregateId = id;
    this._events.forEach((event) => {
      event.data.companyId = id;
    });
    return this;
  }

  withInitialName(name: string) {
    this._events[0].data.name = name;
    return this;
  }

  withInitialEmail(email: string) {
    this._events[0].data.email = email;
    return this;
  }

  withInitialAddress(address: string) {
    this._events[0].data.address = address;
    return this;
  }

  renamed(name?: string) {
    const newName = name || faker.company.name();
    this._events.push(
      SorciEvent.create({
        type: "company-renamed",
        data: {
          name: newName,
          companyId: this.aggregateId
        }
      })
    );
    return this;
  }

  emailChanged(email?: string) {
    const newEmail = email || faker.internet.email();
    this._events.push(
      SorciEvent.create({
        type: "company-email-changed",
        data: {
          email: newEmail,
          companyId: this.aggregateId
        }
      })
    );
    return this;
  }

  addressChanged(address?: string) {
    const newAddress = address || faker.location.streetAddress();
    this._events.push(
      SorciEvent.create({
        type: "company-address-changed",
        data: {
          address: newAddress,
          companyId: this.aggregateId
        }
      })
    );
    return this;
  }

  deleted() {
    this._events.push(
      SorciEvent.create({
        type: "company-deleted",
        data: {
          companyId: this.aggregateId
        }
      })
    );
    return this;
  }

  async build() {
    await this.sorci.insertEvents(
      this._events.map((event) => SorciEvent.create(event))
    );

    const events = await this.sorci.getEventsByQuery({
      $where: {
        identifiers: { companyId: this.aggregateId }
      }
    });

    return { companyBuilder: this, events };
  }
}
