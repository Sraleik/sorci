import { createId } from "../common/utils";
import { SorciEvent } from "../sorci-event";
import { Sorci } from "../sorci.interface";
import type { TodoListItemBuilder } from "./todo-list-item.builer";

export class TodoListBuilder {
  private sorci: Sorci;
  private _aggregateId: string;
  private _events: SorciEvent[] = [];
  private _todoListItems: TodoListItemBuilder[] = [];

  constructor(payload: { sorci: Sorci }) {
    const { sorci } = payload;
    this.sorci = sorci;
    this._aggregateId = createId();

    this._events.push(
      SorciEvent.create({
        data: {
          title: "Weekly groceries",
          todoListId: this.aggregateId
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

  renamed(name: string) {
    this._events.push(
      SorciEvent.create({
        data: {
          title: name,
          todoListId: this.aggregateId
        },
        type: "todo-list-renamed"
      })
    );
    return this;
  }

  deleted() {
    this._events.push(
      SorciEvent.create({
        data: {
          todoListId: this.aggregateId
        },
        type: "todo-list-deleted"
      })
    );
    return this;
  }

  with(builder: TodoListItemBuilder) {
    builder.fromTodoListId(this.aggregateId);
    this._todoListItems.push(builder);
    return this;
  }

  private buildTodoListItems() {
    return Promise.all(this._todoListItems.map((builder) => builder.build()));
  }

  async build() {
    await this.sorci.insertEvents(this._events);
    await this.buildTodoListItems();

    const events = await this.sorci.getEventsByQuery({
      $where: {
        identifiers: { todoListId: { $eq: this.aggregateId } }
      }
    });

    return { todoListBuilder: this, events };
  }
}
