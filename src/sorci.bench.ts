import { Bench } from "tinybench";
import { PostgreSqlContainer } from "testcontainers";
import { faker } from "@faker-js/faker";
import { createId } from "./common/utils";
import { SorciPostgres } from "./sorci.postgres";

const bench = new Bench({ time: 5000 });

const pgInstance = await new PostgreSqlContainer("postgres:15.3-alpine")
  // .withExposedPorts({
  //   container: 5432,
  //   host: 42420,
  // })
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

const FULL_LIST_MULTIPLICATOR = 1
const FULL_LIST_ON_INSERT_COUNT = 1;
const FULL_LIST_EVENT_COUNT = createFullList().length 

const prepareBigStream = async () => {
  let stream: Array<any> = [];
  for (let i = 0; i < FULL_LIST_MULTIPLICATOR; i++) {
    for (let i = 0; i < FULL_LIST_ON_INSERT_COUNT; i++) {
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
    "Append with query: types",
    async () => {
      await sorci.appendEvent({
        sourcingEvent: eventToPersist,
        query: {
          types: ["LIST_CREATED"],
        },
        version: 550002,
      });
    },
    {
      beforeAll: async () => {
        console.log("Running - Append complex, with query : types ");
      },
      beforeEach: () => {
        eventToPersist = makeEvent();
      },
    }
  )
  .add(
    "Append with query: identifiers",
    async () => {
      await sorci.appendEvent({
        sourcingEvent: eventToPersist,
        query: {
          identifiers: [{ listId: "b40c6a575e8b" }],
        },
        version: 11,
      });
    },
    {
      beforeAll: async () => {
        console.log("Running - Append complex, with query : identifiers");
      },
      beforeEach: () => {
        eventToPersist = makeEvent();
      },
    }
  )
  .add(
    "Append complex, with query: types & identifiers",
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
        console.log("Running - Append with query: types & identifiers");
      },
      beforeEach: () => {
        eventToPersist = makeEvent();
      },
    }
  )
  .add(
    "Get by Query, types",
    async () => {
      await sorci.getEventsByQuery({
        types: ["LIST_CREATED"],
      });
    },
    {
      beforeAll: async () => {
        console.log("Running - Get by Query, types");
      },
    }
  )
  .add(
    "Get by Query, identifiers",
    async () => {
      await sorci.getEventsByQuery({
        identifiers: [{ listId: "b40c6a575e8b" }],
      });
    },
    {
      beforeAll: async () => {
        console.log("Running - Get by Query, identifiers");
      },
    }
  )
  .add(
    "Get by Query, types & idenditifiers",
    async () => {
      await sorci.getEventsByQuery({
        types: ["LIST_CREATED", "TASK_ADDED_TO_LIST"],
        identifiers: [{ listId: "b40c6a575e8b" }],
      });
    },
    {
      beforeAll: async () => {
        console.log("Running - Get by Query, types & idenditifiers");
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

console.log("\n")
console.log(`Bench results on: ${FULL_LIST_EVENT_COUNT * FULL_LIST_ON_INSERT_COUNT * FULL_LIST_MULTIPLICATOR + FULL_LIST_EVENT_COUNT + 1} events`)
console.table(bench.table());

await pgInstance.stop();
