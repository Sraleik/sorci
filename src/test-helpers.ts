import { faker } from "@faker-js/faker";
import { createId } from "./common/utils";
import { SorciEvent } from "./sorci-event";

// In my test (unit & benchmark) I will use a Course / Student Domain

export const createCourseCreated = (payload?: {
  courseId?: string;
  capacity?: number;
}) => {
  const courseId = payload?.courseId || createId();
  return SorciEvent.create({
    type: "course-created",
    data: {
      courseId,
      name: faker.lorem.sentence(),
      capacity: payload?.capacity || faker.number.int({ min: 10, max: 25 }),
    },
  });
};

export const createCourseCapacityChanged = ({
  courseId,
  oldCapacity,
}: {
  courseId: string;
  oldCapacity: number;
}) => {
  return SorciEvent.create({
    type: "course-capacity-changed",
    data: {
      courseId,
      oldCapacity,
      newCapacity: faker.number.int({ min: 10, max: 25 }),
    },
  });
};

export const createCourseRenamed = ({
  courseId,
  oldName,
}: {
  courseId: string;
  oldName: string;
}) => {
  return SorciEvent.create({
    type: "course-renamed",
    data: {
      courseId,
      oldName,
      newName: faker.lorem.sentence(),
    },
  });
};

// Informational events
export const createCourseFullyBooked = ({
  courseId,
  capacity,
}: {
  courseId: string;
  capacity: string;
}) => {
  return SorciEvent.create({
    type: "course-fully-booked",
    data: {
      courseId,
      capacity,
    },
  });
};

export const createStudentCreated = (payload?: { studentId?: string }) => {
  return SorciEvent.create({
    type: "student-created",
    data: {
      studentId: payload?.studentId || createId(),
      name: faker.person.firstName(),
    },
  });
};

export const createStudentSubscribedToCourse = ({
  courseId,
  studentId,
}: {
  courseId: string;
  studentId: string;
}) => {
  return SorciEvent.create({
    type: "student-subscribed-to-course",
    data: {
      courseId,
      studentId,
    },
  });
};

export const createStudentUnsubscribedToCourse = ({
  courseId,
  studentId,
}: {
  courseId: string;
  studentId: string;
}) => {
  return SorciEvent.create({
    type: "student-unsubscribed-to-course",
    data: {
      courseId,
      studentId,
    },
  });
};

export const createCourseFullLife = (payload?: {
  courseId?: string;
  studentId?: string;
}) => {
  const courseCreated = createCourseCreated({ courseId: payload?.courseId });
  const courseId = courseCreated.data.courseId as string;

  const courseCapacityChanged1 = createCourseCapacityChanged({
    courseId,
    oldCapacity: courseCreated.data.capacity,
  });
  const courseCapacityChanged2 = createCourseCapacityChanged({
    courseId,
    oldCapacity: courseCapacityChanged1.data.newCapacity,
  });
  const courseRenamed1 = createCourseRenamed({
    courseId,
    oldName: courseCreated.data.name,
  });
  const courseRenamed2 = createCourseRenamed({
    courseId,
    oldName: courseRenamed1.data.newName,
  });
  const courseRenamed3 = createCourseRenamed({
    courseId,
    oldName: courseRenamed2.data.newName,
  });

  const studentCreated = createStudentCreated({
    studentId: payload?.studentId,
  });
  const studentId = studentCreated.data.studentId as string;
  
  const studentSubscribedToCourse1 = createStudentSubscribedToCourse({
    courseId,
    studentId,
  });
  const studentUnsubscribedToCourse = createStudentUnsubscribedToCourse({
    courseId,
    studentId,
  });
  const studentSubscribedToCourse2 = createStudentSubscribedToCourse({
    courseId,
    studentId,
  });

  return [
    courseCreated,
    courseCapacityChanged1,
    courseRenamed1,
    courseRenamed2,
    studentCreated,
    courseCapacityChanged2,
    studentSubscribedToCourse1,
    courseRenamed3,
    studentUnsubscribedToCourse, 
    studentSubscribedToCourse2,
  ];
};
