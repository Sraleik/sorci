import { Bench } from "tinybench";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { SorciPostgres } from "./sorci.postgres";
import { createTodoListFullLife } from "./test-helpers";
import { TodoListBuilder } from "./builder/todo-list.builder";
import { TodoListItemBuilder } from "./builder/todo-list-item.builer";
import { SorciEvent } from "./sorci-event";
import { UserBuilder } from "./builder/user.builder";

const bench = new Bench({ time: 5000 });

const pgInstance = await new PostgreSqlContainer("postgres:15.3-alpine")
  .withExposedPorts({
    container: 5432,
    host: 42420
  })
  .withReuse()
  .start();

const host = pgInstance.getHost();
const port = pgInstance.getPort();
const user = pgInstance.getUsername();
const password = pgInstance.getPassword();
const databaseName = pgInstance.getDatabase();

const sorci = new SorciPostgres({
  host,
  port,
  user,
  password,
  databaseName,
  streamName: "useless_stream_name"
});

const aUser = () => new UserBuilder({ sorci });
const aTodoList = () => new TodoListBuilder({ sorci, aUser });
const aTodoListItem = () => new TodoListItemBuilder({ sorci, aTodoList });

const FULL_LIST_MULTIPLICATOR = 50;
const FULL_LIST_ON_INSERT_COUNT = 1000;
const FULL_LIST_EVENT_COUNT = createTodoListFullLife().length;

const prepareBigStream = async () => {
  let stream: Array<any> = [];
  for (let i = 0; i < FULL_LIST_MULTIPLICATOR; i++) {
    for (let i = 0; i < FULL_LIST_ON_INSERT_COUNT; i++) {
      stream.push(...createTodoListFullLife());
    }

    await sorci.insertEvents(stream);
    stream = [];
  }
};

await sorci.setupTestStream();
console.log("stream setup", sorci.streamName);
console.log("Start loading data");

const todoList1Id = "345796fd-c56c-4a9b-8dd5-22763b7d4997";
const fullTodoList1 = createTodoListFullLife({ todoListId: todoList1Id });
let eventIdentifierList1 = fullTodoList1[fullTodoList1.length - 1].id;
await sorci.insertEvents(fullTodoList1);

const singleEventForGetById = aTodoListItem().events[0];
await sorci.insertEvents([singleEventForGetById]);

await prepareBigStream();

const todoListItemId2 = "f863ae13-0a8d-4e61-b3a4-1d8f40f340d1";
const fullTodoList2 = createTodoListFullLife({
  todoListItemId: todoListItemId2
});
const eventIdentifierList2 = fullTodoList2[0].id;
await sorci.insertEvents(fullTodoList2);

console.log("Data loaded");

let eventToPersist = aTodoListItem().events[0];
let selectedTodoListsForConcurrency: Array<{
  todoListId: string;
  lastEventId: string;
}> = [];

bench
  .add(
    "Simple insert",
    async () => {
      await sorci.insertEvents([eventToPersist]);
    },
    {
      beforeAll: async () => {
        console.log("Running - Simple insert");
      },
      beforeEach: () => {
        eventToPersist = aTodoListItem().events[0];
      }
    }
  )
  .add(
    "Append with no conflict, no query",
    async () => {
      await sorci.appendEvent({ sourcingEvent: eventToPersist });
    },
    {
      beforeAll: async () => {
        console.log("Running - Append with no conflict, no query");
      },
      beforeEach: () => {
        eventToPersist = aTodoListItem().events[0];
      }
    }
  )
  .add(
    "Append with query: types",
    async () => {
      await sorci.appendEvent({
        sourcingEvent: eventToPersist,
        query: {
          $where: {
            type: "todo-list-created"
          }
        },
        lastKnownEventId: eventIdentifierList2
      });
    },
    {
      beforeAll: async () => {
        console.log("Running - Append complex, with query : types ");
      },
      beforeEach: () => {
        eventToPersist = aTodoListItem().events[0];
      }
    }
  )
  .add(
    "Append with query: identifiers",
    async () => {
      await sorci.appendEvent({
        sourcingEvent: eventToPersist,
        query: {
          $where: {
            identifiers: { todoListId: todoList1Id }
          }
        },
        lastKnownEventId: eventIdentifierList1
      });
    },
    {
      beforeAll: async () => {
        console.log("Running - Append complex, with query : identifiers");
      },
      beforeEach: () => {
        eventToPersist = aTodoListItem().events[0];
      }
    }
  )
  .add(
    "Append complex, with query: types & identifiers",
    async () => {
      await sorci.appendEvent({
        sourcingEvent: eventToPersist,
        query: {
          $where: {
            type: { $in: ["todo-list-created", "todo-list-item-created"] },
            identifiers: { todoListId: todoList1Id }
          }
        },
        lastKnownEventId: eventIdentifierList1
      });
    },
    {
      beforeAll: async () => {
        console.log("Running - Append with query: types & identifiers");
      },
      beforeEach: async () => {
        eventToPersist = aTodoListItem()
          .withId(todoList1Id)
          .renamed("osef")
          .events.at(-1)!;

        const events = await sorci.getEventsByQuery({
          $where: {
            type: { $in: ["todo-list-created", "todo-list-item-created"] },
            identifiers: { todoListId: todoList1Id }
          }
        });

        eventIdentifierList1 = events.at(-1)!.id;
      }
    }
  )
  .add(
    "Get by Query, types",
    async () => {
      await sorci.getEventsByQuery({
        $where: {
          type: "todo-list-item-created"
        }
      });
    },
    {
      beforeAll: async () => {
        console.log("Running - Get by Query, types");
      }
    }
  )
  .add(
    "Get by Query, identifiers",
    async () => {
      await sorci.getEventsByQuery({
        $where: {
          identifiers: { todoListId: todoList1Id }
        }
      });
    },
    {
      beforeAll: async () => {
        console.log("Running - Get by Query, identifiers");
      }
    }
  )
  .add(
    "Get by Query, types & identifiers",
    async () => {
      await sorci.getEventsByQuery({
        $where: {
          type: { $in: ["todo-list-created", "todo-list-renamed"] },
          identifiers: { todoListId: todoList1Id }
        }
      });
    },
    {
      beforeAll: async () => {
        console.log("Running - Get by Query, types & identifiers");
      }
    }
  )
  .add(
    "Get by EventId",
    async () => {
      await sorci.getEventById(singleEventForGetById.id);
    },
    {
      beforeAll: async () => {
        console.log("Running - Get by EventId");
      }
    }
  )
  .add(
    "Concurrent append on separate aggregates (5 concurrent)",
    async () => {
      const events = [
        aTodoListItem().events[0],
        aTodoListItem().events[0],
        aTodoListItem().events[0],
        aTodoListItem().events[0],
        aTodoListItem().events[0]
      ];

      await Promise.all(
        events.map((event) =>
          sorci.appendEvent({
            sourcingEvent: event
          })
        )
      );
    },
    {
      beforeAll: async () => {
        console.log(
          "Running - Concurrent append on separate aggregates (5 concurrent)"
        );
      }
    }
  )
  .add(
    "Concurrent append with query on separate aggregates (10 concurrent)",
    async () => {
      const renameEvents = selectedTodoListsForConcurrency.map((todoList) => ({
        event: SorciEvent.create({
          type: "todo-list-renamed",
          data: {
            title: "Concurrent rename",
            todoListId: todoList.todoListId
          }
        }),
        todoListId: todoList.todoListId,
        lastEventId: todoList.lastEventId
      }));

      await Promise.all(
        renameEvents.map((item) =>
          sorci.appendEvent({
            sourcingEvent: item.event,
            query: {
              $where: {
                type: { $in: ["todo-list-created", "todo-list-deleted"] },
                identifiers: { todoListId: item.todoListId }
              }
            },
            lastKnownEventId: item.lastEventId
          })
        )
      );
    },
    {
      beforeAll: async () => {
        console.log(
          "Running - Concurrent append with query on separate aggregates (10 concurrent)"
        );

        const allTodoListEvents = await sorci.getEventsByQuery({
          $where: {
            type: "todo-list-created"
          }
        });

        const randomIndices = Array.from({ length: 50 }, () =>
          Math.floor(Math.random() * allTodoListEvents.length)
        );

        selectedTodoListsForConcurrency = await Promise.all(
          randomIndices.map(async (index) => {
            const todoListId = allTodoListEvents[index].data
              .todoListId as string;
            const events = await sorci.getEventsByQuery({
              $where: {
                identifiers: { todoListId },
                type: { $in: ["todo-list-created", "todo-list-deleted"] }
              }
            });
            return {
              todoListId,
              lastEventId: events[events.length - 1].id
            };
          })
        );
      }
    }
  );

await bench.run();

console.log("\n");
console.log(
  `Bench results on: ${
    FULL_LIST_EVENT_COUNT *
      FULL_LIST_ON_INSERT_COUNT *
      FULL_LIST_MULTIPLICATOR +
    FULL_LIST_EVENT_COUNT +
    1
  } events`
);
console.table(bench.table());

await pgInstance.stop();
