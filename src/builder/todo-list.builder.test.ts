import {
  test,
  expect,
  describe,
  beforeAll,
  beforeEach,
  afterEach,
  afterAll
} from "vitest";
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer
} from "testcontainers";
import { createId } from "../common/utils";
import { PersistedEvent, Sorci } from "../sorci.interface";
import { SorciPostgres } from "../sorci.postgres";
import { TodoListBuilder } from "./todo-list.builder";
import { TodoListItemBuilder } from "./todo-list-item.builer";
import { UserBuilder } from "./user.builder";
import { SorciEvent } from "../sorci-event";

// Concurency issue, not new event added between decision and persistance

let pgInstance: StartedPostgreSqlContainer;
let sorci: Sorci;

let aTodoList: () => TodoListBuilder;
let aTodoListItem: () => TodoListItemBuilder;
let aUser: () => UserBuilder;

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

  aUser = () => new UserBuilder({ sorci });
  aTodoList = () => new TodoListBuilder({ sorci, aUser });
  aTodoListItem = () => new TodoListItemBuilder({ sorci, aTodoList });
}, 30000);

beforeEach(async () => {
  await sorci.setupTestStream();
});

afterEach(async () => {
  await sorci.dropCurrentStream();
});

afterAll(async () => {
  await sorci.close();
  await new Promise((resolve) => setTimeout(resolve, 100));
  await pgInstance.stop();
});

describe("Given aTodoList Builder", async () => {
  test("Create a simple todo list", async () => {
    const { events } = await aTodoList().build();
    const todoListId = events[0].data.todoListId;
    const createdByUserId = events[0].data.createdByUserId;

    const userEvents = await sorci.getEventsByQuery({
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
      .withId("01K7WH8S6FMW2911Q1Y6EV7N05")
      .withInitialTitle("Morning routine")
      .with(aTodoListItem().withInitialTitle("Buy milk"))
      .with(aTodoListItem().withInitialTitle("Buy bread"))
      .with(aTodoListItem().withInitialTitle("Buy eggs"))
      .build();

    expect(events).toHaveLength(4);
  });

  test("Add a few todo items to a todo list", async () => {
    const { events } = await aTodoList()
      .withId("01K7WH8S6FMW2911Q1Y6EV7N05")
      .withInitialTitle("Morning routine")
      .with(aTodoListItem().withInitialTitle("Buy milk"))
      .with(aTodoListItem().withInitialTitle("Buy bread"))
      .with(aTodoListItem().withInitialTitle("Buy eggs"))
      .build();

    expect(events).toHaveLength(4);
  });
});
