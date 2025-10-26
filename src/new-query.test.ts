import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer
} from "@testcontainers/postgresql";
import { createId } from "./common/utils";
import { Sorci } from "./sorci.interface";
import { SorciPostgres } from "./sorci.postgres";
import { TodoListBuilder } from "./builder/todo-list.builder";
import { TodoListItemBuilder } from "./builder/todo-list-item.builer";
import { UserBuilder } from "./builder/user.builder";

// Concurency issue, not new event added between decision and persistance

let pgInstance: StartedPostgreSqlContainer;
let sorci: Sorci;

let aUser: () => UserBuilder;
let aTodoList: () => TodoListBuilder;
let aTodoListItem: () => TodoListItemBuilder;

beforeAll(async () => {
  const pgInstanceNotReady = new PostgreSqlContainer("postgres:15.3-alpine");
  pgInstance = await pgInstanceNotReady
    // .withExposedPorts({ container: 5432, host: 42420 }) // Usefull for debugging
    // .withReuse() // The docker won't be removed after the test
    .start();
  const host = pgInstance.getHost();
  const port = pgInstance.getPort();
  const user = pgInstance.getUsername();
  const password = pgInstance.getPassword();
  const databaseName = pgInstance.getDatabase();

  sorci = new SorciPostgres({
    host,
    port,
    user,
    password,
    databaseName,
    streamName: "useless_stream_name"
  });

  await sorci.setupTestStream();
  aUser = () => new UserBuilder({ sorci });
  aTodoList = () => new TodoListBuilder({ sorci, aUser });
  aTodoListItem = () => new TodoListItemBuilder({ sorci, aTodoList });
}, 30000);

// beforeEach(async () => {
//   await sorci.setupTestStream();
// });

// afterEach(async () => {
//   await sorci.dropCurrentStream();
// });

afterAll(async () => {
  await sorci.close();
  await pgInstance.stop();
});

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
    const eventsPersisted = await sorci.getEventsByQuery({
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
    const eventsPersisted = await sorci.getEventsByQuery({
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
    const eventsPersisted = await sorci.getEventsByQuery({
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
    const eventsPersisted = await sorci.getEventsByQuery({
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
    const eventsPersisted = await sorci.getEventsByQuery({
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
    const eventsPersisted = await sorci.getEventsByQuery({
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
    const eventsPersisted = await sorci.getEventsByQuery({
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
