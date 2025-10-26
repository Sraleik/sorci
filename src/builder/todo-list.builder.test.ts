import { createId } from "../common/utils";

describe("Given aTodoList Builder", async () => {
  test("Create a simple todo list", async () => {
    const { events } = await aTodoList().build();
    const todoListId = events[0].data.todoListId;
    const createdByUserId = events[0].data.createdByUserId;

    const userEvents = await sorciTestClient.getEventsByQuery({
      $where: {
        identifiers: { userId: createdByUserId }
      }
    });

    expect(todoListId).toBeUlid();
    expect(events).toHaveLength(1);
    expect(userEvents.length).toBeGreaterThanOrEqual(1);
  });

  test("Create a with a custom name and id", async () => {
    const todoListId = createId();
    const todoListName = "Morning routine";
    const { events } = await aTodoList()
      .withInitialTitle(todoListName)
      .withId(todoListId)
      .build();

    const createdEvent = events[0];
    const todoListPersistedTitle = createdEvent.data.title;
    const todoListPersistedId = createdEvent.identifier.todoListId;

    expect(todoListPersistedId).toEqual(todoListId);
    expect(todoListPersistedTitle).toEqual(todoListName);
    expect(events).toHaveLength(1);
  });

  test("Rename a todo list", async () => {
    const { events } = await aTodoList()
      .withInitialTitle("Morning routine")
      .renamed("Bedtimeroutine")
      .build();

    const todoListTitle = events.reverse().find((event) => event.data.title)
      ?.data.title;

    expect(events).toHaveLength(2);
    expect(todoListTitle).toEqual("Bedtimeroutine");
  });

  test("Delete a todo list", async () => {
    const { events } = await aTodoList()
      .withInitialTitle("Morning routine")
      .renamed("Bedtimeroutine")
      .renamed("Nightroutine")
      .deleted()
      .build();

    const todoListTitle = events.reverse().find((event) => event.data.title)
      ?.data.title;

    expect(events).toHaveLength(4);
    expect(todoListTitle).toEqual("Nightroutine");
  });

  test("Add a few todo items to a todo list", async () => {
    const { events } = await aTodoList()
      .withInitialTitle("Morning routine")
      .with(aTodoListItem().withInitialTitle("Buy milk"))
      .with(aTodoListItem().withInitialTitle("Buy bread"))
      .with(aTodoListItem().withInitialTitle("Buy eggs"))
      .build();

    expect(events).toHaveLength(4);
  });

  test("Add a few todo items to a todo list", async () => {
    const { events } = await aTodoList()
      .withInitialTitle("Morning routine")
      .with(aTodoListItem().withInitialTitle("Buy milk"))
      .with(aTodoListItem().withInitialTitle("Buy bread"))
      .with(aTodoListItem().withInitialTitle("Buy eggs"))
      .build();

    expect(events).toHaveLength(4);
  });
});
