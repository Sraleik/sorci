import { createId } from "../common/utils";
import { PersistedEvent } from "../sorci.interface";

describe("Given a Course Builder", async () => {
  describe("When building a simple course", async () => {
    let events: PersistedEvent[];
    let courseId: string;

    beforeAll(async () => {
      const result = await aCourse().build();
      events = result.events;
      courseId = events[0].data.courseId;
    });

    test("Then the course is created with a ulid id", async () => {
      expect(courseId).toBeUlid();
    });

    test("Then a single event is created", async () => {
      expect(events).toHaveLength(1);
    });
  });

  describe("When creating a course with custom name, capacity and id", async () => {
    const customCourseId = createId();
    const customCourseName = "Advanced TypeScript";
    const customCourseCapacity = 20;
    let events: PersistedEvent[];
    let createdEvent: PersistedEvent;

    beforeAll(async () => {
      const result = await aCourse()
        .withInitialName(customCourseName)
        .withInitialCapacity(customCourseCapacity)
        .withId(customCourseId)
        .build();
      events = result.events;
      createdEvent = events[0];
    });

    test("Then the course has the custom id", async () => {
      const coursePersistedId = createdEvent.identifier.courseId;
      expect(coursePersistedId).toEqual(customCourseId);
    });

    test("Then the course has the custom name", async () => {
      const coursePersistedName = createdEvent.data.name;
      expect(coursePersistedName).toEqual(customCourseName);
    });

    test("Then the course has the custom capacity", async () => {
      const coursePersistedCapacity = createdEvent.data.capacity;
      expect(coursePersistedCapacity).toEqual(customCourseCapacity);
    });

    test("Then a single event is created", async () => {
      expect(events).toHaveLength(1);
    });
  });

  describe("When changing course capacity", async () => {
    let events: PersistedEvent[];
    let courseCapacity: number | undefined;

    beforeAll(async () => {
      const result = await aCourse()
        .withInitialCapacity(10)
        .capacityChanged({ capacity: 20 })
        .build();
      events = result.events;
      courseCapacity = [...events]
        .reverse()
        .find((event) => event.data.newCapacity)?.data.newCapacity;
    });

    test("Then two events are created", async () => {
      expect(events).toHaveLength(2);
    });

    test("Then the course has the new capacity", async () => {
      expect(courseCapacity).toEqual(20);
    });
  });

  describe("When renaming a course", async () => {
    let events: PersistedEvent[];
    let courseName: string | undefined;

    beforeAll(async () => {
      const result = await aCourse()
        .withInitialName("Introduction to JavaScript")
        .renamed({ name: "Advanced JavaScript" })
        .build();
      events = result.events;
      courseName = [...events].reverse().find((event) => event.data.newName)
        ?.data.newName;
    });

    test("Then two events are created", async () => {
      expect(events).toHaveLength(2);
    });

    test("Then the course has the new name", async () => {
      expect(courseName).toEqual("Advanced JavaScript");
    });
  });

  describe("When applying multiple changes to a course", async () => {
    let events: PersistedEvent[];
    let courseName: string | undefined;
    let courseCapacity: number | undefined;

    beforeAll(async () => {
      const result = await aCourse()
        .withInitialName("Initial Course")
        .withInitialCapacity(10)
        .renamed({ name: "Second Course" })
        .capacityChanged({ capacity: 15 })
        .renamed({ name: "Third Course" })
        .capacityChanged({ capacity: 20 })
        .build();
      events = result.events;
      const reversedEvents = [...events].reverse();
      courseName = reversedEvents.find((event) => event.data.newName)?.data
        .newName;
      courseCapacity = reversedEvents.find((event) => event.data.newCapacity)
        ?.data.newCapacity;
    });

    test("Then six events are created", async () => {
      expect(events).toHaveLength(5);
    });

    test("Then the course has the final name", async () => {
      expect(courseName).toEqual("Third Course");
    });

    test("Then the course has the final capacity", async () => {
      expect(courseCapacity).toEqual(20);
    });
  });
});
