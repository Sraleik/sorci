import { faker } from "@faker-js/faker";
import { createId } from "../common/utils";
import { SorciEvent } from "../sorci-event";
import { Sorci } from "../sorci.interface";
import type { TodoListItemBuilder } from "./todo-list-item.builer";
import type { UserBuilder } from "./user.builder";
import { BuilderOrId } from "../type";

export class TodoListBuilder {
  private sorci: Sorci;
  private _aggregateId: string;
  private _events: SorciEvent[] = [];
  private _todoListItems: TodoListItemBuilder[] = [];
  private userBuilderOrUserId: BuilderOrId<UserBuilder>;

  constructor(payload: { sorci: Sorci; aUser: () => UserBuilder }) {
    const { sorci, aUser } = payload;
    this.sorci = sorci;
    this._aggregateId = createId();

    const userBuilder = aUser();
    this.userBuilderOrUserId = { builder: userBuilder };

    this._events.push(
      SorciEvent.create({
        data: {
          title: faker.lorem.sentence(),
          todoListId: this.aggregateId,
          createdByUserId: userBuilder.aggregateId
        },
        identifier: {
          todoListId: this.aggregateId,
          userId: userBuilder.aggregateId
        },
        type: "todo-list-created"
      })
    );
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

  withId(id: string) {
    this._aggregateId = id;
    this._events.forEach((event) => {
      event.data.todoListId = id;
      event.identifier.todoListId = id;
    });
    return this;
  }

  withInitialTitle(title: string) {
    this._events[0].data.title = title;
    return this;
  }

  renamed(name?: string) {
    const title = name || faker.lorem.sentence();
    this._events.push(
      SorciEvent.create({
        type: "todo-list-renamed",
        data: {
          title,
          todoListId: this.aggregateId
        }
      })
    );
    return this;
  }

  propertyChangedTo(builder: UserBuilder) {
    this._events.push(
      SorciEvent.create({
        type: "todo-list-property-changed",
        data: {
          todoListId: this.aggregateId,
          userId: builder.aggregateId
        }
      })
    );
    return this;
  }

  deleted() {
    this._events.push(
      SorciEvent.create({
        type: "todo-list-deleted",
        data: {
          todoListId: this.aggregateId
        }
      })
    );
    return this;
  }

  with(builder: TodoListItemBuilder) {
    builder.fromTodoListId(this.aggregateId);
    this._todoListItems.push(builder);
    return this;
  }

  from(builder: UserBuilder) {
    this.userBuilderOrUserId = { builder };
    this._events[0].data.userId = builder.aggregateId;
    this._events[0].identifier.userId = builder.aggregateId;
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

  async build() {
    await this.buildUserAndGetId();
    await this.sorci.insertEvents(this._events);
    await this.buildTodoListItems();

    const events = await this.sorci.getEventsByQuery({
      $where: {
        identifiers: { todoListId: this.aggregateId }
      }
    });

    return { todoListBuilder: this, events };
  }
}
