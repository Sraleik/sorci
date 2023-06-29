import { faker } from "@faker-js/faker";
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from "testcontainers";
import { createId } from "./common/utils";
import { Sorci, ToPersistEvent } from "./sorci.interface";
import { SorciPostgres } from "./sorci.postgres";

let pgInstance: StartedPostgreSqlContainer;
let sorci: Sorci;

beforeAll(async () => {
  const pgInstanceNotReady = new PostgreSqlContainer("postgres:15.3-alpine");
  pgInstance = await pgInstanceNotReady.start();
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
});

beforeEach(async () => {
  await sorci.setupTestStream();
});

afterEach(async () => {
  await sorci.cleanCurrentStream();
});

afterAll(async () => {
  //   await streamClient.clearAllTestStream({ excludeCurrentStream: true });
  await pgInstance.stop();
});

describe("Concurrency", async () => {
  const jobId = "123456789abc";
  const job2Id = "9c4106e631be";

  beforeEach(async () => {
    const streamData = [
      {
        id: "cba987654321",
        type: "job-created",
        data: { jobId, title: "ChatGTP prompt ingeneer" },
        identifier: { jobId },
      },
      {
        id: "3d8ad1bd9b46",
        type: "sourcing-request-opened",
        data: {
          jobId,
          sourcingRequestId: "9571fb884a36",
          batchSize: 10,
          batchNumber: 1,
        },
        identifier: { jobId },
      },
      {
        id: "51c4e23a5b0e",
        type: "job-created",
        data: { jobId: job2Id, title: "Software Engineer (Typescript)" },
        identifier: { jobId: job2Id },
      },
      {
        id: "036ab50c1ef2",
        type: "submission-ai-reviewed",
        data: {
          jobId,
          submissionId: "43810907fa7f",
          sourcingRequestId: "9571fb884a36",
          isApproved: true,
        },
        identifier: {
          jobId,
          sourcingRequestId: "9571fb884a36",
          submissionId: "43810907fa7f",
        },
      },
      {
        id: "e1a1b2c10e28",
        type: "submission-ai-reviewed",
        data: {
          jobId,
          sourcingRequestId: "9571fb884a36",
          submissionId: "2994e243b73b",
          isApproved: false,
        },
        identifier: {
          jobId,
          sourcingRequestId: "9571fb884a36",
          submissionId: "2994e243b73b",
        },
      },
    ];
    await sorci.insertEvents(streamData);
  });

  test("Persist first a an event with query then persist", async () => {
    const jobId = createId();
    const jobClosed = {
      id: jobId,
      type: "job-closed",
      data: { jobId, reason: "coco lastico" },
      identifier: { jobId },
    };

    const jobId2 = createId();
    const jobClosed2 = {
      id: jobId2,
      type: "job-closed",
      data: { jobId: jobId2, reason: "clown" },
      identifier: { jobId: jobId2 },
    };

    await sorci.appendEvent({
      sourcingEvent: jobClosed,
      query: {
        types: ["job-created", "sourcing-request-opened", "job-closed"],
        identifiers: [{ jobId: "123456789abc" }],
      },
      eventIdentifier: "3d8ad1bd9b46",
    });

    await sorci.appendEvent({
      sourcingEvent: jobClosed2,
    });

    const event1 = await sorci.getEventById(jobId);
    const event2 = await sorci.getEventById(jobId2);

    expect(event1?.id).toEqual(jobClosed.id);
    expect(event2?.id).toEqual(jobClosed2.id);
  });

  test("Try to persist 50 event with a query", async () => {
    // GIVEN 50 events
    const createEvent = (index: number) => ({
      id: createId(),
      type: "job-created",
      data: { title: faker.person.jobTitle() },
      identifier: { index },
    });
    const eventCount = 50;
    const events = Array.from({ length: eventCount }, (_, index) =>
      createEvent(index)
    );

    // WHEN persisting them simultaneously with a query
    const promises = events.map((event) => {
      return sorci
        .appendEvent({
          sourcingEvent: event,
          query: {
            types: ["job-created", "submission-ai-reviewed"],
            identifiers: [{ jobId }],
          },
          eventIdentifier: "e1a1b2c10e28",
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
    const createEvent = (index: number) => ({
      id: createId(),
      type: "job-created",
      data: { title: faker.person.jobTitle() },
      identifier: { index },
    });
    // GIVEN 50 events
    const events = Array.from({ length: 50 }, (_, index) => createEvent(index));

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
    const jobId = createId();
    const jobClosed = {
      id: jobId,
      type: "job-closed",
      data: { jobId, reason: "coco lastico" },
      identifier: { jobId },
    };

    const jobId2 = createId();
    const jobClosed2 = {
      id: jobId2,
      type: "job-closed",
      data: { jobId: jobId2, reason: "clown" },
      identifier: { jobId: jobId2 },
    };

    const appendPromise1 = sorci.appendEvent({
      sourcingEvent: jobClosed,
      query: {
        types: ["job-created", "sourcing-request-opened", "job-closed"],
        identifiers: [{ jobId: "123456789abc" }],
      },
      eventIdentifier: "3d8ad1bd9b46",
    });

    const appendPromise2 = sorci.appendEvent({
      sourcingEvent: jobClosed2,
      query: {
        types: ["submission-ai-reviewed"],
        identifiers: [{ jobId: "123456789abc" }],
      },
      eventIdentifier: "e1a1b2c10e28",
    });

    await Promise.all([appendPromise1, appendPromise2]);

    const event1 = await sorci.getEventById(jobId);
    const event2 = await sorci.getEventById(jobId2);

    expect(event1?.id).toEqual(jobClosed.id);
    expect(event2?.id).toEqual(jobClosed2.id);
  });

  test("Try to close a job twice at the same time, one should fail", async () => {
    const jobClosed = {
      id: createId(),
      type: "job-closed",
      data: { jobId, reason: "Enough hire" },
      identifier: { jobId: "123456789abc" },
    };

    const jobClosed2 = {
      id: createId(),
      type: "job-closed",
      data: { jobId, reason: "Enough hire" },
      identifier: { jobId: "123456789abc" },
    };

    const appendPromise1 = sorci
      .appendEvent({
        sourcingEvent: jobClosed,
        query: {
          types: ["job-created", "sourcing-request-opened", "job-closed"],
          identifiers: [{ jobId: "123456789abc" }],
        },
        eventIdentifier: "3d8ad1bd9b46",
      })
      .then(() => "success")
      .catch(() => "error");

    const appendPromise2 = sorci
      .appendEvent({
        sourcingEvent: jobClosed2,
        query: {
          types: ["job-created", "sourcing-request-opened", "job-closed"],
          identifiers: [{ jobId: "123456789abc" }],
        },
        eventIdentifier: "3d8ad1bd9b46",
      })
      .then(() => "success")
      .catch(() => "error");

    await Promise.all([appendPromise1, appendPromise2]);

    const res = (
      await Promise.all([
        sorci.getEventById(jobClosed.id),
        sorci.getEventById(jobClosed2.id),
      ])
    ).map((event) => (event ? "success" : "error"));

    expect(res).toContain("success");
    expect(res).toContain("error");
  });
});

describe("Given an empty stream", async () => {
  describe("When inserting Events", async () => {
    test("Then the event is persisted in the stream", async () => {
      const jobCreated = {
        id: createId(),
        type: "job-created",
        data: { jobId: "123456789abc", title: "ChatGTP prompt master" },
        identifier: { jobId: "123456789abc" },
      };

      const jobCreated2 = {
        id: createId(),
        type: "job-created",
        data: { jobId: "cba123456789", title: "ChatGTP prompt creator" },
        identifier: { jobId: "cba123456789" },
      };

      await sorci.insertEvents([jobCreated, jobCreated2]);

      const event1 = await sorci.getEventById(jobCreated.id);
      const event2 = await sorci.getEventById(jobCreated2.id);

      expect(event1).toBeTruthy();
      expect(event2).toBeTruthy();
      expect(event1?.id).toEqual(jobCreated.id);
      expect(event2?.id).toEqual(jobCreated2.id);
    });
  });

  describe("When appending an Event with no impact", async () => {
    test("Then the event is persisted in the stream", async () => {
      const jobCreated = {
        id: createId(),
        type: "job-created",
        data: { jobId: "123456789abc", title: "ChatGTP prompt ingeneer" },
        identifier: { jobId: "123456789abc" },
      };

      const eventId = await sorci.appendEvent({
        sourcingEvent: jobCreated,
      });

      const event = await sorci.getEventById(jobCreated.id);

      expect(eventId).toEqual(jobCreated.id);
      expect(event?.id).toEqual(jobCreated.id);
      expect(event?.type).toEqual(jobCreated.type);
      expect(event?.data).toEqual(jobCreated.data);
      expect(event?.identifier).toEqual(jobCreated.identifier);
      expect(event?.timestamp).toBeTruthy();
    });
  });
});

describe("Given a populated stream", async () => {
  const jobId = "123456789abc";
  const job2Id = "9c4106e631be";
  const event1Id = "cba987654321";

  beforeEach(async () => {
    const streamData = [
      {
        id: event1Id,
        type: "job-created",
        data: { jobId, title: "ChatGTP prompt ingeneer" },
        identifier: { jobId },
      },
      {
        id: "3d8ad1bd9b46",
        type: "sourcing-request-opened",
        data: {
          jobId,
          sourcingRequestId: "9571fb884a36",
          batchSize: 10,
          batchNumber: 1,
        },
        identifier: { jobId },
      },
      {
        id: "51c4e23a5b0e",
        type: "job-created",
        data: { jobId: job2Id, title: "Software Engineer (Typescript)" },
        identifier: { jobId: job2Id },
      },
      {
        id: "036ab50c1ef2",
        type: "submission-ai-reviewed",
        data: {
          jobId,
          submissionId: "43810907fa7f",
          sourcingRequestId: "9571fb884a36",
          isApproved: true,
        },
        identifier: {
          jobId,
          sourcingRequestId: "9571fb884a36",
          submissionId: "43810907fa7f",
        },
      },
      {
        id: "e1a1b2c10e28",
        type: "submission-ai-reviewed",
        data: {
          jobId,
          sourcingRequestId: "9571fb884a36",
          submissionId: "2994e243b73b",
          isApproved: false,
        },
        identifier: {
          jobId,
          sourcingRequestId: "9571fb884a36",
          submissionId: "2994e243b73b",
        },
      },
      {
        id: "7e7935dbdd74",
        type: "invitation-sent",
        data: {
          jobId,
          to: "johnwick@doglover.com",
        },
        identifier: {
          jobId,
        },
      },
    ];
    await sorci.insertEvents(streamData);
  });
  describe("When appending an event with no impact", async () => {
    test("Then the event is persisted", async () => {
      const job2Id = "354f2cbe8c36";
      const jobCreated = {
        id: createId("543028bab5f0"),
        type: "job-created",
        data: { jobId: job2Id, title: "ChatGTP prompt ingeneer" },
        identifier: { jobId: job2Id },
      };

      const eventId = await sorci.appendEvent({
        sourcingEvent: jobCreated,
      });

      const event = await sorci.getEventById(eventId);

      expect(eventId).toEqual(jobCreated.id);
      expect(event?.id).toEqual(jobCreated.id);
      expect(event?.type).toEqual(jobCreated.type);
      expect(event?.data).toEqual(jobCreated.data);
      expect(event?.identifier).toEqual(jobCreated.identifier);
      expect(event?.timestamp).toBeTruthy();
    });
  });

  describe("When appending with the right 'lastEventIdentifier'", async () => {
    let jobClosed: ToPersistEvent;
    let eventId: string;

    beforeEach(async () => {
      jobClosed = {
        id: createId("123456789abc"),
        type: "super-testouille-qmlsdjf",
        data: { jobId: "123456789abc", reason: "Enough hire" },
        identifier: { jobId: "123456789abc" },
      };

      eventId = await sorci.appendEvent({
        sourcingEvent: jobClosed,
        query: {
          types: ["job-created", "sourcing-request-opened"],
          identifiers: [{ jobId: "123456789abc" }],
        },
        eventIdentifier: "3d8ad1bd9b46",
      });
    });
    test("Then the event is persisted in the stream", async () => {
      const event = await sorci.getEventById(eventId);

      expect(eventId).toEqual(jobClosed.id);
      expect(event?.id).toEqual(jobClosed.id);
      expect(event?.type).toEqual(jobClosed.type);
      expect(event?.data).toEqual(jobClosed.data);
      expect(event?.identifier).toEqual(jobClosed.identifier);
      expect(event?.timestamp).toBeTruthy();
    });
  });

  describe("When appending with the wrong 'lastEventIdentifier'", async () => {
    test("Then the event is not persisted", async () => {
      const jobClosed = {
        id: createId("123456789abc"),
        type: "job-closed",
        data: { jobId, reason: "Enough hire" },
        identifier: { jobId },
      };

      const promise = sorci.appendEvent({
        sourcingEvent: jobClosed,
        query: {
          types: ["job-created", "sourcing-request-opened"],
          identifiers: [{ jobId }],
        },
        eventIdentifier: event1Id 
      });

      await expect(promise).rejects.toThrow(/Event Identifier mismatch/);
      const event = await sorci.getEventById(jobClosed.id);
      expect(event).toBeFalsy();
    });
  });

  describe("When appending with the wrong 'lastEventIdentifier' and no types", async () => {
    test("Then the event is not persisted in the stream", async () => {
      const jobClosed = {
        id: createId("123456789abc"),
        type: "job-closed",
        data: { jobId: "123456789abc", reason: "should not exist" },
        identifier: { jobId: "123456789abc" },
      };

      const promise = sorci.appendEvent({
        sourcingEvent: jobClosed,
        query: {
          identifiers: [{ jobId: "9c4106e631be" }],
        },
        eventIdentifier: "3d8ad1bd9b46",
      });

      await expect(promise).rejects.toThrow(/Event Identifier mismatch/);
      const event = await sorci.getEventById(jobClosed.id);
      expect(event).toBeFalsy();
    });
  });

  describe("When appending with the right 'lastEventIdentifier' but no identifier", async () => {
    test("Then the event is persisted in the stream", async () => {
      const jobClosed = {
        id: createId("123456789abc"),
        type: "job-closed",
        data: { jobId: "123456789abc", reason: "Only types" },
        identifier: { jobId: "123456789abc" },
      };

      const eventId = await sorci.appendEvent({
        sourcingEvent: jobClosed,
        query: {
          types: ["job-created", "sourcing-request-opened"],
        },
        eventIdentifier: "51c4e23a5b0e",
      });

      const event = await sorci.getEventById(eventId);

      expect(eventId).toEqual(jobClosed.id);
      expect(event?.id).toEqual(jobClosed.id);
      expect(event?.type).toEqual(jobClosed.type);
      expect(event?.data).toEqual(jobClosed.data);
      expect(event?.identifier).toEqual(jobClosed.identifier);
      expect(event?.timestamp).toBeTruthy();
    });
  });

  describe("When appending with the right 'lastEventIdentifier' but no type", async () => {
    test("Then the event is persisted in the stream", async () => {
      const jobClosed = {
        id: createId("123456789abc"),
        type: "job-closed",
        data: { jobId: "123456789abc", reason: "Enough hire" },
        identifier: { jobId: "123456789abc" },
      };

      const eventId = await sorci.appendEvent({
        sourcingEvent: jobClosed,
        query: {
          identifiers: [{ jobId: "123456789abc" }],
        },
        eventIdentifier: "7e7935dbdd74",
      });

      const event = await sorci.getEventById(eventId);

      expect(eventId).toEqual(jobClosed.id);
      expect(event?.id).toEqual(jobClosed.id);
      expect(event?.type).toEqual(jobClosed.type);
      expect(event?.data).toEqual(jobClosed.data);
      expect(event?.identifier).toEqual(jobClosed.identifier);
      expect(event?.timestamp).toBeTruthy();
    });
  });

  describe("When querying an event", async () => {
    test("Then the events is returned", async () => {
      const event = await sorci.getEventById(event1Id);

      expect(event).toBeTruthy();
      expect(event?.id).toEqual(event1Id);
    });
  });

  describe("When querying events", async () => {
    test("Then the events are returned", async () => {
      const events = await sorci.getEventsByQuery({
        types: [
          "job-created",
          "sourcing-request-opened",
          "submission-ai-reviewed",
        ],
        identifiers: [{ jobId }],
      });

      expect(events).toHaveLength(4);
    });
  });
});
