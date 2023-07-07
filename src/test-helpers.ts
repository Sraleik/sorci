import { faker } from "@faker-js/faker";
import { createId } from "./common/utils";
import { SorciEvent } from "./sorci-event";

// In my test (unit & benchmark) I will use a Course / Student Domain

export const createCourseCreated = (payload?: { capacity: number }) => {
  return SorciEvent.create({
    type: "course-created",
    data: {
      courseId: createId(),
      name: faker.lorem.sentence(),
      capacity: payload?.capacity || faker.number.int({ min: 10, max: 25 }),
    },
  });
};

export const createCourseCapacityChanged = ({
  courseId,
  oldCapacity,
}: {
  courseId: number;
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
  courseId: number;
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

export const createStudentCreated = () => {
  return SorciEvent.create({
    type: "student-created",
    data: {
      studentId: createId(),
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
