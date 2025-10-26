import { describe, expect, it, beforeAll } from "vitest";
import { buildAdvisoryLocks, hashString } from "./sorci.postgres";
import { Query } from "./sorci.interface";

describe("Given buildAdvisoryLocks function", () => {
  describe("When building locks for a simple query with one identifier", () => {
    let locks: { key: string; hash: number }[];

    beforeAll(() => {
      const query: Query = {
        $where: {
          type: "TodoItemAdded",
          identifiers: {
            todoListId: "list-123"
          }
        }
      };

      locks = buildAdvisoryLocks({ query });
    });

    it("Then one lock is created", () => {
      expect(locks).toHaveLength(1);
    });

    it("Then the lock key includes identifier and type", () => {
      expect(locks[0].key).toBe("todoListId:list-123:TodoItemAdded");
    });

    it("Then the lock hash matches the expected hash", () => {
      expect(locks[0].hash).toBe(
        hashString("todoListId:list-123:TodoItemAdded")
      );
    });
  });

  describe("When skipping lock on all identifiers", () => {
    let locks: { key: string; hash: number }[];

    beforeAll(() => {
      const query: Query = {
        $where: {
          type: "TodoListCreated",
          identifiers: {
            todoListId: "list-123",
            $skipLockOn: ["todoListId"]
          }
        }
      };

      locks = buildAdvisoryLocks({ query });
    });

    it("Then one lock is created", () => {
      expect(locks).toHaveLength(1);
    });

    it("Then the lock key contains only the type", () => {
      expect(locks[0].key).toBe("TodoListCreated");
    });
  });

  describe("When skipping lock on some identifiers but not all", () => {
    let locks: { key: string; hash: number }[];

    beforeAll(() => {
      const query: Query = {
        $where: {
          type: "TodoListCreated",
          identifiers: {
            todoListId: "list-123",
            companyId: "company-123",
            $skipLockOn: ["todoListId"]
          }
        }
      };

      locks = buildAdvisoryLocks({ query });
    });

    it("Then one lock is created", () => {
      expect(locks).toHaveLength(1);
    });

    it("Then the lock key includes only non-skipped identifiers", () => {
      expect(locks[0].key).toBe("companyId:company-123:TodoListCreated");
    });
  });

  describe("When using $in with multiple types and skipping some identifiers", () => {
    let locks: { key: string; hash: number }[];

    beforeAll(() => {
      const query: Query = {
        $where: {
          type: {
            $in: ["TodoListCreated", "TodoListRenamed", "TodoListDeleted"]
          },
          identifiers: {
            todoListId: "list-123",
            companyId: "company-123",
            $skipLockOn: ["todoListId"]
          }
        }
      };

      locks = buildAdvisoryLocks({ query });
    });

    it("Then three locks are created (one per type)", () => {
      expect(locks).toHaveLength(3);
    });

    it("Then all locks include non-skipped identifiers and types", () => {
      expect(locks).toEqual([
        {
          key: "companyId:company-123:TodoListCreated",
          hash: expect.any(Number)
        },
        {
          key: "companyId:company-123:TodoListDeleted",
          hash: expect.any(Number)
        },
        {
          key: "companyId:company-123:TodoListRenamed",
          hash: expect.any(Number)
        }
      ]);
    });
  });

  describe("When skipping locks on both some identifiers and some types", () => {
    let locks: { key: string; hash: number }[];

    beforeAll(() => {
      const query: Query = {
        $where: {
          type: {
            $in: ["TodoListCreated", "TodoListRenamed", "TodoListDeleted"],
            $skipLockOn: ["TodoListCreated"]
          },
          identifiers: {
            todoListId: "list-123",
            companyId: "company-123",
            $skipLockOn: ["todoListId"]
          }
        }
      };

      locks = buildAdvisoryLocks({ query });
    });

    it("Then two locks are created (only for non-skipped types)", () => {
      expect(locks).toHaveLength(2);
    });

    it("Then locks are created only for non-skipped types and identifiers", () => {
      expect(locks).toEqual([
        {
          key: "companyId:company-123:TodoListDeleted",
          hash: expect.any(Number)
        },
        {
          key: "companyId:company-123:TodoListRenamed",
          hash: expect.any(Number)
        }
      ]);
    });
  });

  describe("When building locks with multiple types and partial identifier skip", () => {
    let locks: { key: string; hash: number }[];

    beforeAll(() => {
      const query: Query = {
        $where: {
          type: {
            $in: ["TodoListCreated", "TodoListRenamed", "TodoListDeleted"]
          },
          identifiers: {
            todoListId: "list-123",
            companyId: "company-123",
            $skipLockOn: ["todoListId"]
          }
        }
      };

      locks = buildAdvisoryLocks({ query });
    });

    it("Then three locks are created", () => {
      expect(locks).toHaveLength(3);
    });

    it("Then each lock uses the non-skipped identifier", () => {
      expect(locks).toEqual([
        {
          key: "companyId:company-123:TodoListCreated",
          hash: expect.any(Number)
        },
        {
          key: "companyId:company-123:TodoListDeleted",
          hash: expect.any(Number)
        },
        {
          key: "companyId:company-123:TodoListRenamed",
          hash: expect.any(Number)
        }
      ]);
    });
  });

  describe("When building locks with identifiers not ending in Id", () => {
    let locks: { key: string; hash: number }[];

    beforeAll(() => {
      const query: Query = {
        $where: {
          type: "JobOfferFileAdded",
          identifiers: {
            jobOfferId: "offer-123",
            fileHash: "file-456"
          }
        }
      };

      locks = buildAdvisoryLocks({ query });
    });

    it("Then one lock is created", () => {
      expect(locks).toHaveLength(1);
    });

    it("Then the lock key includes all identifiers", () => {
      expect(locks[0].key).toBe(
        "fileHash:file-456:jobOfferId:offer-123:JobOfferFileAdded"
      );
    });

    it("Then the lock hash matches the expected hash", () => {
      expect(locks[0].hash).toBe(
        hashString("fileHash:file-456:jobOfferId:offer-123:JobOfferFileAdded")
      );
    });
  });

  describe("When building locks for multiple event types using $in", () => {
    let locks: { key: string; hash: number }[];

    beforeAll(() => {
      const query: Query = {
        $where: {
          type: {
            $in: ["TodoItemAdded", "TodoItemRemoved"]
          },
          identifiers: {
            todoListId: "list-123"
          }
        }
      };

      locks = buildAdvisoryLocks({ query });
    });

    it("Then two locks are created (one per type)", () => {
      expect(locks).toHaveLength(2);
    });

    it("Then each lock combines identifier with its type", () => {
      expect(locks.map((lock) => lock.key)).toEqual([
        "todoListId:list-123:TodoItemAdded",
        "todoListId:list-123:TodoItemRemoved"
      ]);
    });
  });

  describe("When building locks for multiple identifiers", () => {
    let locks: { key: string; hash: number }[];

    beforeAll(() => {
      const query: Query = {
        $where: {
          identifiers: {
            todoListId: "list-123",
            userId: "user-456"
          },
          type: "TodoItemAdded"
        }
      };

      locks = buildAdvisoryLocks({ query });
    });

    it("Then one lock is created", () => {
      expect(locks).toHaveLength(1);
    });

    it("Then the lock key includes all identifiers and type", () => {
      expect(locks[0].key).toBe(
        "todoListId:list-123:userId:user-456:TodoItemAdded"
      );
    });
  });

  describe("When building locks for multiple identifiers with multiple event types", () => {
    let locks: { key: string; hash: number }[];

    beforeAll(() => {
      const query: Query = {
        $where: {
          identifiers: {
            todoListId: "list-123",
            userId: "user-456"
          },
          type: { $in: ["TodoItemAdded", "TodoItemRemoved"] }
        }
      };

      locks = buildAdvisoryLocks({ query });
    });

    it("Then two locks are created", () => {
      expect(locks).toHaveLength(2);
    });

    it("Then each lock combines all identifiers with each type", () => {
      expect(locks.map((lock) => lock.key)).toEqual([
        "todoListId:list-123:userId:user-456:TodoItemAdded",
        "todoListId:list-123:userId:user-456:TodoItemRemoved"
      ]);
    });
  });

  describe("When using a query with unrelated identifiers and types (suboptimal)", () => {
    let locks: { key: string; hash: number }[];

    beforeAll(() => {
      const query: Query = {
        $where: {
          identifiers: {
            todoListId: "list-123",
            companyId: "company-456"
          },
          type: { $in: ["ListCreated", "ListDeleted", "CompanyDeleted"] }
        }
      };

      locks = buildAdvisoryLocks({ query });
    });

    it("Then three locks are created", () => {
      expect(locks).toHaveLength(3);
    });

    it("Then all locks include all identifiers regardless of relevance", () => {
      expect(locks.map((lock) => lock.key)).toEqual([
        "companyId:company-456:todoListId:list-123:CompanyDeleted",
        "companyId:company-456:todoListId:list-123:ListCreated",
        "companyId:company-456:todoListId:list-123:ListDeleted"
      ]);
    });
  });

  describe("When using $or to properly scope identifiers per type (optimal)", () => {
    let locks: { key: string; hash: number }[];

    beforeAll(() => {
      const query: Query = {
        $where: {
          $or: [
            {
              identifiers: {
                todoListId: "list-123",
                companyId: "company-456"
              },
              type: { $in: ["ListCreated", "ListDeleted"] }
            },
            {
              identifiers: {
                companyId: "company-456"
              },
              type: { $in: ["CompanyDeleted"] }
            }
          ]
        }
      };

      locks = buildAdvisoryLocks({ query });
    });

    it("Then three locks are created", () => {
      expect(locks).toHaveLength(3);
    });

    it("Then each lock uses only relevant identifiers for its type", () => {
      expect(locks.map((lock) => lock.key)).toEqual([
        "companyId:company-456:CompanyDeleted",
        "companyId:company-456:todoListId:list-123:ListCreated",
        "companyId:company-456:todoListId:list-123:ListDeleted"
      ]);
    });
  });

  describe("When building locks with identifiers in non-alphabetical order", () => {
    let locks: { key: string; hash: number }[];

    beforeAll(() => {
      const query: Query = {
        $where: {
          identifiers: {
            zKey: "z-value",
            aKey: "a-value"
          },
          type: "EventZ"
        }
      };

      locks = buildAdvisoryLocks({ query });
    });

    it("Then one lock is created", () => {
      expect(locks).toHaveLength(1);
    });

    it("Then identifiers are sorted alphabetically in the lock key", () => {
      expect(locks[0].key).toBe("aKey:a-value:zKey:z-value:EventZ");
    });
  });

  describe("When skipping all event types", () => {
    let locks: { key: string; hash: number }[];

    beforeAll(() => {
      const query: Query = {
        $where: {
          identifiers: {
            todoListId: "list-123",
            companyId: "company-123"
          },
          type: {
            $in: ["TodoItemAdded", "TodoItemDeleted"],
            $skipLockOn: ["TodoItemAdded", "TodoItemDeleted"]
          }
        }
      };

      locks = buildAdvisoryLocks({ query });
    });

    it("Then no locks are created", () => {
      expect(locks).toHaveLength(0);
    });
  });

  describe("When skipping all identifiers but not types", () => {
    let locks: { key: string; hash: number }[];

    beforeAll(() => {
      const query: Query = {
        $where: {
          identifiers: {
            todoListId: "list-123",
            companyId: "company-123",
            $skipLockOn: ["todoListId", "companyId"]
          },
          type: {
            $in: ["TodoItemAdded", "TodoItemDeleted"]
          }
        }
      };

      locks = buildAdvisoryLocks({ query });
    });

    it("Then locks are still created for types", () => {
      expect(locks).toHaveLength(2);
    });
  });

  describe("When query contains duplicate event types", () => {
    let locks: { key: string; hash: number }[];

    beforeAll(() => {
      const query: Query = {
        $where: {
          identifiers: {
            todoListId: "list-123"
          },
          type: { $in: ["TodoItemAdded", "TodoItemAdded"] }
        }
      };

      locks = buildAdvisoryLocks({ query });
    });

    it("Then only one lock is created (deduplication)", () => {
      expect(locks).toHaveLength(1);
    });

    it("Then the lock key is correct", () => {
      expect(locks[0].key).toBe("todoListId:list-123:TodoItemAdded");
    });
  });

  describe("When query has only identifiers without type", () => {
    let locks: { key: string; hash: number }[];

    beforeAll(() => {
      const query: Query = {
        $where: {
          identifiers: {
            todoListId: "list-123"
          }
        }
      };

      locks = buildAdvisoryLocks({ query });
    });

    it.skip("Then one lock is created for identifiers only", () => {
      expect(locks).toHaveLength(1);
    });

    it.skip("Then the lock key contains only identifiers", () => {
      expect(locks[0].key).toBe("todoListId:list-123");
    });
  });

  describe("When using $or with top-level identifiers", () => {
    let locks: { key: string; hash: number }[];

    beforeAll(() => {
      const query: Query = {
        $where: {
          identifiers: {
            todoListId: "list-123"
          },
          $or: [
            {
              type: "TodoItemAdded"
            },
            {
              type: "TodoItemRemoved"
            }
          ]
        }
      };

      locks = buildAdvisoryLocks({ query });
    });

    it("Then two locks are created", () => {
      expect(locks).toHaveLength(2);
    });

    it("Then top-level identifiers are applied to all types in $or", () => {
      expect(locks.map((lock) => lock.key)).toEqual([
        "todoListId:list-123:TodoItemAdded",
        "todoListId:list-123:TodoItemRemoved"
      ]);
    });
  });
});

describe("Given hashString function", () => {
  describe("When hashing a string", () => {
    let hash: number;

    beforeAll(() => {
      hash = hashString("test-string");
    });

    it("Then a positive number is returned", () => {
      expect(hash).toBeGreaterThanOrEqual(0);
    });
  });

  describe("When hashing the same input multiple times", () => {
    const input = "todoListId:list-123:TodoItemAdded";
    let hash1: number;
    let hash2: number;

    beforeAll(() => {
      hash1 = hashString(input);
      hash2 = hashString(input);
    });

    it("Then consistent hashes are produced", () => {
      expect(hash1).toBe(hash2);
    });
  });

  describe("When hashing different inputs", () => {
    let hash1: number;
    let hash2: number;

    beforeAll(() => {
      hash1 = hashString("string1");
      hash2 = hashString("string2");
    });

    it("Then different hashes are produced", () => {
      expect(hash1).not.toBe(hash2);
    });
  });
});
