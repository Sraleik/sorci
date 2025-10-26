import { describe, expect, it } from "vitest";
import { buildAdvisoryLocks, hashString } from "./sorci.postgres";
import { Query } from "./sorci.interface";

describe("buildAdvisoryLocks", () => {
  it("should build locks for a simple query with one identifier", () => {
    const query: Query = {
      $where: {
        type: "TodoItemAdded",
        identifiers: {
          todoListId: "list-123"
        }
      }
    };

    const locks = buildAdvisoryLocks({ query });

    expect(locks).toHaveLength(1);
    expect(locks[0].key).toBe("todoListId:list-123:TodoItemAdded");
    expect(locks[0].hash).toBe(hashString("todoListId:list-123:TodoItemAdded"));
  });

  it("should lock on type only not identifiers", () => {
    const query: Query = {
      $where: {
        type: "TodoListCreated",
        identifiers: {
          todoListId: "list-123",
          $skipLockOn: ["todoListId"]
        }
      }
    };

    const locks = buildAdvisoryLocks({ query });

    expect(locks).toHaveLength(1);
    expect(locks[0].key).toBe("TodoListCreated");
  });

  it("should lock on type and identifiers not skipping lock on companyId", () => {
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

    const locks = buildAdvisoryLocks({ query });

    expect(locks).toHaveLength(1);
    expect(locks[0].key).toBe("companyId:company-123:TodoListCreated");
  });

  it("should lock on type only not identifiers", () => {
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

    const locks = buildAdvisoryLocks({ query });

    expect(locks).toHaveLength(3);
    expect(locks).toEqual([
      {
        key: "companyId:company-123:TodoListCreated",
        hash: expect.any(Number)
      },
      {
        key: "companyId:company-123:TodoListDeleted",
        hash: expect.any(Number)
      },
      { key: "companyId:company-123:TodoListRenamed", hash: expect.any(Number) }
    ]);
  });

  // This one doesn't realy make sense (I don't have a use case for it) but it's here to test the behavior
  it("should lock on type only not identifiers skipping lock on TodoListCreated and TodoListDeleted", () => {
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

    const locks = buildAdvisoryLocks({ query });

    expect(locks).toHaveLength(2);
    expect(locks).toEqual([
      {
        key: "companyId:company-123:TodoListDeleted",
        hash: expect.any(Number)
      },
      { key: "companyId:company-123:TodoListRenamed", hash: expect.any(Number) }
    ]);
  });

  it("should lock on type and identifiers skipping lock on todoListId", () => {
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

    const locks = buildAdvisoryLocks({ query });

    expect(locks).toHaveLength(3);
    expect(locks).toEqual([
      {
        key: "companyId:company-123:TodoListCreated",
        hash: expect.any(Number)
      },
      {
        key: "companyId:company-123:TodoListDeleted",
        hash: expect.any(Number)
      },
      { key: "companyId:company-123:TodoListRenamed", hash: expect.any(Number) }
    ]);
  });

  it("should build locks for a simple query with one identifier not ending in Id", () => {
    const query: Query = {
      $where: {
        type: "JobOfferFileAdded",
        identifiers: {
          jobOfferId: "offer-123",
          fileHash: "file-456"
        }
      }
    };

    const locks = buildAdvisoryLocks({ query });

    expect(locks).toHaveLength(1);
    expect(locks[0].key).toBe(
      "fileHash:file-456:jobOfferId:offer-123:JobOfferFileAdded"
    );
    expect(locks[0].hash).toBe(
      hashString("fileHash:file-456:jobOfferId:offer-123:JobOfferFileAdded")
    );
  });

  it("should build locks for a query with multiple event types using $in", () => {
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

    const locks = buildAdvisoryLocks({ query });

    expect(locks).toHaveLength(2);
    expect(locks.map((lock) => lock.key)).toEqual([
      "todoListId:list-123:TodoItemAdded",
      "todoListId:list-123:TodoItemRemoved"
    ]);
  });

  it("should build locks for multiple identifiers", () => {
    const query: Query = {
      $where: {
        identifiers: {
          todoListId: "list-123",
          userId: "user-456"
        },
        type: "TodoItemAdded"
      }
    };

    const locks = buildAdvisoryLocks({ query });

    expect(locks).toHaveLength(1);
    expect(locks[0].key).toBe(
      "todoListId:list-123:userId:user-456:TodoItemAdded"
    );
  });

  it("should build locks for multiple identifiers with multiple event types", () => {
    const query: Query = {
      $where: {
        identifiers: {
          todoListId: "list-123",
          userId: "user-456"
        },
        type: { $in: ["TodoItemAdded", "TodoItemRemoved"] }
      }
    };

    const locks = buildAdvisoryLocks({ query });

    expect(locks).toHaveLength(2);
    expect(locks.map((lock) => lock.key)).toEqual([
      "todoListId:list-123:userId:user-456:TodoItemAdded",
      "todoListId:list-123:userId:user-456:TodoItemRemoved"
    ]);
  });

  it("should build locks for multiple identifiers and event types (dumb query)", () => {
    //This is how it should behave but this query is not right, the next test is doing the right way of doing it
    const query: Query = {
      $where: {
        identifiers: {
          todoListId: "list-123",
          companyId: "company-456"
        },
        type: { $in: ["ListCreated", "ListDeleted", "CompanyDeleted"] }
      }
    };

    const locks = buildAdvisoryLocks({ query });

    expect(locks).toHaveLength(3);
    expect(locks.map((lock) => lock.key)).toEqual([
      "companyId:company-456:todoListId:list-123:CompanyDeleted",
      "companyId:company-456:todoListId:list-123:ListCreated",
      "companyId:company-456:todoListId:list-123:ListDeleted"
    ]);
  });

  it("should build locks for multiple identifiers and event types (smart query)", () => {
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

    const locks = buildAdvisoryLocks({ query });

    expect(locks).toHaveLength(3);
    expect(locks.map((lock) => lock.key)).toEqual([
      "companyId:company-456:CompanyDeleted",
      "companyId:company-456:todoListId:list-123:ListCreated",
      "companyId:company-456:todoListId:list-123:ListDeleted"
    ]);
  });

  it("should sort locks alphabetically by key", () => {
    const query: Query = {
      $where: {
        identifiers: {
          zKey: "z-value",
          aKey: "a-value"
        },
        type: "EventZ"
      }
    };

    const locks = buildAdvisoryLocks({ query });

    expect(locks).toHaveLength(1);
    expect(locks[0].key).toBe("aKey:a-value:zKey:z-value:EventZ");
  });

  it("should return no locks when skipping all event types", () => {
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

    const locks = buildAdvisoryLocks({ query });

    expect(locks).toHaveLength(0);
  });

  it("should return no locks when skipping all identifiers", () => {
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

    const locks = buildAdvisoryLocks({ query });

    expect(locks).toHaveLength(2);
  });

  it("should deduplicate event types", () => {
    const query: Query = {
      $where: {
        identifiers: {
          todoListId: "list-123"
        },
        type: { $in: ["TodoItemAdded", "TodoItemAdded"] }
      }
    };

    const locks = buildAdvisoryLocks({ query });

    expect(locks).toHaveLength(1);
    expect(locks[0].key).toBe("todoListId:list-123:TodoItemAdded");
  });

  //TODO: Fix Maybe, be not, sur this is a good lock
  it.skip("should create lock for top level identifiers only", () => {
    const query: Query = {
      $where: {
        identifiers: {
          todoListId: "list-123"
        }
      }
    };

    const locks = buildAdvisoryLocks({ query });

    expect(locks).toHaveLength(1);
    expect(locks[0].key).toBe("todoListId:list-123");
  });

  //Maybe not allow identifier with top lever $or / $and ?
  it("should handle $or queries with multiple event types and top-level identifiers", () => {
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

    const locks = buildAdvisoryLocks({ query });

    expect(locks).toHaveLength(2);
    expect(locks.map((lock) => lock.key)).toEqual([
      "todoListId:list-123:TodoItemAdded",
      "todoListId:list-123:TodoItemRemoved"
    ]);
  });
});

describe("hashString", () => {
  it("should return a positive number", () => {
    const hash = hashString("test-string");
    expect(hash).toBeGreaterThanOrEqual(0);
  });

  it("should return consistent hash for same input", () => {
    const input = "todoListId:list-123:TodoItemAdded";
    const hash1 = hashString(input);
    const hash2 = hashString(input);
    expect(hash1).toBe(hash2);
  });

  it("should return different hashes for different inputs", () => {
    const hash1 = hashString("string1");
    const hash2 = hashString("string2");
    expect(hash1).not.toBe(hash2);
  });
});
