import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from "testcontainers";
import { createId } from "./common/utils";
import { Sorci } from "./sorci.interface";
import { SorciPostgres } from "./sorci.postgres";
import {
  createCourseCreated,
  createCourseCapacityChanged,
  createCourseRenamed,
} from "./test-helpers";

let pgInstance: StartedPostgreSqlContainer;
let sorci: Sorci;

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

  sorci = new SorciPostgres(
    host,
    port,
    user,
    password,
    databaseName,
    "useless_stream_name"
  );
}, 30000);

beforeEach(async () => {
  await sorci.setupTestStream();
});

afterEach(async () => {
  await sorci.cleanCurrentStream();
});

afterAll(async () => {
  // await sorci.clearAllTestStream({ excludeCurrentStream: true });
  await pgInstance.stop();
});

describe("Given an empty stream", async () => {
  describe("When inserting Events", async () => {
    test("Then the event is persisted in the stream", async () => {
      const courseCreated = createCourseCreated();
      const courseCapacityChanged = createCourseCapacityChanged({
        courseId: courseCreated.data.courseId,
        oldCapacity: courseCreated.data.capacity,
      });

      const [courseCreatedId, courseCapacityChangedId] =
        await sorci.insertEvents([courseCreated, courseCapacityChanged]);

      expect(courseCreatedId).toEqual(courseCreated.id);
      expect(courseCapacityChangedId).toEqual(courseCapacityChanged.id);

      const event1 = await sorci.getEventById(courseCreated.id);
      const event2 = await sorci.getEventById(courseCapacityChanged.id);

      expect(event1?.id).toEqual(courseCreated.id);
      expect(event2?.id).toEqual(courseCapacityChanged.id);
    });
  });

  describe("When appending an Event with no impact", async () => {
    test("Then the event is persisted in the stream", async () => {
      const courseCreated = createCourseCreated();

      const eventId = await sorci.appendEvent({
        sourcingEvent: courseCreated,
      });

      const event = await sorci.getEventById(courseCreated.id);

      expect(eventId).toEqual(courseCreated.id);
      expect(event?.id).toEqual(courseCreated.id);
      expect(event?.type).toEqual(courseCreated.type);
      expect(event?.data).toEqual(courseCreated.data);
      expect(event?.identifier).toEqual(courseCreated.identifier);
      expect(event?.timestamp).toBeTruthy();
    });
  });
});

describe("Given a populated stream", async () => {
  const course1Created = createCourseCreated();
  const course1CapacityChanged = createCourseCapacityChanged({
    courseId: course1Created.data.courseId,
    oldCapacity: course1Created.data.capacity,
  });
  const course1Renamed = createCourseRenamed({
    courseId: course1Created.data.courseId,
    oldName: course1Created.data.name,
  });
  const course2Created = createCourseCreated();
  const course2CapacityChanged = createCourseCapacityChanged({
    courseId: course2Created.data.courseId,
    oldCapacity: course2Created.data.capacity,
  });

  const streamData = [
    course1Created,
    course1CapacityChanged,
    course2Created,
    course1Renamed,
    course2CapacityChanged,
  ];

  const course1Id = course1Created.data.courseId;

  beforeEach(async () => {
    await sorci.insertEvents(streamData);
  });

  describe("When appending an event with no impact", async () => {
    test("Then the event is persisted", async () => {
      const course3Created = createCourseCreated();

      const eventId = await sorci.appendEvent({
        sourcingEvent: course3Created,
      });
      expect(eventId).toEqual(course3Created.id);

      const event = await sorci.getEventById(eventId);
      expect(event?.id).toEqual(course3Created.id);
      expect(event?.type).toEqual(course3Created.type);
      expect(event?.data).toEqual(course3Created.data);
      expect(event?.identifier).toEqual(course3Created.identifier);
      expect(event?.timestamp).toBeInstanceOf(Date);
    });
  });

  describe("When appending with the right 'lastEventIdentifier'", async () => {
    test("Then the event is persisted in the stream", async () => {
      const course1CapacityChangedAgain = createCourseCapacityChanged({
        courseId: course1Id,
        oldCapacity: course1CapacityChanged.data.newCapacity,
      });

      const eventId = await sorci.appendEvent({
        sourcingEvent: course1CapacityChangedAgain,
        query: {
          types: ["course-created", "course-capacity-changed"],
          identifiers: [{ courseId: course1Id }],
        },
        eventIdentifier: course1CapacityChanged.id,
      });

      const event = await sorci.getEventById(course1CapacityChangedAgain.id);

      expect(eventId).toEqual(course1CapacityChangedAgain.id);
      expect(event?.id).toEqual(course1CapacityChangedAgain.id);
      expect(event?.type).toEqual(course1CapacityChangedAgain.type);
      expect(event?.data).toEqual(course1CapacityChangedAgain.data);
      expect(event?.identifier).toEqual(course1CapacityChangedAgain.identifier);
      expect(event?.timestamp).toBeInstanceOf(Date);
    });
  });

  describe("When appending with the wrong 'lastEventIdentifier'", async () => {
    test("Then the event is not persisted", async () => {
      const course1CapacityChangedAgain = createCourseCapacityChanged({
        courseId: course1Id,
        oldCapacity: course1CapacityChanged.data.newCapacity,
      });

      const promise = sorci.appendEvent({
        sourcingEvent: course1CapacityChangedAgain,
        query: {
          types: ["course-created", "course-capacity-changed"],
          identifiers: [{ courseId: course1Id }],
        },
        eventIdentifier: createId(), // Wrong identifier on purpose
      });

      await expect(promise).rejects.toThrow(/Event Identifier mismatch/);
      const event = await sorci.getEventById(course1CapacityChangedAgain.id);
      expect(event).toBeFalsy();
    });
  });

  describe("When appending with the wrong 'lastEventIdentifier' and no types", async () => {
    test("Then the event is not persisted in the stream", async () => {
      const course1CapacityChangedAgain = createCourseCapacityChanged({
        courseId: course1Id,
        oldCapacity: course1CapacityChanged.data.newCapacity,
      });

      const promise = sorci.appendEvent({
        sourcingEvent: course1CapacityChangedAgain,
        query: {
          identifiers: [{ courseId: course1Id }],
        },
        eventIdentifier: createId(), // Wrong identifier on purpose
      });

      await expect(promise).rejects.toThrow(/Event Identifier mismatch/);
      const event = await sorci.getEventById(course1CapacityChangedAgain.id);
      expect(event).toBeFalsy();
    });
  });

  describe("When appending with the right 'lastEventIdentifier' but no identifier", async () => {
    test("Then the event is persisted in the stream", async () => {
      const course1CapacityChangedAgain = createCourseCapacityChanged({
        courseId: course1Id,
        oldCapacity: course1CapacityChanged.data.newCapacity,
      });

      const eventId = await sorci.appendEvent({
        sourcingEvent: course1CapacityChangedAgain,
        query: {
          types: ["course-created", "course-capacity-changed"],
        },
        eventIdentifier: course2CapacityChanged.id,
      });

      const event = await sorci.getEventById(eventId);

      expect(eventId).toEqual(course1CapacityChangedAgain.id);
      expect(event?.id).toEqual(course1CapacityChangedAgain.id);
      expect(event?.type).toEqual(course1CapacityChangedAgain.type);
      expect(event?.data).toEqual(course1CapacityChangedAgain.data);
      expect(event?.identifier).toEqual(course1CapacityChangedAgain.identifier);
      expect(event?.timestamp).toBeInstanceOf(Date);
    });
  });

  describe("When appending with the right 'lastEventIdentifier' but no type", async () => {
    test("Then the event is persisted in the stream", async () => {
      const course1CapacityChangedAgain = createCourseCapacityChanged({
        courseId: course1Id,
        oldCapacity: course1CapacityChanged.data.newCapacity,
      });

      const eventId = await sorci.appendEvent({
        sourcingEvent: course1CapacityChangedAgain,
        query: {
          identifiers: [{ courseId: course1Id }],
        },
        eventIdentifier: course1Renamed.id,
      });

      const event = await sorci.getEventById(eventId);

      expect(eventId).toEqual(course1CapacityChangedAgain.id);
      expect(event?.id).toEqual(course1CapacityChangedAgain.id);
      expect(event?.type).toEqual(course1CapacityChangedAgain.type);
      expect(event?.data).toEqual(course1CapacityChangedAgain.data);
      expect(event?.identifier).toEqual(course1CapacityChangedAgain.identifier);
      expect(event?.timestamp).toBeInstanceOf(Date);
    });
  });

  describe("When querying an event", async () => {
    test("Then the events is returned", async () => {
      const event = await sorci.getEventById(course2Created.id);

      expect(event).toBeTruthy();
      expect(event?.id).toEqual(course2Created.id);
    });
  });

  describe("When querying events", async () => {
    test("Then the events are returned", async () => {
      const events = await sorci.getEventsByQuery({
        types: ["course-created", "course-capacity-changed", "course-renamed"],
        identifiers: [{ courseId: course1Id }],
      });

      expect(events).toHaveLength(3);
    });
  });
});

describe("Concurrency", async () => {
  const course1Created = createCourseCreated();
  const course1CapacityChanged = createCourseCapacityChanged({
    courseId: course1Created.data.courseId,
    oldCapacity: course1Created.data.capacity,
  });
  const course1Renamed = createCourseRenamed({
    courseId: course1Created.data.courseId,
    oldName: course1Created.data.name,
  });
  const course2Created = createCourseCreated();
  const course2CapacityChanged = createCourseCapacityChanged({
    courseId: course2Created.data.courseId,
    oldCapacity: course2Created.data.capacity,
  });

  const streamData = [
    course1Created,
    course1CapacityChanged,
    course2Created,
    course1Renamed,
    course2CapacityChanged,
  ];

  const course1Id = course1Created.data.courseId;

  beforeEach(async () => {
    await sorci.insertEvents(streamData);
  });

  test("Persist first an event with query then persist an event without query", async () => {
    const course1CapacityChangedAgain = createCourseCapacityChanged({
      courseId: course1Id,
      oldCapacity: course1CapacityChanged.data.newCapacity,
    });

    const course3Created = createCourseCreated();

    await sorci.appendEvent({
      sourcingEvent: course1CapacityChangedAgain,
      query: {
        types: ["course-created", "course-capacity-changed"],
        identifiers: [{ courseId: course1Id }],
      },
      eventIdentifier: course1CapacityChanged.id,
    });

    await sorci.appendEvent({
      sourcingEvent: course3Created,
    });

    const event1 = await sorci.getEventById(course1CapacityChangedAgain.id);
    const event2 = await sorci.getEventById(course3Created.id);

    expect(event1?.id).toEqual(course1CapacityChangedAgain.id);
    expect(event1?.data).toEqual(course1CapacityChangedAgain.data);
    expect(event2?.id).toEqual(course3Created.id);
    expect(event2?.data).toEqual(course3Created.data);
  });

  test("Try to persist 50 event with a query", async () => {
    const eventCount = 50;
    const events = Array.from({ length: eventCount }, (_, index) =>
      createCourseCreated({ capacity: index + 1 })
    );

    // WHEN persisting them simultaneously with a query
    const promises = events.map((event) => {
      return sorci
        .appendEvent({
          sourcingEvent: event,
          query: {
            types: ["course-created", "course-renamed"],
            identifiers: [{ courseId: course1Id }],
          },
          eventIdentifier: course1Renamed.id,
        })
        .then(() => {
          return "success";
        })
        .catch(() => {
          return "error";
        });
    });
    const res = await Promise.all(promises);

    // THEN all events are persisted
    const persistedEvents = await Promise.all(
      events.map((event) => sorci.getEventById(event.id))
    );
    const toPersistedEventIds = events.map((event) => event?.id).sort();
    const persistedEventIds = persistedEvents.map((event) => event?.id).sort();

    expect(res.every((value) => value === "success")).toBe(true);
    expect(persistedEvents.length).toBe(eventCount);
    expect(persistedEventIds).toEqual(toPersistedEventIds);
  });

  test("Try to persist 50 event with no query", async () => {
    //GIVEN an empty stream
    await sorci.truncate();
    // GIVEN 50 events
    const eventCount = 50;
    const events = Array.from({ length: eventCount }, (_, index) =>
      createCourseCreated({ capacity: index + 1 })
    );

    // WHEN persisting them simultaneously
    const promises = events.map((event) => {
      return sorci
        .appendEvent({ sourcingEvent: event })
        .then(() => {
          return "success";
        })
        .catch(() => {
          return "error";
        });
    });
    const res = await Promise.all(promises);

    //THEN all events should be persisted
    const persistedEvents = await Promise.all(
      events.map((event) => sorci.getEventById(event.id))
    );
    const toPersistedEventIds = events.map((event) => event?.id).sort();
    const persistedEventIds = persistedEvents.map((event) => event?.id).sort();

    expect(res.every((value) => value === "success")).toBe(true);
    expect(persistedEvents.length).toBe(50);
    expect(persistedEventIds).toEqual(toPersistedEventIds);
  });

  test("Try to persist two unrelated event a the same time, both should be persisted", async () => {
    const course1CapacityChangedAgain = createCourseCapacityChanged({
      courseId: course1Id,
      oldCapacity: course1CapacityChanged.data.newCapacity,
    });

    const course1RenamedAgain = createCourseRenamed({
      courseId: course1Id,
      oldName: course1Renamed.data.newName,
    });

    const appendPromise1 = sorci.appendEvent({
      sourcingEvent: course1CapacityChangedAgain,
      query: {
        types: ["course-created", "course-capacity-changed"],
        identifiers: [{ courseId: course1Id }],
      },
      eventIdentifier: course1CapacityChanged.id,
    });

    const appendPromise2 = sorci.appendEvent({
      sourcingEvent: course1RenamedAgain,
      query: {
        types: ["course-created", "course-renamed"],
        identifiers: [{ courseId: course1Id }],
      },
      eventIdentifier: course1Renamed.id,
    });

    await Promise.all([appendPromise1, appendPromise2]);

    const event1 = await sorci.getEventById(course1CapacityChangedAgain.id);
    const event2 = await sorci.getEventById(course1RenamedAgain.id);

    expect(event1?.data).toEqual(course1CapacityChangedAgain.data);
    expect(event2?.data).toEqual(course1RenamedAgain.data);
  });

  test("Try to rename a course twice at the same time, one should fail", async () => {
    const course1RenamedAgain = createCourseRenamed({
      courseId: course1Id,
      oldName: course1Renamed.data.newName,
    });

    const course1RenamedAgain2 = createCourseRenamed({
      courseId: course1Id,
      oldName: course1Renamed.data.newName,
    });

    const appendPromise1 = sorci
      .appendEvent({
        sourcingEvent: course1RenamedAgain,
        query: {
          types: ["course-created", "course-renamed"],
          identifiers: [{ courseId: course1Id }],
        },
        eventIdentifier: course1Renamed.id,
      })
      .then(() => "success")
      .catch(() => "error");

    const appendPromise2 = sorci
      .appendEvent({
        sourcingEvent: course1RenamedAgain,
        query: {
          types: ["course-created", "course-renamed"],
          identifiers: [{ courseId: course1Id }],
        },
        eventIdentifier: course1Renamed.id,
      })
      .then(() => "success")
      .catch(() => "error");

    await Promise.all([appendPromise1, appendPromise2]);

    const res = (
      await Promise.all([
        sorci.getEventById(course1RenamedAgain.id),
        sorci.getEventById(course1RenamedAgain2.id),
      ])
    ).map((event) => (event ? "success" : "error"));

    expect(res).toContain("success");
    expect(res).toContain("error");
  });
});
