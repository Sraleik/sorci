import { Bench } from "tinybench";
import { PostgreSqlContainer } from "testcontainers";
import { faker } from "@faker-js/faker";
import { createId } from "./common/utils";
import { SorciPostgres } from "./sorci.postgres";

const bench = new Bench({ time: 5000 });

const pgInstance = await new PostgreSqlContainer("postgres:15.3-alpine")
  .withExposedPorts({
    container: 5432,
    host: 42420,
  })
  .start();

const host = pgInstance.getHost();
const port = pgInstance.getPort();
const user = pgInstance.getUsername();
const password = pgInstance.getPassword();
const databaseName = pgInstance.getDatabase();

const sorci = new SorciPostgres(
  host,
  port,
  user,
  password,
  databaseName,
  "useless_stream_name"
);

const makeEvent = () => {
  const listId = createId();
  const taskId = createId();

  return {
    id: createId(),
    type: "TASK_ADDED_TO_LIST",
    data: { listId, taskId, title: faker.lorem.sentence() },
    identifier: { listId, taskId },
  };
};

const createList = (listId: string = createId()) => {
  return {
    id: createId(),
    type: "LIST_CREATED",
    data: { listId, title: faker.lorem.sentence() },
    identifier: { listId },
  };
};

const createTask = (listId: string) => {
  const taskId = createId();

  return {
    id: createId(),
    type: "TASK_ADDED_TO_LIST",
    data: { listId, taskId, title: faker.lorem.sentence() },
    identifier: { listId, taskId },
  };
};

const createFullList = (listId: string = createId()) => {
  const listCreated = createList(listId);

  const tenTasks = Array.from({ length: 10 }).map(() => createTask(listId));

  return [listCreated, ...tenTasks];
};

const prepareBigStream = async () => {
  let stream: Array<any> = [];
  for (let i = 0; i < 50; i++) {
    for (let i = 0; i < 1_000; i++) {
      stream.push(...createFullList());
    }

    await sorci.insertEvents(stream);
    stream = [];
  }
};

await sorci.setupTestStream();
console.log("stream setup", sorci.streamName);
console.log("Start loading data");
await sorci.insertEvents(createFullList("b40c6a575e8b"));
await sorci.insertEvents([{...makeEvent(), id: "5314ce4504ad"}]);
await prepareBigStream();
console.log("Data loaded");

let eventToPersist = makeEvent();

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
        eventToPersist = makeEvent();
      },
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
        eventToPersist = makeEvent();
      },
    }
  )
  .add(
    "Append complex, with query",
    async () => {
      await sorci.appendEvent({
        sourcingEvent: eventToPersist,
        query: {
          types: ["LIST_CREATED", "TASK_ADDED_TO_LIST"],
          identifiers: [{ listId: "b40c6a575e8b" }],
        },
        version: 11,
      });
    },
    {
      beforeAll: async () => {
        console.log("Running - Append complex, with query");
      },
      beforeEach: () => {
        eventToPersist = makeEvent();
      },
    }
  )
  .add(
    "Get by Query",
    async () => {
      await sorci.getEventsByQuery({
        types: ["LIST_CREATED", "TASK_ADDED_TO_LIST"],
        identifiers: [{ listId: "b40c6a575e8b" }],
      });
    },
    {
      beforeAll: async () => {
        console.log("Running - Get by Query");
      },
    }
  )
  .add(
    "Get by EventId",
    async () => {
      await sorci.getEventById('5314ce4504ad');
    },
    {
      beforeAll: async () => {
        console.log("Running - Get by EventId");
      },
    }
  );

await bench.run();

console.table(bench.table());

await pgInstance.stop();
