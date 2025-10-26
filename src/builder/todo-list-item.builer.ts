import { createId } from "../common/utils";
import { SorciEvent } from "../sorci-event";
import { Sorci } from "../sorci.interface";
import { TodoListBuilder } from "./todo-list.builder";
import { BuilderOrId } from "../type";
import { UserBuilder } from "./user.builder";

export class TodoListItemBuilder {
  private sorci: Sorci;
  private _events: {
    data: Record<string, any>;
    identifier?: Record<string, any>;
    type: string;
  }[] = [];
  private todoListBuilderOrTodoListId: BuilderOrId<TodoListBuilder>;
  private userBuilderOrUserId: BuilderOrId<UserBuilder>;

  constructor(payload: {
    sorci: Sorci;
    aTodoList: () => TodoListBuilder;
    aUser: () => UserBuilder;
  }) {
    const { sorci, aTodoList, aUser } = payload;
    this.sorci = sorci;
    const initialAggregateId = createId();

    this.todoListBuilderOrTodoListId = { builder: aTodoList() };
    this.userBuilderOrUserId = { builder: aUser() };

    this._events.push({
      data: {
        title: "Buy milk",
        todoListId: this.todoListId,
        todoListItemId: initialAggregateId,
        createdByUserId: this.userBuilderOrUserId.builder.aggregateId
      },
      identifier: {
        userId: this.userBuilderOrUserId.builder.aggregateId,
        todoListId: this.todoListId,
        todoListItemId: initialAggregateId
      },
      type: "todo-list-item-created"
    });
  }

  private setAggregateId(id: string) {
    this._events.forEach((event) => {
      event.data.todoListItemId = id;
      if (event.identifier) {
        event.identifier.todoListItemId = id;
      }
    });
  }

  private setTodoListId(id: string) {
    this._events.forEach((event) => {
      event.data.todoListId = id;
      if (event.identifier) {
        event.identifier.todoListId = id;
      }
    });
  }

  private get createdEvent() {
    return this._events[0];
  }

  get aggregateId() {
    return this.createdEvent.data.todoListItemId;
  }

  get todoListId() {
    if (this.todoListBuilderOrTodoListId.builder) {
      return this.todoListBuilderOrTodoListId.builder.aggregateId;
    }

    return this.todoListBuilderOrTodoListId.id;
  }

  get title() {
    return [...this._events].reverse().find((event) => event.data.title)?.data
      .title;
  }

  get events() {
    return [...this._events];
  }

  from(builder: TodoListBuilder) {
    this.todoListBuilderOrTodoListId = { builder };
    return this;
  }

  fromTodoListId(id: string) {
    this.todoListBuilderOrTodoListId = { id };
    this.setTodoListId(id);
    return this;
  }

  withId(id: string) {
    this.setAggregateId(id);
    return this;
  }

  withInitialTitle(title: string) {
    this._events[0].data.title = title;
    return this;
  }

  renamed(name: string) {
    this._events.push({
      data: {
        title: name,
        todoListId: this.todoListId,
        todoListItemId: this.aggregateId
      },
      type: "todo-list-item-renamed"
    });
    return this;
  }

  deleted() {
    this._events.push({
      data: {
        todoListId: this.todoListId,
        todoListItemId: this.aggregateId
      },
      type: "todo-list-item-deleted"
    });
    return this;
  }

  private async buildAndGetTodoListId() {
    if (this.todoListBuilderOrTodoListId.builder) {
      const { todoListBuilder: todoList } =
        await this.todoListBuilderOrTodoListId.builder.build();
      this.todoListBuilderOrTodoListId = { id: todoList.aggregateId };
      return todoList.aggregateId;
    }
    return this.todoListBuilderOrTodoListId.id;
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
    await this.buildAndGetTodoListId();

    await this.sorci.insertEvents(
      this._events.map((event) => SorciEvent.create(event))
    );

    const events = await this.sorci.getEventsByQuery({
      $where: {
        identifiers: { todoListItemId: this.aggregateId }
      }
    });

    return { todoListItemBuilder: this, events };
  }
}
