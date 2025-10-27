import { PersistedEvent } from "../sorci.interface";

describe("Given a TodoListItem Builder", async () => {
  describe("When building the most basic todo list item", async () => {
    let todoListItemEvents: PersistedEvent[];
    let todoListItemCreatedEvent: PersistedEvent;

    beforeAll(async () => {
      const { events } = await aTodoListItem().build();

      todoListItemEvents = [...events];
      todoListItemCreatedEvent = todoListItemEvents[0];
    });

    test("Then one todo list item event is created", async () => {
      expect(todoListItemEvents.length).toBeGreaterThanOrEqual(1);
    });

    test("Then the item has been added by a user", async () => {
      expect(todoListItemCreatedEvent.data.actorId).toBeUlid();
      expect(todoListItemCreatedEvent.identifier.actorId).toBeUlid();
    });
  });
  describe("When creating a todo list item from a customized todo list", async () => {
    let events: PersistedEvent[];
    let todoListItemId: string;

    beforeAll(async () => {
      const result = await aTodoListItem()
        .from(aTodoList().withInitialTitle("Morning routine"))
        .build();
      events = result.events;
      todoListItemId = events[0].data.todoListItemId;
    });

    test("Then the todo list item has a valid ulid", async () => {
      expect(todoListItemId).toBeUlid();
    });
  });
});
