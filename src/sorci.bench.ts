import { Bench } from "tinybench";
import { PostgreSqlContainer } from "testcontainers";
import { SorciPostgres } from "./sorci.postgres";
import { createCourseCreated, createCourseFullLife } from "./test-helpers";

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

const FULL_LIST_MULTIPLICATOR = 50;
const FULL_LIST_ON_INSERT_COUNT = 1000;
const FULL_LIST_EVENT_COUNT = createCourseFullLife().length;

const prepareBigStream = async () => {
  let stream: Array<any> = [];
  for (let i = 0; i < FULL_LIST_MULTIPLICATOR; i++) {
    for (let i = 0; i < FULL_LIST_ON_INSERT_COUNT; i++) {
      stream.push(...createCourseFullLife());
    }

    await sorci.insertEvents(stream);
    stream = [];
  }
};

await sorci.setupTestStream();
console.log("stream setup", sorci.streamName);
console.log("Start loading data");

const course1Id = "345796fd-c56c-4a9b-8dd5-22763b7d4997";
const fullCourse1 = createCourseFullLife({ courseId: course1Id });
const eventIdentifierList1 = fullCourse1[fullCourse1.length - 1].id;
await sorci.insertEvents(fullCourse1);
const courseCreated = createCourseCreated();
await sorci.insertEvents([courseCreated]);

await prepareBigStream();

const fullCourse2 = createCourseFullLife({
  courseId: "f863ae13-0a8d-4e61-b3a4-1d8f40f340d1"
});
const eventIdentifierList2 = fullCourse2[0].id;
await sorci.insertEvents(fullCourse2);

console.log("Data loaded");

let eventToPersist = createCourseCreated();

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
        eventToPersist = createCourseCreated();
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
        eventToPersist = createCourseCreated();
      }
    }
  )
  .add(
    "Append with query: types",
    async () => {
      await sorci.appendEvent({
        sourcingEvent: eventToPersist,
        query: {
          types: ["course-created"]
        },
        eventIdentifier: eventIdentifierList2
      });
    },
    {
      beforeAll: async () => {
        console.log("Running - Append complex, with query : types ");
      },
      beforeEach: () => {
        eventToPersist = createCourseCreated();
      }
    }
  )
  .add(
    "Append with query: identifiers",
    async () => {
      await sorci.appendEvent({
        sourcingEvent: eventToPersist,
        query: {
          identifiers: [{ courseId: course1Id }]
        },
        eventIdentifier: eventIdentifierList1
      });
    },
    {
      beforeAll: async () => {
        console.log("Running - Append complex, with query : identifiers");
      },
      beforeEach: () => {
        eventToPersist = createCourseCreated();
      }
    }
  )
  .add(
    "Append complex, with query: types & identifiers",
    async () => {
      await sorci.appendEvent({
        sourcingEvent: eventToPersist,
        query: {
          types: ["course-created", "student-subscribed-to-course"],
          identifiers: [{ courseId: course1Id }]
        },
        eventIdentifier: eventIdentifierList1
      });
    },
    {
      beforeAll: async () => {
        console.log("Running - Append with query: types & identifiers");
      },
      beforeEach: () => {
        eventToPersist = createCourseCreated();
      }
    }
  )
  .add(
    "Get by Query, types",
    async () => {
      await sorci.getEventsByQuery({
        types: ["student-created"]
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
        identifiers: [{ courseId: course1Id }]
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
        types: ["course-created", "course-renamed"],
        identifiers: [{ courseId: course1Id }]
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
      await sorci.getEventById(courseCreated.id);
    },
    {
      beforeAll: async () => {
        console.log("Running - Get by EventId");
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
