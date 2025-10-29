import { PersistedEvent, ToPersistEvent } from "./sorci.interface";

describe("Given persisted events with specific IDs and timestamps", async () => {
  const baseDate = new Date("2024-01-15T10:00:00Z");
  const date1 = new Date(baseDate.getTime() - 2 * 24 * 60 * 60 * 1000);
  const date2 = new Date(baseDate.getTime() - 1 * 24 * 60 * 60 * 1000);
  const date3 = baseDate;
  const date4 = new Date(baseDate.getTime() + 1 * 24 * 60 * 60 * 1000);
  const date5 = new Date(baseDate.getTime() + 2 * 24 * 60 * 60 * 1000);

  const id1 = "01ARZ3NDEKTSV4RRFFQ69G5FAA";
  const id2 = "01ARZ3NDEKTSV4RRFFQ69G5FAB";
  const id3 = "01ARZ3NDEKTSV4RRFFQ69G5FAC";
  const id4 = "01ARZ3NDEKTSV4RRFFQ69G5FAD";
  const id5 = "01ARZ3NDEKTSV4RRFFQ69G5FAE";

  beforeAll(async () => {
    const events: ToPersistEvent[] = [
      {
        id: id1,
        type: "test-event",
        data: { value: 1 },
        identifier: { testId: "test-1" },
        timestamp: date1
      },
      {
        id: id2,
        type: "test-event",
        data: { value: 2 },
        identifier: { testId: "test-2" },
        timestamp: date2
      },
      {
        id: id3,
        type: "test-event",
        data: { value: 3 },
        identifier: { testId: "test-3" },
        timestamp: date3
      },
      {
        id: id4,
        type: "test-event",
        data: { value: 4 },
        identifier: { testId: "test-4" },
        timestamp: date4
      },
      {
        id: id5,
        type: "test-event",
        data: { value: 5 },
        identifier: { testId: "test-5" },
        timestamp: date5
      }
    ];

    await sorciTestClient.insertEvents(events);
  });

  describe("When querying events by timestamp with $gt operator", async () => {
    let eventsPersisted: PersistedEvent[];

    beforeAll(async () => {
      eventsPersisted = await sorciTestClient.getEventsByQuery({
        $where: {
          type: "test-event",
          timestamp: { $gt: date3 }
        }
      });
    });

    test("Then events after the specified date are returned", async () => {
      expect(eventsPersisted.length).toBeGreaterThanOrEqual(2);
    });

    test("Then all returned events have timestamps greater than the specified date", async () => {
      eventsPersisted.forEach((event) => {
        expect(event.timestamp.getTime()).toBeGreaterThan(date3.getTime());
      });
    });

    test("Then event4 and event5 are included", async () => {
      const eventIds = eventsPersisted.map((e) => e.id);
      expect(eventIds).toContain(id4);
      expect(eventIds).toContain(id5);
    });

    test("Then event3 is not included", async () => {
      const eventIds = eventsPersisted.map((e) => e.id);
      expect(eventIds).not.toContain(id3);
    });
  });

  describe("When querying events by timestamp with $gte operator", async () => {
    let eventsPersisted: PersistedEvent[];

    beforeAll(async () => {
      eventsPersisted = await sorciTestClient.getEventsByQuery({
        $where: {
          type: "test-event",
          timestamp: { $gte: date3 }
        }
      });
    });

    test("Then events greater than or equal to the specified date are returned", async () => {
      expect(eventsPersisted.length).toBeGreaterThanOrEqual(3);
    });

    test("Then all returned events have timestamps greater than or equal to the specified date", async () => {
      eventsPersisted.forEach((event) => {
        expect(event.timestamp.getTime()).toBeGreaterThanOrEqual(
          date3.getTime()
        );
      });
    });

    test("Then event3, event4, and event5 are included", async () => {
      const eventIds = eventsPersisted.map((e) => e.id);
      expect(eventIds).toContain(id3);
      expect(eventIds).toContain(id4);
      expect(eventIds).toContain(id5);
    });
  });

  describe("When querying events by timestamp with $lt operator", async () => {
    let eventsPersisted: PersistedEvent[];

    beforeAll(async () => {
      eventsPersisted = await sorciTestClient.getEventsByQuery({
        $where: {
          type: "test-event",
          timestamp: { $lt: date3 }
        }
      });
    });

    test("Then events before the specified date are returned", async () => {
      expect(eventsPersisted.length).toBeGreaterThanOrEqual(2);
    });

    test("Then all returned events have timestamps less than the specified date", async () => {
      eventsPersisted.forEach((event) => {
        expect(event.timestamp.getTime()).toBeLessThan(date3.getTime());
      });
    });

    test("Then event1 and event2 are included", async () => {
      const eventIds = eventsPersisted.map((e) => e.id);
      expect(eventIds).toContain(id1);
      expect(eventIds).toContain(id2);
    });

    test("Then event3 is not included", async () => {
      const eventIds = eventsPersisted.map((e) => e.id);
      expect(eventIds).not.toContain(id3);
    });
  });

  describe("When querying events by timestamp with $lte operator", async () => {
    let eventsPersisted: PersistedEvent[];

    beforeAll(async () => {
      eventsPersisted = await sorciTestClient.getEventsByQuery({
        $where: {
          type: "test-event",
          timestamp: { $lte: date3 }
        }
      });
    });

    test("Then events less than or equal to the specified date are returned", async () => {
      expect(eventsPersisted.length).toBeGreaterThanOrEqual(3);
    });

    test("Then all returned events have timestamps less than or equal to the specified date", async () => {
      eventsPersisted.forEach((event) => {
        expect(event.timestamp.getTime()).toBeLessThanOrEqual(date3.getTime());
      });
    });

    test("Then event1, event2, and event3 are included", async () => {
      const eventIds = eventsPersisted.map((e) => e.id);
      expect(eventIds).toContain(id1);
      expect(eventIds).toContain(id2);
      expect(eventIds).toContain(id3);
    });
  });

  describe("When querying events by timestamp with $between operator", async () => {
    let eventsPersisted: PersistedEvent[];

    beforeAll(async () => {
      eventsPersisted = await sorciTestClient.getEventsByQuery({
        $where: {
          type: "test-event",
          timestamp: { $between: [date2, date4] }
        }
      });
    });

    test("Then events within the inclusive range are returned", async () => {
      expect(eventsPersisted.length).toBeGreaterThanOrEqual(3);
    });

    test("Then all returned events have timestamps within the inclusive range", async () => {
      eventsPersisted.forEach((event) => {
        expect(event.timestamp.getTime()).toBeGreaterThanOrEqual(
          date2.getTime()
        );
        expect(event.timestamp.getTime()).toBeLessThanOrEqual(date4.getTime());
      });
    });

    test("Then event2, event3, and event4 are included", async () => {
      const eventIds = eventsPersisted.map((e) => e.id);
      expect(eventIds).toContain(id2);
      expect(eventIds).toContain(id3);
      expect(eventIds).toContain(id4);
    });

    test("Then event1 and event5 are not included", async () => {
      const eventIds = eventsPersisted.map((e) => e.id);
      expect(eventIds).not.toContain(id1);
      expect(eventIds).not.toContain(id5);
    });
  });

  describe("When querying events by ID with $gt operator", async () => {
    let eventsPersisted: PersistedEvent[];

    beforeAll(async () => {
      eventsPersisted = await sorciTestClient.getEventsByQuery({
        $where: {
          type: "test-event",
          id: { $gt: id3 }
        }
      });
    });

    test("Then events with IDs greater than the specified ID are returned", async () => {
      expect(eventsPersisted.length).toBeGreaterThanOrEqual(2);
    });

    test("Then all returned events have IDs lexicographically greater than the specified ID", async () => {
      eventsPersisted.forEach((event) => {
        expect(event.id.localeCompare(id3)).toBeGreaterThan(0);
      });
    });

    test("Then event4 and event5 are included", async () => {
      const eventIds = eventsPersisted.map((e) => e.id);
      expect(eventIds).toContain(id4);
      expect(eventIds).toContain(id5);
    });

    test("Then event3 is not included", async () => {
      const eventIds = eventsPersisted.map((e) => e.id);
      expect(eventIds).not.toContain(id3);
    });
  });

  describe("When querying events by ID with $gte operator", async () => {
    let eventsPersisted: PersistedEvent[];

    beforeAll(async () => {
      eventsPersisted = await sorciTestClient.getEventsByQuery({
        $where: {
          type: "test-event",
          id: { $gte: id3 }
        }
      });
    });

    test("Then events with IDs greater than or equal to the specified ID are returned", async () => {
      expect(eventsPersisted.length).toBeGreaterThanOrEqual(3);
    });

    test("Then all returned events have IDs lexicographically greater than or equal to the specified ID", async () => {
      eventsPersisted.forEach((event) => {
        expect(event.id.localeCompare(id3)).toBeGreaterThanOrEqual(0);
      });
    });

    test("Then event3, event4, and event5 are included", async () => {
      const eventIds = eventsPersisted.map((e) => e.id);
      expect(eventIds).toContain(id3);
      expect(eventIds).toContain(id4);
      expect(eventIds).toContain(id5);
    });
  });

  describe("When querying events by ID with $lt operator", async () => {
    let eventsPersisted: PersistedEvent[];

    beforeAll(async () => {
      eventsPersisted = await sorciTestClient.getEventsByQuery({
        $where: {
          type: "test-event",
          id: { $lt: id3 }
        }
      });
    });

    test("Then events with IDs less than the specified ID are returned", async () => {
      expect(eventsPersisted.length).toBeGreaterThanOrEqual(2);
    });

    test("Then all returned events have IDs lexicographically less than the specified ID", async () => {
      eventsPersisted.forEach((event) => {
        expect(event.id.localeCompare(id3)).toBeLessThan(0);
      });
    });

    test("Then event1 and event2 are included", async () => {
      const eventIds = eventsPersisted.map((e) => e.id);
      expect(eventIds).toContain(id1);
      expect(eventIds).toContain(id2);
    });

    test("Then event3 is not included", async () => {
      const eventIds = eventsPersisted.map((e) => e.id);
      expect(eventIds).not.toContain(id3);
    });
  });

  describe("When querying events by ID with $lte operator", async () => {
    let eventsPersisted: PersistedEvent[];

    beforeAll(async () => {
      eventsPersisted = await sorciTestClient.getEventsByQuery({
        $where: {
          type: "test-event",
          id: { $lte: id3 }
        }
      });
    });

    test("Then events with IDs less than or equal to the specified ID are returned", async () => {
      expect(eventsPersisted.length).toBeGreaterThanOrEqual(3);
    });

    test("Then all returned events have IDs lexicographically less than or equal to the specified ID", async () => {
      eventsPersisted.forEach((event) => {
        expect(event.id.localeCompare(id3)).toBeLessThanOrEqual(0);
      });
    });

    test("Then event1, event2, and event3 are included", async () => {
      const eventIds = eventsPersisted.map((e) => e.id);
      expect(eventIds).toContain(id1);
      expect(eventIds).toContain(id2);
      expect(eventIds).toContain(id3);
    });
  });

  describe("When querying events by ID with $between operator", async () => {
    let eventsPersisted: PersistedEvent[];

    beforeAll(async () => {
      eventsPersisted = await sorciTestClient.getEventsByQuery({
        $where: {
          type: "test-event",
          id: { $between: [id2, id4] }
        }
      });
    });

    test("Then events with IDs within the inclusive range are returned", async () => {
      expect(eventsPersisted.length).toBeGreaterThanOrEqual(3);
    });

    test("Then all returned events have IDs within the inclusive range", async () => {
      eventsPersisted.forEach((event) => {
        expect(event.id.localeCompare(id2)).toBeGreaterThanOrEqual(0);
        expect(event.id.localeCompare(id4)).toBeLessThanOrEqual(0);
      });
    });

    test("Then event2, event3, and event4 are included", async () => {
      const eventIds = eventsPersisted.map((e) => e.id);
      expect(eventIds).toContain(id2);
      expect(eventIds).toContain(id3);
      expect(eventIds).toContain(id4);
    });

    test("Then event1 and event5 are not included", async () => {
      const eventIds = eventsPersisted.map((e) => e.id);
      expect(eventIds).not.toContain(id1);
      expect(eventIds).not.toContain(id5);
    });
  });

  describe("When querying events by timestamp with Date string", async () => {
    let eventsPersisted: PersistedEvent[];

    beforeAll(async () => {
      eventsPersisted = await sorciTestClient.getEventsByQuery({
        $where: {
          type: "test-event",
          timestamp: { $gte: date3.toISOString() }
        }
      });
    });

    test("Then events are returned correctly when using ISO string", async () => {
      expect(eventsPersisted.length).toBeGreaterThanOrEqual(3);
    });

    test("Then all returned events have timestamps greater than or equal to the specified date", async () => {
      eventsPersisted.forEach((event) => {
        expect(event.timestamp.getTime()).toBeGreaterThanOrEqual(
          date3.getTime()
        );
      });
    });
  });

  describe("When combining timestamp and ID filters", async () => {
    let eventsPersisted: PersistedEvent[];

    beforeAll(async () => {
      eventsPersisted = await sorciTestClient.getEventsByQuery({
        $where: {
          type: "test-event",
          timestamp: { $between: [date2, date4] },
          id: { $gte: id3 }
        }
      });
    });

    test("Then exactly two events are returned", async () => {
      expect(eventsPersisted).toHaveLength(2);
    });

    test("Then event3 and event4 are included", async () => {
      const eventIds = eventsPersisted.map((e) => e.id);
      expect(eventIds).toContain(id3);
      expect(eventIds).toContain(id4);
      expect(eventIds).not.toContain(id5);
    });

    test("Then all returned events have timestamps within the range", async () => {
      const date2Time = date2.getTime();
      const date4Time = date4.getTime();

      eventsPersisted.forEach((event) => {
        const eventTimestamp = event.timestamp.getTime();

        if (eventTimestamp > date4Time) {
          console.error(
            `Event ${event.id} has timestamp ${eventTimestamp} (${event.timestamp.toISOString()}) which is greater than date4 ${date4Time} (${date4.toISOString()})`
          );
          console.error(
            `Expected range: [${date2.toISOString()}, ${date4.toISOString()}]`
          );
        }

        expect(eventTimestamp).toBeGreaterThanOrEqual(date2Time);
        expect(eventTimestamp).toBeLessThanOrEqual(date4Time);
      });
    });

    test("Then all returned events have IDs greater than or equal to id3", async () => {
      eventsPersisted.forEach((event) => {
        expect(event.id.localeCompare(id3)).toBeGreaterThanOrEqual(0);
      });
    });
  });
});
