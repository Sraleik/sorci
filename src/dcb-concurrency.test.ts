import { createId } from "./common/utils";
import { SorciEvent } from "./sorci-event";

describe("Given Dynamic Consistency Boundary (DCB) with Optimistic Concurrency Control", () => {
  describe("When appending events to different aggregates without conflicts", async () => {
    let results: PromiseSettledResult<string>[];

    beforeAll(async () => {
      const todoListId = createId();
      const itemToRenameId = createId();

      await aTodoList()
        .withId(todoListId)
        .withInitialTitle("Shopping list")
        .with(aTodoListItem().withInitialTitle("Item 1"))
        .with(aTodoListItem().withId(itemToRenameId).withInitialTitle("Item 2"))
        .with(aTodoListItem().withInitialTitle("Item 3"))
        .with(aTodoListItem().withInitialTitle("Item 4"))
        .with(aTodoListItem().withInitialTitle("Item 5"))
        .with(aTodoListItem().withInitialTitle("Item 6"))
        .with(aTodoListItem().withInitialTitle("Item 7"))
        .with(aTodoListItem().withInitialTitle("Item 8"))
        .with(aTodoListItem().withInitialTitle("Item 9"))
        .build();

      const itemEvents = await sorciTestClient.getEventsByQuery({
        $where: {
          type: { $eq: "todo-list-created" },
          identifiers: { todoListId: todoListId }
        }
      });
      const itemEvents2 = await sorciTestClient.getEventsByQuery({
        $where: {
          type: { $eq: "todo-list-item-created" },
          identifiers: { todoListItemId: itemToRenameId }
        }
      });
      const todoListLastId = itemEvents[itemEvents.length - 1].id;
      const todoListItemLastId = itemEvents2[itemEvents2.length - 1].id;

      const todoListRenamedEvent = SorciEvent.create({
        type: "todo-list-renamed",
        data: {
          title: "Shopping list - User A",
          todoListId
        }
      });

      const todoListItemRenamedEvent = SorciEvent.create({
        type: "todo-list-item-renamed",
        data: {
          title: "Item 10 - User B",
          todoListItemId: itemToRenameId,
          todoListId: todoListId
        }
      });

      const concurrentPromises = [
        sorciTestClient.appendEvent({
          sourcingEvent: todoListRenamedEvent,
          query: {
            $where: {
              type: { $eq: "todo-list-created" },
              identifiers: { todoListId: todoListId }
            }
          },
          lastKnownEventId: todoListLastId
        }),
        sorciTestClient.appendEvent({
          sourcingEvent: todoListItemRenamedEvent,
          query: {
            $where: {
              type: { $eq: "todo-list-item-created" },
              identifiers: { todoListItemId: itemToRenameId }
            }
          },
          lastKnownEventId: todoListItemLastId
        })
      ];

      results = await Promise.allSettled(concurrentPromises);
    });

    test("Then both events are persisted", async () => {
      expect(results.map((result) => result.status)).toEqual([
        "fulfilled",
        "fulfilled"
      ]);
    });
  });

  describe("When multiple concurrent delete operations target the same aggregate", async () => {
    let results: PromiseSettledResult<string>[];
    let fulfilledCount: number;
    let rejectedCount: number;

    beforeAll(async () => {
      const todoListId = createId();

      const { events } = await aTodoList().withId(todoListId).build();

      const todoListLastId = events[events.length - 1].id;

      const concurrentPromises = [
        sorciTestClient.appendEvent({
          sourcingEvent: SorciEvent.create({
            type: "todo-list-deleted",
            data: {
              todoListId
            }
          }),
          query: {
            $where: {
              type: {
                $in: ["todo-list-created", "todo-list-deleted"],
                $skipLockOn: ["todo-list-created"]
              },
              identifiers: { todoListId: todoListId }
            }
          },
          lastKnownEventId: todoListLastId
        }),
        sorciTestClient.appendEvent({
          sourcingEvent: SorciEvent.create({
            type: "todo-list-deleted",
            data: {
              todoListId
            }
          }),
          query: {
            $where: {
              type: {
                $in: ["todo-list-created", "todo-list-deleted"],
                $skipLockOn: ["todo-list-created"]
              },
              identifiers: { todoListId: todoListId }
            }
          },
          lastKnownEventId: todoListLastId
        }),
        sorciTestClient.appendEvent({
          sourcingEvent: SorciEvent.create({
            type: "todo-list-deleted",
            data: {
              todoListId
            }
          }),
          query: {
            $where: {
              type: {
                $in: ["todo-list-created", "todo-list-deleted"],
                $skipLockOn: ["todo-list-created"]
              },
              identifiers: { todoListId: todoListId }
            }
          },
          lastKnownEventId: todoListLastId
        }),
        sorciTestClient.appendEvent({
          sourcingEvent: SorciEvent.create({
            type: "todo-list-deleted",
            data: {
              todoListId
            }
          }),
          query: {
            $where: {
              type: {
                $in: ["todo-list-created", "todo-list-deleted"],
                $skipLockOn: ["todo-list-created"]
              },
              identifiers: { todoListId: todoListId }
            }
          },
          lastKnownEventId: todoListLastId
        }),
        sorciTestClient.appendEvent({
          sourcingEvent: SorciEvent.create({
            type: "todo-list-deleted",
            data: {
              todoListId
            }
          }),
          query: {
            $where: {
              type: {
                $in: ["todo-list-created", "todo-list-deleted"],
                $skipLockOn: ["todo-list-created"]
              },
              identifiers: { todoListId: todoListId }
            }
          },
          lastKnownEventId: todoListLastId
        })
      ];

      results = await Promise.allSettled(concurrentPromises);

      const statusArray = results.map((result) => result.status);
      fulfilledCount = statusArray.filter(
        (status) => status === "fulfilled"
      ).length;
      rejectedCount = statusArray.filter(
        (status) => status === "rejected"
      ).length;
    }, 60_000);

    test("Then only one delete operation succeeds", async () => {
      expect(fulfilledCount).toBe(1);
    });

    test("Then four delete operations are rejected", async () => {
      expect(rejectedCount).toBe(4);
    });
  });

  describe("When delete operation acquires lock before rename (deterministic)", async () => {
    let results: PromiseSettledResult<string>[];

    beforeAll(async () => {
      const todoListId = createId();
      await aTodoList()
        .withId(todoListId)
        .withInitialTitle("Shopping list")
        .build();

      const itemEvents = await sorciTestClient.getEventsByQuery({
        $where: {
          type: { $eq: "todo-list-created" },
          identifiers: { todoListId: todoListId }
        }
      });
      const todoListLastId = itemEvents[itemEvents.length - 1].id;

      let deleteHasLock: () => void;
      const deleteLockAcquired = new Promise<void>((resolve) => {
        deleteHasLock = resolve;
      });

      const deletePromise = sorciTestClient.appendEvent({
        sourcingEvent: SorciEvent.create({
          type: "todo-list-deleted",
          data: {
            title: "Shopping list - User A",
            todoListId
          }
        }),
        query: {
          $where: {
            type: {
              $in: ["todo-list-created", "todo-list-deleted"],
              $skipLockOn: ["todo-list-created"]
            },
            identifiers: { todoListId: todoListId }
          }
        },
        lastKnownEventId: todoListLastId,
        _testOnlyOnLockAcquired: () => deleteHasLock()
      });

      await deleteLockAcquired;

      const renamePromise = sorciTestClient.appendEvent({
        sourcingEvent: SorciEvent.create({
          type: "todo-list-renamed",
          data: {
            title: "Shopping list - renamed",
            todoListId
          }
        }),
        query: {
          $where: {
            type: {
              $in: [
                "todo-list-created",
                "todo-list-renamed",
                "todo-list-deleted"
              ],
              $skipLockOn: ["todo-list-created"]
            },
            identifiers: { todoListId: todoListId }
          }
        },
        lastKnownEventId: todoListLastId,
        _testOnlyOnLockAcquired: () => Promise.resolve()
      });

      results = await Promise.allSettled([deletePromise, renamePromise]);
    });

    test("Then the delete operation succeeds", async () => {
      expect(results[0].status).toBe("fulfilled");
    });

    test("Then the rename operation is rejected", async () => {
      expect(results[1].status).toBe("rejected");
    });
  });

  describe("When rename operation acquires lock before delete (deterministic)", async () => {
    let results: PromiseSettledResult<string>[];

    beforeAll(async () => {
      const todoListId = createId();
      await aTodoList()
        .withId(todoListId)
        .withInitialTitle("Shopping list")
        .build();

      const itemEvents = await sorciTestClient.getEventsByQuery({
        $where: {
          type: { $eq: "todo-list-created" },
          identifiers: { todoListId: todoListId }
        }
      });
      const todoListLastId = itemEvents[itemEvents.length - 1].id;

      let renameHasLock: () => void;
      const renameLockAcquired = new Promise<void>((resolve) => {
        renameHasLock = resolve;
      });

      const renamePromise = sorciTestClient.appendEvent({
        sourcingEvent: SorciEvent.create({
          type: "todo-list-renamed",
          data: {
            title: "Shopping list - renamed",
            todoListId
          }
        }),
        query: {
          $where: {
            type: {
              $in: [
                "todo-list-created",
                "todo-list-renamed",
                "todo-list-deleted"
              ],
              $skipLockOn: ["todo-list-created"]
            },
            identifiers: { todoListId: todoListId }
          }
        },
        lastKnownEventId: todoListLastId,
        _testOnlyOnLockAcquired: () => renameHasLock()
      });

      await renameLockAcquired;

      const deletePromise = sorciTestClient.appendEvent({
        sourcingEvent: SorciEvent.create({
          type: "todo-list-deleted",
          data: {
            title: "Shopping list - User A",
            todoListId
          }
        }),
        query: {
          $where: {
            type: {
              $in: ["todo-list-created", "todo-list-deleted"],
              $skipLockOn: ["todo-list-created"]
            },
            identifiers: { todoListId: todoListId }
          }
        },
        lastKnownEventId: todoListLastId,
        _testOnlyOnLockAcquired: () => Promise.resolve()
      });

      results = await Promise.allSettled([renamePromise, deletePromise]);
    });

    test("Then the rename operation succeeds", async () => {
      expect(results[0].status).toBe("fulfilled");
    });

    test("Then the delete operation succeeds", async () => {
      expect(results[1].status).toBe("fulfilled");
    });
  });

  describe("When appending an event without query (no concurrency check)", async () => {
    const todoListId = createId();
    let eventId: string;
    let retrievedEvent: any;

    beforeAll(async () => {
      const event = SorciEvent.create({
        data: {
          title: "Simple todo list",
          todoListId
        },
        type: "todo-list-created"
      });

      eventId = await sorciTestClient.appendEvent({
        sourcingEvent: event
      });

      retrievedEvent = await sorciTestClient.getEventById(eventId);
    });

    test("Then the event id is defined", async () => {
      expect(eventId).toBeDefined();
    });

    test("Then the event has the expected type", async () => {
      expect(retrievedEvent?.type).toBe("todo-list-created");
    });

    test("Then the event has the expected data", async () => {
      expect(retrievedEvent?.data.title).toBe("Simple todo list");
    });
  });

  describe("When concurrent operations use $skipLockOn to skip overlapping types", async () => {
    let statusArray: string[];

    beforeAll(async () => {
      const todoListId = createId();

      const { events } = await aTodoList().withId(todoListId).build();
      const todoListLastId = events[events.length - 1].id;

      const concurrentPromises = [
        sorciTestClient.appendEvent({
          sourcingEvent: SorciEvent.create({
            type: "todo-list-archived",
            data: { todoListId }
          }),
          query: {
            $where: {
              type: {
                $eq: "todo-list-created",
                $skipLockOn: ["todo-list-created"]
              },
              identifiers: { todoListId: todoListId }
            }
          },
          lastKnownEventId: todoListLastId
        }),
        sorciTestClient.appendEvent({
          sourcingEvent: SorciEvent.create({
            type: "todo-list-published",
            data: { todoListId }
          }),
          query: {
            $where: {
              type: {
                $eq: "todo-list-created",
                $skipLockOn: ["todo-list-created"]
              },
              identifiers: { todoListId: todoListId }
            }
          },
          lastKnownEventId: todoListLastId
        })
      ];

      const results = await Promise.allSettled(concurrentPromises);
      statusArray = results.map((result) => result.status);
    });

    test("Then both operations succeed", async () => {
      expect(statusArray).toEqual(["fulfilled", "fulfilled"]);
    });
  });

  describe("When using $in with partial $skipLockOn", async () => {
    const todoListId = createId();
    let returnedLocks: any[];

    beforeAll(async () => {
      buildAdvisoryLocksSpy.mockClear();

      const { events } = await aTodoList().withId(todoListId).build();
      const todoListLastId = events[events.length - 1].id;

      await sorciTestClient.appendEvent({
        sourcingEvent: SorciEvent.create({
          type: "todo-list-deleted",
          data: { todoListId }
        }),
        query: {
          $where: {
            type: {
              $in: ["todo-list-created", "todo-list-deleted"],
              $skipLockOn: ["todo-list-created"]
            },
            identifiers: { todoListId: todoListId }
          }
        },
        lastKnownEventId: todoListLastId
      });

      returnedLocks = buildAdvisoryLocksSpy.mock.results[0].value;
    });

    test("Then the advisory lock builder is called once", async () => {
      expect(buildAdvisoryLocksSpy).toHaveBeenCalledTimes(1);
    });

    test("Then only one lock is created", async () => {
      expect(returnedLocks).toHaveLength(1);
    });

    test("Then the lock is for the non-skipped type", async () => {
      expect(returnedLocks[0]).toEqual({
        key: `todoListId:${todoListId}:todo-list-deleted`,
        hash: expect.any(Number)
      });
    });
  });

  describe("When every event type is skipped with $skipLockOn", async () => {
    let returnedLocks: any[];

    beforeAll(async () => {
      buildAdvisoryLocksSpy.mockClear();
      const todoListId = createId();

      const { events } = await aTodoList().withId(todoListId).build();
      const todoListLastId = events[events.length - 1].id;

      await sorciTestClient.appendEvent({
        sourcingEvent: SorciEvent.create({
          type: "todo-list-renamed",
          data: { title: "New title", todoListId }
        }),
        query: {
          $where: {
            type: {
              $in: ["todo-list-created", "todo-list-deleted"],
              $skipLockOn: ["todo-list-created", "todo-list-deleted"]
            },
            identifiers: { todoListId: todoListId }
          }
        },
        lastKnownEventId: todoListLastId
      });

      returnedLocks = buildAdvisoryLocksSpy.mock.results[0].value;
    });

    test("Then the advisory lock builder is called once", async () => {
      expect(buildAdvisoryLocksSpy).toHaveBeenCalledTimes(1);
    });

    test("Then no locks are created", async () => {
      expect(returnedLocks).toHaveLength(0);
    });
  });

  describe("When using default behavior without $skipLockOn", async () => {
    const todoListId = createId();
    let returnedLocks: any[];

    beforeAll(async () => {
      buildAdvisoryLocksSpy.mockClear();

      const { events } = await aTodoList().withId(todoListId).build();
      const todoListLastId = events[events.length - 1].id;

      await sorciTestClient.appendEvent({
        sourcingEvent: SorciEvent.create({
          type: "todo-list-deleted",
          data: { todoListId }
        }),
        query: {
          $where: {
            type: { $in: ["todo-list-created", "todo-list-deleted"] },
            identifiers: { todoListId: todoListId }
          }
        },
        lastKnownEventId: todoListLastId
      });

      returnedLocks = buildAdvisoryLocksSpy.mock.results[0].value;
    });

    test("Then the advisory lock builder is called once", async () => {
      expect(buildAdvisoryLocksSpy).toHaveBeenCalledTimes(1);
    });

    test("Then locks are created for all types", async () => {
      expect(returnedLocks).toHaveLength(2);
    });

    test("Then the first lock is for the created type", async () => {
      expect(returnedLocks[0]).toEqual({
        key: `todoListId:${todoListId}:todo-list-created`,
        hash: expect.any(Number)
      });
    });

    test("Then the second lock is for the deleted type", async () => {
      expect(returnedLocks[1]).toEqual({
        key: `todoListId:${todoListId}:todo-list-deleted`,
        hash: expect.any(Number)
      });
    });
  });
});
