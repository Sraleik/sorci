## Here is a fonctional exemple without any Dependency Injection

```typescript
import { SorciPostgres, SorciEvent } from "sorci";

// I'll assume the stream already exist
// so no need to call sorci.createStream()
const sorci = new SorciPostgres({
  host: "localhost",
  port: 54322,
  user: "postgres",
  password: "postgres",
  database: "postgres",
  streamName: "sorci-school"
});

export type SubscribeToCoursePayload = {
  studentId: string;
  courseId: string;
};

// Domain Rules :
// The course should exist
// The student should exist
// The student should not be already subscribed to the course
// The course should not be full
export const subscribeToCourse = async (payload: SubscribeToCoursePayload) => {
  const query = {
    // For simplicity we will assume their is no "course-deleted", "student-deleted", "course-unsubscribed"
    type: [
      "course-created",
      "course-subscribed",
      "course-capacity-changed",
      "student-created"
    ],
    identifier: [
      { studentId: payload.studentId },
      { courseId: payload.courseId }
    ]
  };

  // We need to get all the events that are necessary to check the domain rules
  const necessaryEvent = await sorci.query(query);

  const isCourseCreated = necessaryEvent.some(
    (event) => event.type === "course-created"
  );
  if (!isCourseCreated) throw new Error("The course does not exist");

  const doesStudentExist = necessaryEvent.some(
    (event) => event.type === "student-created"
  );
  if (!doesStudentExist) throw new Error("The student does not exist");

  const isStudentAlreadySubscribed = necessaryEvent.some(
    (event) =>
      event.type === "course-subscribed" &&
      event.studentId === payload.studentId
  );
  if (isStudentAlreadySubscribed)
    throw new Error("The student is already subscribed to this course");

  const subscribedStudentsCount = necessaryEvent.filter(
    (event) => event.type === "course-subscribed"
  ).length;

  const lastCourseCapacityChanged = necessaryEvent.findLast(
    (event) => event.type === "course-capacity-changed"
  );

  const initialCourseCapacity = necessaryEvent.find(
    (event) => event.type === "course-created"
  ).capacity;

  const courseCapacity =
    lastCourseCapacityChanged.newCapacity || initialCourseCapacity;

  const isCourseFull = courseCapacity >= subscribedStudentsCount;
  if (isCourseFull) throw new Error("The course is full");

  const courseSubscribed = SorciEvent.create({
    type: "course-subscribed",
    data: {
      studentId: payload.studentId,
      courseId: payload.courseId
    }
  });

  await sorci.append({
    sourcingEvent: courseSubscribed,
    // We pass the same query as in the start of the command.
    // So if new events are added in the stream while this command was running it will not be able to persist, we will be notified
    query,
    // When the database try to persit, if the last event of the stream is not the same as the last event of the query, it will throw an error
    eventIdentifier: necessaryEvent[necessaryEvent.length - 1].id
  });
};

```

## Same exemple but with a small aggregate that will compute necessary states 

```typescript
import { SorciPostgres, Sorci, PersistedEvent } from "sorci";

// I'll assume the stream already exist
// so no need to call sorci.createStream()
const sorci = new SorciPostgres({
  host: "localhost",
  port: 54322,
  user: "postgres",
  password: "postgres",
  database: "postgres",
  streamName: "sorci-school"
});

export type SubscribeToCoursePayload = {
  studentId: string;
  courseId: string;
};

// Simple aggregate
// It could be usefull only for this command/decision
// or exported and use for every command/decision
// that require the same types of events
class Course {
  constructor(public sourcingEvent: PersistedEvent[]) {}

  private get firstEvent() {
    return this.sourcingEvent[0];
  }

  private get lastEvent() {
    return this.sourcingEvent[this.sourcingEvent.length - 1];
  }

  get id() {
    return this.firstEvent.data.courseId;
  }

  get eventIdentifier() {
    return this.lastEvent.id;
  }

  get capacity() {
    const initialCapacity = this.firstEvent.data.capacity;
    const capacityChangedEvents = this.sourcingEvent.filter((event) => {
      return event.type === "course-capacity-changed";
    });

    const lastCapacityChangedEvent =
      capacityChangedEvents[capacityChangedEvents.length - 1];

    return initialCapacity || lastCapacityChangedEvent.data.newCapacity;
  }

  get isFull() {
    const subscribedStudentsCount = this.sourcingEvent.filter(
      (event) => event.type === "course-subscribed"
    ).length;

    return subscribedStudentsCount >= this.capacity;
  }

  get studentSubscribedIds() {
    return this.sourcingEvent
      .filter((event) => event.type === "course-subscribed")
      .map((event) => event.data.studentId);
  }

  isStudentSubscribed(studentId: string) {
    return this.studentSubscribedIds.includes(studentId);
  }
}

// Domain Rules :
// The course should exist
// The student should exist
// The student should not be already subscribed to the course
// The course should not be full
export const subscribeToCourse = async (payload: SubscribeToCoursePayload) => {
  const query = {
    // For simplicity we will assume their is no "course-deleted", "student-delete", "course-unsubscribed"
    type: [
      "course-created",
      "course-subscribed",
      "course-capacity-changed",
      "student-created"
    ],
    identifier: [
      { studentId: payload.studentId },
      { courseId: payload.courseId }
    ]
  };

  // We need to get all the events that are necessary to check the domain rules
  const necessaryEvent = await sorci.query(query);

  const isCourseCreated = necessaryEvent.some(
    (event) => event.type === "course-created"
  );
  if (!isCourseCreated) throw new Error("The course does not exist");

  const doesStudentExist = necessaryEvent.some(
    (event) => event.type === "student-created"
  );
  if (!doesStudentExist) throw new Error("The student does not exist");

  const course = new Course(necessaryEvent);

  if (course.isStudentSubscribed(payload.studentId))
    throw new Error("The student is already subscribed to this course");

  if (course.isFull) throw new Error("The course is full");

  const courseSubscribed = Sorci.createEvent({
    type: "course-subscribed",
    data: {
      studentId: payload.studentId,
      courseId: course.id
    }
  });

  await sorci.append({
    sourcingEvent: courseSubscribed,
    // We pass the same query as in the start of the command.
    // So if new events are added in the stream while this command was running it will not be able to persist, we will be notified
    query,
    // When the database try to persit, if the last event of the stream is not the same as the last event of the query, it will throw an error
    eventIdentifier: course.eventIdentifier 
  });
};
```
