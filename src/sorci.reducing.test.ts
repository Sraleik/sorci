import { describe, test, expect, beforeAll } from "vitest";
import { getAggregateByQueryFactory } from "./sorci.reducing";
import { createId } from "./common/utils";

type TodoListEventMap = {
  "todo-list-created": {
    todoListId: string;
    title: string;
    createdBy: {
      userId: string;
    };
  };
  "todo-list-renamed": {
    todoListId: string;
    title: string;
  };
  "todo-list-deleted": {
    isDeleted: boolean;
  };
};

describe("Given a getAggregateByQueryFactory", () => {
  let getAggregate: ReturnType<
    typeof getAggregateByQueryFactory<TodoListEventMap>
  >;
  const todoListId = createId();
  describe("When building an aggregate from todo list events", () => {
    beforeAll(async () => {
      await aTodoList()
        .withId(todoListId)
        .withInitialTitle("My Tasks")
        .renamed({ name: "Important Tasks" })
        .deleted()
        .build();

      getAggregate = getAggregateByQueryFactory<TodoListEventMap>((query) =>
        sorciTestClient.getEventsByQuery(query)
      );
    });

    test("Then the result contains a state property", async () => {
      const query = {
        $where: {
          type: { $in: ["todo-list-created", "todo-list-deleted"] },
          identifiers: {
            todoListId
          }
        }
      } as const;

      const { state } = await getAggregate(query, (state, event) => {
        switch (event.type) {
          case "todo-list-created":
            return { ...state, ...event.data };
          case "todo-list-renamed":
            return { ...state, title: event.data.title };
          case "todo-list-deleted":
            return { ...state, isDeleted: true };
          default:
            return state;
        }
      });

      expect(state).toBeDefined();
    });
  });
});
