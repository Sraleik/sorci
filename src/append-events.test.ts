import { createId } from "./common/utils";
import { SorciEvent } from "./sorci-event";
import { ConcurrencyError } from "./sorci.error";
import {
  createCourseCreated,
  createCourseCapacityChanged
} from "./test-helpers";

describe("Given an empty stream", async () => {
  describe("When appending three events together without a query", async () => {
    test("Then all three events are persisted in the order they were given", async () => {
      const courseId = createId();
      const courseCreated = createCourseCreated({ courseId });
      const capacityChanged = createCourseCapacityChanged({
        courseId,
        oldCapacity: courseCreated.data.capacity
      });
      const renamed = SorciEvent.create({
        type: "course-renamed",
        data: { courseId, newName: "Physique" }
      });

      const eventIds = await sorciTestClient.appendEvents({
        sourcingEvents: [courseCreated, capacityChanged, renamed]
      });

      expect(eventIds).toEqual([
        courseCreated.id,
        capacityChanged.id,
        renamed.id
      ]);

      const persisted = await sorciTestClient.getEventsByQuery({
        $where: { identifiers: { courseId } }
      });

      expect(persisted.map((event) => event.id)).toEqual([
        courseCreated.id,
        capacityChanged.id,
        renamed.id
      ]);
    });
  });

  describe("When appending events with a query that matches nothing and a lastKnownEventId", async () => {
    test("Then the promise rejects with a typed ConcurrencyError instead of crashing", async () => {
      const courseId = createId();

      // Cas vécu : avant le correctif, `lastEvent` est `undefined` (aucun fait
      // ne correspond à la requête) et le message d'erreur lisait
      // `lastEvent.id` sans garde, ce qui plantait en `TypeError` au lieu de
      // rendre l'échec de concurrence attendu.
      const promise = sorciTestClient.appendEvents({
        sourcingEvents: [createCourseCreated({ courseId })],
        query: {
          $where: { identifiers: { courseId } }
        },
        lastKnownEventId: createId()
      });

      await expect(promise).rejects.toBeInstanceOf(ConcurrencyError);
      await expect(promise).rejects.toThrow(/Concurrency conflict detected/);

      const persisted = await sorciTestClient.getEventsByQuery({
        $where: { identifiers: { courseId } }
      });
      expect(persisted).toHaveLength(0);
    });
  });
});

describe("Given a populated stream", async () => {
  describe("When appending several events with a wrong lastKnownEventId", async () => {
    test("Then none of the events are persisted", async () => {
      const courseId = createId();
      const courseCreated = createCourseCreated({ courseId });
      await sorciTestClient.appendEvents({ sourcingEvents: [courseCreated] });

      const capacityChangedOnce = createCourseCapacityChanged({
        courseId,
        oldCapacity: courseCreated.data.capacity
      });
      const capacityChangedTwice = createCourseCapacityChanged({
        courseId,
        oldCapacity: capacityChangedOnce.data.newCapacity
      });

      const promise = sorciTestClient.appendEvents({
        sourcingEvents: [capacityChangedOnce, capacityChangedTwice],
        query: {
          $where: { identifiers: { courseId } }
        },
        lastKnownEventId: createId() // mauvais identifiant, exprès
      });

      await expect(promise).rejects.toThrow(/Concurrency conflict detected/);

      const persisted = await sorciTestClient.getEventsByQuery({
        $where: { identifiers: { courseId } }
      });
      expect(persisted.map((event) => event.id)).toEqual([courseCreated.id]);
    });
  });
});
