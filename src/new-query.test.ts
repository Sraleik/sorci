import { createId } from "./common/utils";
import { PersistedEvent } from "./sorci.interface";

describe("Given persisted todo list events", async () => {
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
      .renamed({ name: "Big grocery list" })
      .with(aTodoListItem().withInitialTitle("Buy cheese"))
      .with(aTodoListItem().withInitialTitle("Buy yogurt"))
      .deleted()
      .build();
  });

  describe("When querying by specific type with $eq operator", async () => {
    let eventsPersisted: PersistedEvent[];

    beforeAll(async () => {
      eventsPersisted = await sorciTestClient.getEventsByQuery({
        $where: {
          type: { $eq: "todo-list-created" }
        }
      });
    });

    test("Then at least two events are returned", async () => {
      expect(eventsPersisted.length).toBeGreaterThanOrEqual(2);
    });

    test("Then all events have the expected type", async () => {
      eventsPersisted.forEach((event) => {
        expect(event.type).toEqual("todo-list-created");
      });
    });
  });

  describe("When querying by specific type using string shorthand", async () => {
    let eventsPersisted: PersistedEvent[];

    beforeAll(async () => {
      eventsPersisted = await sorciTestClient.getEventsByQuery({
        $where: {
          type: "todo-list-created"
        }
      });
    });

    test("Then at least two events are returned", async () => {
      expect(eventsPersisted.length).toBeGreaterThanOrEqual(2);
    });

    test("Then all events have the expected type", async () => {
      eventsPersisted.forEach((event) => {
        expect(event.type).toEqual("todo-list-created");
      });
    });
  });

  describe("When querying by specific aggregate id", async () => {
    let eventsPersisted: PersistedEvent[];

    beforeAll(async () => {
      eventsPersisted = await sorciTestClient.getEventsByQuery({
        $where: {
          identifiers: { todoListId: groceryListId }
        }
      });
    });

    test("Then at least seven events are returned", async () => {
      expect(eventsPersisted.length).toBeGreaterThanOrEqual(7);
    });

    test("Then all events have the expected aggregate id", async () => {
      eventsPersisted.forEach((event) => {
        expect(event.data.todoListId).toEqual(groceryListId);
      });
    });
  });

  describe("When querying by specific aggregate id using $eq", async () => {
    let eventsPersisted: PersistedEvent[];

    beforeAll(async () => {
      eventsPersisted = await sorciTestClient.getEventsByQuery({
        $where: {
          identifiers: { todoListId: groceryListId }
        }
      });
    });

    test("Then at least seven events are returned", async () => {
      expect(eventsPersisted.length).toBeGreaterThanOrEqual(7);
    });

    test("Then all events have the expected aggregate id", async () => {
      eventsPersisted.forEach((event) => {
        expect(event.data.todoListId).toEqual(groceryListId);
      });
    });
  });

  describe("When querying by specific types and aggregate id", async () => {
    let eventsPersisted: PersistedEvent[];

    beforeAll(async () => {
      eventsPersisted = await sorciTestClient.getEventsByQuery({
        $where: {
          type: { $in: ["todo-list-created", "todo-list-deleted"] },
          identifiers: { todoListId: groceryListId }
        }
      });
    });

    test("Then at least two events are returned", async () => {
      expect(eventsPersisted.length).toBeGreaterThanOrEqual(2);
    });

    test("Then all events have one of the expected types", async () => {
      eventsPersisted.forEach((event) => {
        expect(["todo-list-created", "todo-list-deleted"]).toContain(
          event.type
        );
      });
    });

    test("Then all events have the expected aggregate id", async () => {
      eventsPersisted.forEach((event) => {
        expect(event.data.todoListId).toEqual(groceryListId);
      });
    });
  });

  describe("When querying by specific types and aggregate id using mixed syntax", async () => {
    let eventsPersisted: PersistedEvent[];

    beforeAll(async () => {
      eventsPersisted = await sorciTestClient.getEventsByQuery({
        $where: {
          type: { $in: ["todo-list-created", "todo-list-deleted"] },
          identifiers: { todoListId: groceryListId }
        }
      });
    });

    test("Then at least two events are returned", async () => {
      expect(eventsPersisted.length).toBeGreaterThanOrEqual(2);
    });

    test("Then all events have one of the expected types", async () => {
      eventsPersisted.forEach((event) => {
        expect(["todo-list-created", "todo-list-deleted"]).toContain(
          event.type
        );
      });
    });

    test("Then all events have the expected aggregate id", async () => {
      eventsPersisted.forEach((event) => {
        expect(event.data.todoListId).toEqual(groceryListId);
      });
    });
  });

  describe("When querying with $or operator", async () => {
    let eventsPersisted: PersistedEvent[];

    beforeAll(async () => {
      eventsPersisted = await sorciTestClient.getEventsByQuery({
        $where: {
          $or: [
            {
              type: {
                $in: ["todo-list-created", "todo-list-deleted"]
              },
              identifiers: { todoListId: groceryListId }
            },
            {
              type: {
                $in: ["todo-list-item-created", "todo-list-item-deleted"]
              },
              identifiers: { todoListId: groceryListId }
            }
          ]
        }
      });
    });

    test("Then exactly seven events are returned", async () => {
      expect(eventsPersisted).toHaveLength(7);
    });

    test("Then all events have one of the expected types", async () => {
      eventsPersisted.forEach((event) => {
        expect([
          "todo-list-created",
          "todo-list-deleted",
          "todo-list-item-created",
          "todo-list-item-deleted"
        ]).toContain(event.type);
      });
    });

    test("Then all events have the expected aggregate id", async () => {
      eventsPersisted.forEach((event) => {
        expect(event.data.todoListId).toEqual(groceryListId);
      });
    });
  });
});
