import { createId } from "../common/utils";
import { SorciEvent } from "../sorci-event";
import { Sorci } from "../sorci.interface";
import { TodoListBuilder } from "./todo-list.builder";
import { BuilderOrId } from "../type";

export class TodoListItemBuilder {
  private sorci: Sorci;
  private _events: SorciEvent[] = [];
  private todoListBuilderOrTodoListId: BuilderOrId<TodoListBuilder>;

  constructor(payload: { sorci: Sorci; aTodoList: () => TodoListBuilder }) {
    const { sorci, aTodoList } = payload;
    this.sorci = sorci;
    const initialAggregateId = createId();

    this.todoListBuilderOrTodoListId = { builder: aTodoList() };

    this._events.push(
      SorciEvent.create({
        data: {
          title: "Buy milk",
          todoListId: this.todoListId,
          todoListItemId: initialAggregateId
        },
        type: "todo-list-item-created"
      })
    );
  }

  private setAggregateId(id: string) {
    this._events.forEach((event) => {
      event.data.todoListItemId = id;
      event.identifier.todoListItemId = id;
    });
  }

  private setTodoListId(id: string) {
    this._events.forEach((event) => {
      event.data.todoListId = id;
      event.identifier.todoListId = id;
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
    this._events.push(
      SorciEvent.create({
        data: {
          title: name,
          todoListId: this.todoListId,
          todoListItemId: this.aggregateId
        },
        type: "todo-list-item-renamed"
      })
    );
    return this;
  }

  deleted() {
    this._events.push(
      SorciEvent.create({
        data: {
          todoListId: this.todoListId,
          todoListItemId: this.aggregateId
        },
        type: "todo-list-item-deleted"
      })
    );
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

  async build() {
    await this.buildAndGetTodoListId();

    await this.sorci.insertEvents(this._events);

    const events = await this.sorci.getEventsByQuery({
      $where: {
        identifiers: { todoListItemId: this.aggregateId }
      }
    });

    return { todoListItemBuilder: this, events };
  }
}
