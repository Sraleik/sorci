import { createId } from "./common/utils";

describe("Test on todo list", async () => {
  const morningRoutineId = createId();
  const groceryListId = createId();

  beforeAll(async () => {
    await aTodoList()
      .withId(morningRoutineId)
      .withInitialTitle("Morning routine")
      .with(aTodoListItem().withInitialTitle("Wash face"))
      .with(aTodoListItem().withInitialTitle("Brush teeth"))
      .with(aTodoListItem().withInitialTitle("Put on clothes"))
      .build();

    await aTodoList()
      .withId(groceryListId)
      .withInitialTitle("Grocery list")
      .with(
        aTodoListItem()
          .withId("01K7XSD9QG35FN4NQZVKC6AHA4")
          .withInitialTitle("Buy milk")
      )
      .with(aTodoListItem().withInitialTitle("Buy bread"))
      .with(aTodoListItem().withInitialTitle("Buy eggs"))
      .renamed("Big grocery list")
      .with(aTodoListItem().withInitialTitle("Buy cheese"))
      .with(aTodoListItem().withInitialTitle("Buy yogurt"))
      .deleted()
      .build();
  });
  test("Get events by specific type", async () => {
    const eventsPersisted = await sorciTestClient.getEventsByQuery({
      $where: {
        type: { $eq: "todo-list-created" }
      }
    });

    expect(eventsPersisted.length).toBeGreaterThanOrEqual(2);
    eventsPersisted.forEach((event) => {
      expect(event.type).toEqual("todo-list-created");
    });
  });

  test("Get events by specific type using string shorthand", async () => {
    const eventsPersisted = await sorciTestClient.getEventsByQuery({
      $where: {
        type: "todo-list-created"
      }
    });

    expect(eventsPersisted.length).toBeGreaterThanOrEqual(2);
    eventsPersisted.forEach((event) => {
      expect(event.type).toEqual("todo-list-created");
    });
  });

  test("Get events by specific aggregateid", async () => {
    const eventsPersisted = await sorciTestClient.getEventsByQuery({
      $where: {
        identifiers: { todoListId: groceryListId }
      }
    });

    expect(eventsPersisted.length).toBeGreaterThanOrEqual(7);
    eventsPersisted.forEach((event) => {
      expect(event.data.todoListId).toEqual(groceryListId);
    });
  });

  test("Get events by specific aggregateid using $eq", async () => {
    const eventsPersisted = await sorciTestClient.getEventsByQuery({
      $where: {
        identifiers: { todoListId: groceryListId }
      }
    });

    expect(eventsPersisted.length).toBeGreaterThanOrEqual(7);
    eventsPersisted.forEach((event) => {
      expect(event.data.todoListId).toEqual(groceryListId);
    });
  });
  test("Get events by specific types and aggregateId", async () => {
    const eventsPersisted = await sorciTestClient.getEventsByQuery({
      $where: {
        type: { $in: ["todo-list-created", "todo-list-deleted"] },
        identifiers: { todoListId: groceryListId }
      }
    });

    expect(eventsPersisted.length).toBeGreaterThanOrEqual(2);
    eventsPersisted.forEach((event) => {
      expect(["todo-list-created", "todo-list-deleted"]).toContain(event.type);
      expect(event.data.todoListId).toEqual(groceryListId);
    });
  });

  test("Get events by specific types and aggregateId using mixed syntax", async () => {
    const eventsPersisted = await sorciTestClient.getEventsByQuery({
      $where: {
        type: { $in: ["todo-list-created", "todo-list-deleted"] },
        identifiers: { todoListId: groceryListId }
      }
    });

    expect(eventsPersisted.length).toBeGreaterThanOrEqual(2);
    eventsPersisted.forEach((event) => {
      expect(["todo-list-created", "todo-list-deleted"]).toContain(event.type);
      expect(event.data.todoListId).toEqual(groceryListId);
    });
  });

  test("Get a $where with $or", async () => {
    const eventsPersisted = await sorciTestClient.getEventsByQuery({
      $where: {
        $or: [
          {
            type: {
              $in: ["todo-list-created", "todo-list-deleted"]
            },
            identifiers: { todoListId: groceryListId }
          },
          {
            type: { $in: ["todo-list-item-created", "todo-list-item-deleted"] },
            identifiers: { todoListId: groceryListId }
          }
        ]
      }
    });

    expect(eventsPersisted).toHaveLength(7);
    eventsPersisted.forEach((event) => {
      expect([
        "todo-list-created",
        "todo-list-deleted",
        "todo-list-item-created",
        "todo-list-item-deleted"
      ]).toContain(event.type);
      expect(event.data.todoListId).toEqual(groceryListId);
    });
  });
});
