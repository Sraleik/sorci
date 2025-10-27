import { faker } from "@faker-js/faker";
import { createId } from "../common/utils";
import { SorciEvent } from "../sorci-event";
import { Sorci, PersistedEvent } from "../sorci.interface";
import type { TodoListItemBuilder } from "./todo-list-item.builer";
import type { UserBuilder } from "./user.builder";
import { BuilderOrId } from "../type";

export class TodoListBuilder {
  private sorci: Sorci;
  private _aggregateId: string;
  private _events: {
    data: Record<string, any>;
    identifier?: Record<string, any>;
    type: string;
  }[] = [];
  private _todoListItems: TodoListItemBuilder[] = [];
  private userBuilderOrUserId: BuilderOrId<UserBuilder>;

  constructor(payload: { sorci: Sorci; aUser: () => UserBuilder }) {
    const { sorci, aUser } = payload;
    this.sorci = sorci;
    this._aggregateId = createId();

    const userBuilder = aUser();
    this.userBuilderOrUserId = { builder: userBuilder };

    this._events.push({
      data: {
        title: faker.lorem.sentence(),
        todoListId: this.aggregateId,
        actorId: userBuilder.aggregateId
      },
      identifier: {
        todoListId: this.aggregateId,
        actorId: userBuilder.aggregateId
      },
      type: "todo-list-created"
    });
  }

  get aggregateId() {
    return this._aggregateId;
  }

  get title() {
    return [...this._events].reverse().find((event) => event.data.title)?.data
      .title;
  }

  get events() {
    return [...this._events];
  }

  private getActorId(providedActorId?: string): string {
    if (providedActorId) {
      return providedActorId;
    }
    return (
      this.userBuilderOrUserId.builder?.aggregateId ||
      this.userBuilderOrUserId.id!
    );
  }

  withId(id: string) {
    this._aggregateId = id;
    this._events.forEach((event) => {
      event.data.todoListId = id;
      if (event.identifier) {
        event.identifier.todoListId = id;
      }
    });
    return this;
  }

  withInitialTitle(title: string) {
    this._events[0].data.title = title;
    return this;
  }

  renamed(payload?: { name?: string; actorId?: string }) {
    const title = payload?.name || faker.lorem.sentence();
    const actorId = this.getActorId(payload?.actorId);

    this._events.push({
      type: "todo-list-renamed",
      data: {
        title,
        todoListId: this.aggregateId,
        actorId
      },
      identifier: {
        todoListId: this.aggregateId,
        actorId
      }
    });
    return this;
  }

  propertyChangedTo(builder: UserBuilder, payload?: { actorId?: string }) {
    const actorId = this.getActorId(payload?.actorId);

    this._events.push({
      type: "todo-list-property-changed",
      data: {
        todoListId: this.aggregateId,
        userId: builder.aggregateId,
        actorId
      },
      identifier: {
        todoListId: this.aggregateId,
        actorId
      }
    });
    return this;
  }

  deleted(payload?: { actorId?: string }) {
    const actorId = this.getActorId(payload?.actorId);

    this._events.push({
      type: "todo-list-deleted",
      data: {
        todoListId: this.aggregateId,
        actorId
      },
      identifier: {
        todoListId: this.aggregateId,
        actorId
      }
    });
    return this;
  }

  with(builder: TodoListItemBuilder) {
    builder.fromTodoListId(this.aggregateId);
    this._todoListItems.push(builder);
    return this;
  }

  from(builder: UserBuilder) {
    this.userBuilderOrUserId = { builder };
    this._events[0].data.actorId = builder.aggregateId;
    if (this._events[0].identifier) {
      this._events[0].identifier.actorId = builder.aggregateId;
    }
    return this;
  }

  fromUserId(id: string) {
    this.userBuilderOrUserId = { id };
    return this;
  }
  private buildTodoListItems() {
    return Promise.all(this._todoListItems.map((builder) => builder.build()));
  }

  private async buildUserAndGetId() {
    if (this.userBuilderOrUserId.builder) {
      const { userBuilder } = await this.userBuilderOrUserId.builder.build();
      this.userBuilderOrUserId = { id: userBuilder.aggregateId };
      return userBuilder.aggregateId;
    }

    return this.userBuilderOrUserId.id;
  }

  async build(): Promise<{
    todoListBuilder: TodoListBuilder;
    events: PersistedEvent[];
  }> {
    const userId = await this.buildUserAndGetId();
    const userEvents = await this.sorci.getEventsByQuery({
      $where: { identifiers: { userId } }
    });
    const companyId = [...userEvents]
      .reverse()
      .find((event) => event.type === "user-company-assigned")?.data.companyId;

    if (companyId) {
      this._events[0].data.companyId = companyId;
      this._events[0].identifier!.companyId = companyId;
    }

    await this.sorci.insertEvents(
      this._events.map((event) => SorciEvent.create(event))
    );
    await this.buildTodoListItems();

    const events = await this.sorci.getEventsByQuery({
      $where: {
        identifiers: { todoListId: this.aggregateId }
      }
    });

    return { todoListBuilder: this, events };
  }
}
