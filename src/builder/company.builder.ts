import { faker } from "@faker-js/faker";
import { createId } from "../common/utils";
import { SorciEvent } from "../sorci-event";
import { PersistedEvent, Sorci } from "../sorci.interface";
import { UserBuilder } from "./user.builder";
import { BuilderOrId } from "../type";

export class CompanyBuilder {
  private sorci: Sorci;
  private _aggregateId: string;
  private _events: {
    data: Record<string, any>;
    identifier?: Record<string, any>;
    type: string;
  }[] = [];
  private actorBuilderOrId: BuilderOrId<UserBuilder>;

  constructor(payload: { sorci: Sorci; aUser: () => UserBuilder }) {
    const { sorci, aUser } = payload;
    this.sorci = sorci;
    this._aggregateId = createId();

    const userBuilder = aUser();
    this.actorBuilderOrId = { builder: userBuilder };

    this._events.push({
      data: {
        companyId: this.aggregateId,
        name: faker.company.name(),
        email: faker.internet.email(),
        address: faker.location.streetAddress(),
        actorId: userBuilder.aggregateId
      },
      identifier: {
        companyId: this.aggregateId,
        actorId: userBuilder.aggregateId
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

  from(builder: UserBuilder) {
    this.actorBuilderOrId = { builder };
  }

  private getActorId(providedActorId?: string) {
    if (providedActorId) return providedActorId;
    return (
      this.actorBuilderOrId.builder?.aggregateId || this.actorBuilderOrId.id!
    );
  }

  withId(id: string) {
    this._aggregateId = id;
    this._events.forEach((event) => {
      event.data.companyId = id;
      if (event.identifier) {
        event.identifier.companyId = id;
      }
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

  renamed(payload?: { name?: string; actorId?: string }) {
    const newName = payload?.name || faker.company.name();
    const actorId = this.getActorId(payload?.actorId);

    this._events.push({
      type: "company-renamed",
      data: {
        name: newName,
        companyId: this.aggregateId,
        actorId
      },
      identifier: {
        companyId: this.aggregateId,
        actorId
      }
    });
    return this;
  }

  emailChanged(payload?: { email?: string; actorId?: string }) {
    const newEmail = payload?.email || faker.internet.email();
    const actorId = this.getActorId(payload?.actorId);

    this._events.push({
      type: "company-email-changed",
      data: {
        email: newEmail,
        companyId: this.aggregateId,
        actorId
      },
      identifier: {
        companyId: this.aggregateId,
        actorId
      }
    });
    return this;
  }

  addressChanged(payload?: { address?: string; actorId?: string }) {
    const newAddress = payload?.address || faker.location.streetAddress();
    const actorId = this.getActorId(payload?.actorId);

    this._events.push({
      type: "company-address-changed",
      data: {
        address: newAddress,
        companyId: this.aggregateId,
        actorId
      },
      identifier: {
        companyId: this.aggregateId,
        actorId
      }
    });
    return this;
  }

  deleted(by?: { actorId?: string }) {
    const actorId = this.getActorId(by?.actorId);

    this._events.push({
      type: "company-deleted",
      data: {
        companyId: this.aggregateId,
        actorId
      },
      identifier: {
        companyId: this.aggregateId,
        actorId
      }
    });
    return this;
  }

  private async buildActorAndGetId() {
    if (this.actorBuilderOrId.builder) {
      const { userBuilder } = await this.actorBuilderOrId.builder.build();
      this.actorBuilderOrId = { id: userBuilder.aggregateId };
      return userBuilder.aggregateId;
    }
    return this.actorBuilderOrId.id;
  }

  async build(): Promise<{
    companyBuilder: CompanyBuilder;
    events: PersistedEvent[];
  }> {
    await this.buildActorAndGetId();

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
