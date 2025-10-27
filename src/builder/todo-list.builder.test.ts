import { createId } from "../common/utils";
import { PersistedEvent } from "../sorci.interface";

describe("Given aTodoList Builder", async () => {
  describe("When building the most basic todo list", async () => {
    let events: PersistedEvent[];
    let userEvents: PersistedEvent[];
    let createdEvent: PersistedEvent;
    beforeAll(async () => {
      const { events: todoListEvents } = await aTodoList().build();
      events = todoListEvents;
      createdEvent = events[0];
      const actorId = createdEvent.data.actorId;

      userEvents = await sorciTestClient.getEventsByQuery({
        $where: {
          identifiers: { userId: actorId }
        }
      });
    });

    test("Then the todo list is created with an ulid id", async () => {
      const todoListId = createdEvent.identifier.todoListId;

      expect(todoListId).toBeUlid();
    });

    test("Then the todo list has an actorId identifier", async () => {
      const actorId = createdEvent.identifier.actorId;

      expect(actorId).toBeUlid();
    });

    test("Then the todo list has an actorId", async () => {
      const actorId = createdEvent.data.actorId;

      expect(actorId).toBeUlid();
    });

    test("Then the todo list has the same actorId in data and identifier", async () => {
      const dataActorId = createdEvent.data.actorId;
      const identifierActorId = createdEvent.identifier.actorId;

      expect(dataActorId).toEqual(identifierActorId);
    });

    test("Then the actorId is in the identifier", async () => {
      const actorId = createdEvent.identifier.actorId;

      expect(actorId).toBeDefined();
      expect(actorId).toBeUlid();
    });

    test("Then the creator has been created too", async () => {
      expect(userEvents.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("When creating a todo list with a custom name and id", async () => {
    let events: PersistedEvent[];
    let createdEvent: PersistedEvent;
    const todoListId = createId();
    const todoListName = "Morning routine";

    beforeAll(async () => {
      const result = await aTodoList()
        .withInitialTitle(todoListName)
        .withId(todoListId)
        .build();
      events = result.events;
      createdEvent = events[0];
    });

    test("Then the todo list has the custom id", async () => {
      const todoListPersistedId = createdEvent.identifier.todoListId;
      expect(todoListPersistedId).toEqual(todoListId);
    });

    test("Then the todo list has the custom title", async () => {
      const todoListPersistedTitle = createdEvent.data.title;
      expect(todoListPersistedTitle).toEqual(todoListName);
    });
  });

  describe("When renaming a todo list", async () => {
    let events: PersistedEvent[];
    let todoListTitle: string | undefined;

    beforeAll(async () => {
      const result = await aTodoList()
        .withInitialTitle("Morning routine")
        .renamed({ name: "Bedtimeroutine" })
        .build();
      events = result.events;
      todoListTitle = [...events].reverse().find((event) => event.data.title)
        ?.data.title;
    });

    test("Then two events are created", async () => {
      expect(events).toHaveLength(2);
    });

    test("Then the todo list has the new title", async () => {
      expect(todoListTitle).toEqual("Bedtimeroutine");
    });
  });

  describe("When deleting a todo list after multiple renames", async () => {
    let events: PersistedEvent[];
    let todoListTitle: string | undefined;

    beforeAll(async () => {
      const result = await aTodoList()
        .withInitialTitle("Morning routine")
        .renamed({ name: "Bedtimeroutine" })
        .renamed({ name: "Nightroutine" })
        .deleted()
        .build();
      events = result.events;
      todoListTitle = events.reverse().find((event) => event.data.title)
        ?.data.title;
    });

    test("Then four events are created", async () => {
      expect(events).toHaveLength(4);
    });

    test("Then the todo list has the last renamed title", async () => {
      expect(todoListTitle).toEqual("Nightroutine");
    });
  });

  describe("When adding multiple todo items to a todo list", async () => {
    let events: PersistedEvent[];

    beforeAll(async () => {
      const result = await aTodoList()
        .withInitialTitle("Morning routine")
        .with(aTodoListItem().withInitialTitle("Buy milk"))
        .with(aTodoListItem().withInitialTitle("Buy bread"))
        .with(aTodoListItem().withInitialTitle("Buy eggs"))
        .build();
      events = result.events;
    });

    test("Then four events are created", async () => {
      expect(events).toHaveLength(4);
    });
  });
});
