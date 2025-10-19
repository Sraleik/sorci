import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer
} from "testcontainers";
import { createId } from "./common/utils";
import { Sorci } from "./sorci.interface";
import { SorciPostgres } from "./sorci.postgres";
import { TodoListBuilder } from "./builder/todo-list.builder";
import { TodoListItemBuilder } from "./builder/todo-list-item.builer";
import { SorciEvent } from "./sorci-event";

let pgInstance: StartedPostgreSqlContainer;
let sorci: Sorci;

let aTodoList: () => TodoListBuilder;
let aTodoListItem: () => TodoListItemBuilder;

beforeAll(async () => {
  const pgInstanceNotReady = new PostgreSqlContainer("postgres:15.3-alpine");
  pgInstance = await pgInstanceNotReady.start();
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
  aTodoList = () => new TodoListBuilder({ sorci });
  aTodoListItem = () => new TodoListItemBuilder({ sorci, aTodoList });
}, 30000);

afterAll(async () => {
  await pgInstance.stop();
});

describe("Dynamic Consistency Boundary (DCB) - Optimistic Concurrency Control", () => {
  test("should persist both events when there is no concurrency issue", async () => {
    const todoListId = createId();
    const itemToRenameId = createId();

    await aTodoList()
      .withId(todoListId)
      .withInitialTitle("Shopping list")
      .with(aTodoListItem().withInitialTitle("Item 1"))
      .with(aTodoListItem().withId(itemToRenameId).withInitialTitle("Item 2"))
      .with(aTodoListItem().withInitialTitle("Item 3"))
      .with(aTodoListItem().withInitialTitle("Item 4"))
      .with(aTodoListItem().withInitialTitle("Item 5"))
      .with(aTodoListItem().withInitialTitle("Item 6"))
      .with(aTodoListItem().withInitialTitle("Item 7"))
      .with(aTodoListItem().withInitialTitle("Item 8"))
      .with(aTodoListItem().withInitialTitle("Item 9"))
      .build();

    const itemEvents = await sorci.getEventsByQueryV2({
      $where: {
        type: { $eq: "todo-list-created" },
        todoListId: { $eq: todoListId }
      }
    });
    const itemEvents2 = await sorci.getEventsByQueryV2({
      $where: {
        type: { $eq: "todo-list-item-created" },
        todoListItemId: { $eq: itemToRenameId }
      }
    });
    const todoListLastId = itemEvents[itemEvents.length - 1].id;
    const todoListItemLastId = itemEvents2[itemEvents2.length - 1].id;

    const todoListRenamedEvent = SorciEvent.create({
      type: "todo-list-renamed",
      data: {
        title: "Shopping list - User A",
        todoListId
      }
    });

    const todoListItemRenamedEvent = SorciEvent.create({
      type: "todo-list-item-renamed",
      data: {
        title: "Item 10 - User B",
        todoListItemId: itemToRenameId,
        todoListId: todoListId
      }
    });

    const concurrentPromises = [
      sorci.appendEventV2({
        sourcingEvent: todoListRenamedEvent,
        queryV2: {
          $where: {
            type: { $eq: "todo-list-created" },
            todoListId: { $eq: todoListId }
          }
        },
        lastKnownEventId: todoListLastId
      }),
      sorci.appendEventV2({
        sourcingEvent: todoListItemRenamedEvent,
        queryV2: {
          $where: {
            type: { $eq: "todo-list-item-created" },
            todoListItemId: { $eq: itemToRenameId }
          }
        },
        lastKnownEventId: todoListItemLastId
      })
    ];

    const results = await Promise.allSettled(concurrentPromises);

    expect(results.map((result) => result.status)).toEqual([
      "fulfilled",
      "fulfilled"
    ]);
  });
  test("should have one event persisted the other one rejected", async () => {
    const todoListId = createId();

    await aTodoList()
      .withId(todoListId)
      .withInitialTitle("Shopping list")
      .with(aTodoListItem().withInitialTitle("Item 1"))
      .with(aTodoListItem().withInitialTitle("Item 2"))
      .with(aTodoListItem().withInitialTitle("Item 3"))
      .with(aTodoListItem().withInitialTitle("Item 4"))
      .with(aTodoListItem().withInitialTitle("Item 5"))
      .with(aTodoListItem().withInitialTitle("Item 6"))
      .with(aTodoListItem().withInitialTitle("Item 7"))
      .with(aTodoListItem().withInitialTitle("Item 8"))
      .with(aTodoListItem().withInitialTitle("Item 9"))
      .build();

    const itemEvents = await sorci.getEventsByQueryV2({
      $where: {
        type: { $eq: "todo-list-created" },
        todoListId: { $eq: todoListId }
      }
    });

    const todoListLastId = itemEvents[itemEvents.length - 1].id;

    const todoListCreated2 = SorciEvent.create({
      type: "todo-list-created",
      data: {
        title: "Shopping list - User A",
        todoListId
      }
    });

    const todoListCreated3 = SorciEvent.create({
      type: "todo-list-created",
      data: {
        title: "Shopping list - User B",
        todoListId
      }
    });

    const concurrentPromises = [
      sorci.appendEventV2({
        sourcingEvent: todoListCreated2,
        queryV2: {
          $where: {
            type: { $eq: "todo-list-created" },
            todoListId: { $eq: todoListId }
          }
        },
        lastKnownEventId: todoListLastId
      }),
      sorci.appendEventV2({
        sourcingEvent: todoListCreated3,
        queryV2: {
          $where: {
            type: { $eq: "todo-list-created" },
            todoListId: { $eq: todoListId }
          }
        },
        lastKnownEventId: todoListLastId
      })
    ];

    const results = await Promise.allSettled(concurrentPromises);

    const statusArray = results.map((result) => result.status);

    expect(statusArray).toContain("fulfilled");
    expect(statusArray).toContain("rejected");
  });

  test("should work without query (simple append without concurrency check)", async () => {
    const todoListId = createId();

    const event = SorciEvent.create({
      data: {
        title: "Simple todo list",
        todoListId
      },
      type: "todo-list-created"
    });

    const eventId = await sorci.appendEventV2({
      sourcingEvent: event
    });

    expect(eventId).toBeDefined();

    const retrievedEvent = await sorci.getEventById(eventId);
    expect(retrievedEvent?.type).toBe("todo-list-created");
    expect(retrievedEvent?.data.title).toBe("Simple todo list");
  });
});
