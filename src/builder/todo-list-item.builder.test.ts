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
import { Sorci } from "../sorci.interface";
import { SorciPostgres } from "../sorci.postgres";
import { TodoListBuilder } from "./todo-list.builder";
import { TodoListItemBuilder } from "./todo-list-item.builer";
import { UserBuilder } from "./user.builder";

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
  await pgInstance.stop();
});

describe("Test on todo list item", async () => {
  test("Create a todo list item from a customized todo list", async () => {
    const { events } = await aTodoListItem()
      .from(aTodoList().withInitialTitle("Morning routine"))
      .build();

    const todoListItemId = events[0].data.todoListItemId;
    expect(todoListItemId).toBeUlid();
  });
  test("Create a simple todo list item", async () => {
    const { todoListItemBuilder: todoListItem } = await aTodoListItem().build();

    const todoListItemEvents = await sorci.getEventsByQuery({
      $where: {
        identifiers: { todoListItemId: todoListItem.aggregateId }
      }
    });

    const todoListEvents = await sorci.getEventsByQuery({
      $where: {
        identifiers: { todoListId: todoListItem.todoListId }
      }
    });

    expect(todoListItemEvents).toHaveLength(1);
    expect(todoListEvents).toHaveLength(2);
  });
});
