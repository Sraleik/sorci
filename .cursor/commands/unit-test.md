Can you create a unit test following this guideline:

Given When Then pattern

```typescript
describe("Given a User Builder", async () => {
  describe("When building a simple user", async () => {
    let events: PersistedEvent[];
    let userId: string;

    beforeAll(async () => {
      const result = await aUser().build();
      events = result.events;
      userId = events[0].data.userId;
    });

    test("Then the user is created with a ulid id", async () => {
      expect(userId).toBeUlid();
    });

    test("Then a single event is created", async () => {
      expect(events).toHaveLength(1);
    });
  });
});
```
