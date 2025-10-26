describe("Test on todo list item", async () => {
  test("Create a todo list item from a customized todo list", async () => {
    const { events } = await aTodoListItem()
      .from(aTodoList().withInitialTitle("Morning routine"))
      .build();

    const todoListItemId = events[0].data.todoListItemId;
    expect(todoListItemId).toBeUlid();
  });
  test("Create a simple todo list item", async () => {
    const { todoListItemBuilder: todoListItem } = await aTodoListItem().build();

    const todoListItemEvents = await sorciTestClient.getEventsByQuery({
      $where: {
        identifiers: { todoListItemId: todoListItem.aggregateId }
      }
    });

    const todoListEvents = await sorciTestClient.getEventsByQuery({
      $where: {
        identifiers: { todoListId: todoListItem.todoListId }
      }
    });

    expect(todoListItemEvents).toHaveLength(1);
    expect(todoListEvents).toHaveLength(2);
  });
});
