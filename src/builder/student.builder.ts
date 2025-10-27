import { faker } from "@faker-js/faker";
import { createId } from "../common/utils";
import { SorciEvent } from "../sorci-event";
import { Sorci } from "../sorci.interface";
import { CourseBuilder } from "./course.builder";
import { UserBuilder } from "./user.builder";
import { BuilderOrId } from "../type";

export class StudentBuilder {
  private sorci: Sorci;
  private _aggregateId: string;
  private _events: {
    data: Record<string, any>;
    identifier?: Record<string, any>;
    type: string;
  }[] = [];
  private courseBuilders: BuilderOrId<CourseBuilder>[] = [];
  private defaultActorBuilderOrId: BuilderOrId<UserBuilder>;

  constructor(payload: { sorci: Sorci; aUser: () => UserBuilder }) {
    const { sorci, aUser } = payload;
    this.sorci = sorci;
    this._aggregateId = createId();

    const userBuilder = aUser();
    this.defaultActorBuilderOrId = { builder: userBuilder };

    this._events.push({
      data: {
        studentId: this.aggregateId,
        name: faker.person.firstName(),
        actorId: userBuilder.aggregateId
      },
      identifier: {
        studentId: this.aggregateId,
        actorId: userBuilder.aggregateId
      },
      type: "student-created"
    });
  }

  get aggregateId() {
    return this._aggregateId;
  }

  get events() {
    return [...this._events];
  }

  get name() {
    return [...this._events].reverse().find((event) => event.data.name)?.data
      .name;
  }

  private getActorId(providedActorId?: string): string {
    if (providedActorId) {
      return providedActorId;
    }
    return (
      this.defaultActorBuilderOrId.builder?.aggregateId ||
      this.defaultActorBuilderOrId.id!
    );
  }

  withId(id: string) {
    this._aggregateId = id;
    this._events.forEach((event) => {
      event.data.studentId = id;
      if (event.identifier) {
        event.identifier.studentId = id;
      }
    });
    return this;
  }

  withInitialName(name: string) {
    this._events[0].data.name = name;
    return this;
  }

  subscribedToCourse(
    courseBuilder: CourseBuilder,
    payload?: { actorId?: string }
  ) {
    const actorId = this.getActorId(payload?.actorId);

    this.courseBuilders.push({ builder: courseBuilder });
    this._events.push({
      type: "student-subscribed-to-course",
      data: {
        studentId: this.aggregateId,
        courseId: courseBuilder.aggregateId,
        actorId
      },
      identifier: {
        studentId: this.aggregateId,
        courseId: courseBuilder.aggregateId,
        actorId
      }
    });
    return this;
  }

  unsubscribedToCourse(
    courseBuilder: CourseBuilder,
    payload?: { actorId?: string }
  ) {
    const actorId = this.getActorId(payload?.actorId);

    this._events.push({
      type: "student-unsubscribed-to-course",
      data: {
        studentId: this.aggregateId,
        courseId: courseBuilder.aggregateId,
        actorId
      },
      identifier: {
        studentId: this.aggregateId,
        courseId: courseBuilder.aggregateId,
        actorId
      }
    });
    return this;
  }

  private async buildCoursesAndGetIds() {
    const courseIds: string[] = [];
    for (let i = 0; i < this.courseBuilders.length; i++) {
      const courseBuilderOrId = this.courseBuilders[i];
      if (courseBuilderOrId.builder) {
        const { courseBuilder } = await courseBuilderOrId.builder.build();
        this.courseBuilders[i] = { id: courseBuilder.aggregateId };
        courseIds.push(courseBuilder.aggregateId);
      } else if (courseBuilderOrId.id) {
        courseIds.push(courseBuilderOrId.id);
      }
    }
    return courseIds;
  }

  private async buildDefaultActorAndGetId() {
    if (this.defaultActorBuilderOrId.builder) {
      const { userBuilder } =
        await this.defaultActorBuilderOrId.builder.build();
      this.defaultActorBuilderOrId = { id: userBuilder.aggregateId };
      return userBuilder.aggregateId;
    }
    return this.defaultActorBuilderOrId.id;
  }

  async build() {
    await this.buildDefaultActorAndGetId();
    await this.buildCoursesAndGetIds();

    await this.sorci.insertEvents(
      this._events.map((event) => SorciEvent.create(event))
    );

    const events = await this.sorci.getEventsByQuery({
      $where: {
        identifiers: { studentId: this.aggregateId }
      }
    });

    return { studentBuilder: this, events };
  }
}
