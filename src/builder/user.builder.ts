import { faker } from "@faker-js/faker";
import { createId } from "../common/utils";
import { SorciEvent } from "../sorci-event";
import { Sorci } from "../sorci.interface";
import { CompanyBuilder } from "./company.builder";
import { BuilderOrId } from "../type";

export class UserBuilder {
  private sorci: Sorci;
  private _aggregateId: string;
  private _events: {
    data: Record<string, any>;
    identifier?: Record<string, any>;
    type: string;
  }[] = [];
  private companyBuilderOrCompanyId?: BuilderOrId<CompanyBuilder>;

  constructor(payload: { sorci: Sorci }) {
    const { sorci } = payload;
    this.sorci = sorci;
    this._aggregateId = createId();

    this._events.push({
      data: {
        email: faker.internet.email(),
        name: faker.person.fullName(),
        userId: this.aggregateId
      },
      type: "user-created"
    });
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

  with(builder: CompanyBuilder) {
    this.companyBuilderOrCompanyId = { builder };
    this._events.push({
      type: "user-company-assigned",
      data: {
        companyId: builder.aggregateId,
        userId: this.aggregateId
      }
    });
    return this;
  }

  emailChanged(payload?: { email?: string; actorId?: string }) {
    const newEmail = payload?.email || faker.internet.email();
    const eventData: Record<string, any> = {
      email: newEmail,
      userId: this.aggregateId
    };
    const eventIdentifier: Record<string, any> = {
      userId: this.aggregateId
    };

    if (payload?.actorId) {
      eventData.actorId = payload.actorId;
      eventIdentifier.actorId = payload.actorId;
    }

    this._events.push({
      type: "user-email-changed",
      data: eventData,
      identifier: eventIdentifier
    });
    return this;
  }

  renamed(payload?: { name?: string; actorId?: string }) {
    const newName = payload?.name || faker.person.fullName();
    const eventData: Record<string, any> = {
      name: newName,
      userId: this.aggregateId
    };
    const eventIdentifier: Record<string, any> = {
      userId: this.aggregateId
    };

    if (payload?.actorId) {
      eventData.actorId = payload.actorId;
      eventIdentifier.actorId = payload.actorId;
    }

    this._events.push({
      type: "user-renamed",
      data: eventData,
      identifier: eventIdentifier
    });
    return this;
  }

  deleted(payload?: { actorId?: string }) {
    const eventData: Record<string, any> = {
      userId: this.aggregateId
    };
    const eventIdentifier: Record<string, any> = {
      userId: this.aggregateId
    };

    if (payload?.actorId) {
      eventData.actorId = payload.actorId;
      eventIdentifier.actorId = payload.actorId;
    }

    this._events.push({
      type: "user-deleted",
      data: eventData,
      identifier: eventIdentifier
    });
    return this;
  }

  private async buildCompanyAndGetId() {
    if (this.companyBuilderOrCompanyId?.builder) {
      const { companyBuilder } =
        await this.companyBuilderOrCompanyId.builder.build();
      this.companyBuilderOrCompanyId = { id: companyBuilder.aggregateId };
      return companyBuilder.aggregateId;
    }
    return this.companyBuilderOrCompanyId?.id;
  }

  async build() {
    await this.buildCompanyAndGetId();
    await this.sorci.insertEvents(
      this._events.map((event) => SorciEvent.create(event))
    );

    const events = await this.sorci.getEventsByQuery({
      $where: {
        identifiers: { userId: this.aggregateId }
      }
    });

    return { userBuilder: this, events };
  }
}
