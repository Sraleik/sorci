import { createId } from "../common/utils";
import { PersistedEvent } from "../sorci.interface";

describe("Given a Student Builder", async () => {
  describe("When building a simple student", async () => {
    let events: PersistedEvent[];
    let studentId: string;

    beforeAll(async () => {
      const result = await aStudent().build();
      events = result.events;
      studentId = events[0].data.studentId;
    });

    test("Then the student is created with a ulid id", async () => {
      expect(studentId).toBeUlid();
    });

    test("Then a single event is created", async () => {
      expect(events).toHaveLength(1);
    });
  });

  describe("When creating a student with custom name and id", async () => {
    const customStudentId = createId();
    const customStudentName = "Alice Johnson";
    let events: PersistedEvent[];
    let createdEvent: PersistedEvent;

    beforeAll(async () => {
      const result = await aStudent()
        .withInitialName(customStudentName)
        .withId(customStudentId)
        .build();
      events = result.events;
      createdEvent = events[0];
    });

    test("Then the student has the custom id", async () => {
      const studentPersistedId = createdEvent.identifier.studentId;
      expect(studentPersistedId).toEqual(customStudentId);
    });

    test("Then the student has the custom name", async () => {
      const studentPersistedName = createdEvent.data.name;
      expect(studentPersistedName).toEqual(customStudentName);
    });

    test("Then a single event is created", async () => {
      expect(events).toHaveLength(1);
    });
  });

  describe("When subscribing a student to a course", async () => {
    let studentEvents: PersistedEvent[];
    let courseEvents: PersistedEvent[];
    let courseId: string | undefined;

    beforeAll(async () => {
      const { events } = await aStudent()
        .withInitialName("Bob Smith")
        .subscribedToCourse(aCourse())
        .build();
      studentEvents = events;
      courseId = events[1].data.courseId;

      courseEvents = await sorciTestClient.getEventsByQuery({
        $where: {
          identifiers: { courseId }
        }
      });
    });

    test("Then the student is subscribed to the course", async () => {
      expect(courseId).toBeUlid();
      expect(courseEvents.length).toBeGreaterThanOrEqual(1);
      expect(studentEvents).toHaveLength(2);
      expect(studentEvents[1].type).toEqual("student-subscribed-to-course");
    });
  });

  describe("When subscribing and unsubscribing a student from a course", async () => {
    let studentEvents: PersistedEvent[];
    let courseId: string | undefined;

    beforeAll(async () => {
      const course = aCourse();
      const { events } = await aStudent()
        .withInitialName("Charlie Brown")
        .subscribedToCourse(course)
        .unsubscribedToCourse(course)
        .build();
      studentEvents = events;
      courseId = events[1].data.courseId;
    });

    test("Then the student has subscription and unsubscription events", async () => {
      expect(courseId).toBeUlid();
      expect(studentEvents).toHaveLength(3);
      expect(studentEvents[1].type).toEqual("student-subscribed-to-course");
      expect(studentEvents[2].type).toEqual("student-unsubscribed-to-course");
      expect(studentEvents[2].data.courseId).toEqual(courseId);
    });
  });

  describe("When subscribing to multiple courses", async () => {
    let studentEvents: PersistedEvent[];
    let courseId1: string | undefined;
    let courseId2: string | undefined;

    beforeAll(async () => {
      const course1 = aCourse();
      const course2 = aCourse();
      const { events } = await aStudent()
        .withInitialName("Diana Prince")
        .subscribedToCourse(course1)
        .subscribedToCourse(course2)
        .build();
      studentEvents = events;
      courseId1 = events[1].data.courseId;
      courseId2 = events[2].data.courseId;
    });

    test("Then the student is subscribed to multiple courses", async () => {
      expect(courseId1).toBeUlid();
      expect(courseId2).toBeUlid();
      expect(courseId1).not.toEqual(courseId2);
      expect(studentEvents).toHaveLength(3);
      expect(studentEvents[1].type).toEqual("student-subscribed-to-course");
      expect(studentEvents[2].type).toEqual("student-subscribed-to-course");
    });
  });

  describe("When performing multiple subscription operations", async () => {
    let studentEvents: PersistedEvent[];

    beforeAll(async () => {
      const course1 = aCourse();
      const course2 = aCourse();
      const { events } = await aStudent()
        .withInitialName("Eve Adams")
        .subscribedToCourse(course1)
        .subscribedToCourse(course2)
        .unsubscribedToCourse(course1)
        .subscribedToCourse(course1)
        .build();
      studentEvents = events;
    });

    test("Then all subscription events are recorded", async () => {
      expect(studentEvents).toHaveLength(5);
      expect(studentEvents[1].type).toEqual("student-subscribed-to-course");
      expect(studentEvents[2].type).toEqual("student-subscribed-to-course");
      expect(studentEvents[3].type).toEqual("student-unsubscribed-to-course");
      expect(studentEvents[4].type).toEqual("student-subscribed-to-course");
    });
  });
});
