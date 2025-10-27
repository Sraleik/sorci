import { createId } from "../common/utils";
import { PersistedEvent } from "../sorci.interface";

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

  describe("When creating a user with custom email, name and id", async () => {
    const customUserId = createId();
    const customUserEmail = "john.doe@example.com";
    const customUserName = "John Doe";
    let events: PersistedEvent[];
    let createdEvent: PersistedEvent;

    beforeAll(async () => {
      const result = await aUser()
        .withInitialEmail(customUserEmail)
        .withInitialName(customUserName)
        .withId(customUserId)
        .build();
      events = result.events;
      createdEvent = events[0];
    });

    test("Then the user has the custom id", async () => {
      const userPersistedId = createdEvent.identifier.userId;
      expect(userPersistedId).toEqual(customUserId);
    });

    test("Then the user has the custom email", async () => {
      const userPersistedEmail = createdEvent.data.email;
      expect(userPersistedEmail).toEqual(customUserEmail);
    });

    test("Then the user has the custom name", async () => {
      const userPersistedName = createdEvent.data.name;
      expect(userPersistedName).toEqual(customUserName);
    });

    test("Then a single event is created", async () => {
      expect(events).toHaveLength(1);
    });
  });

  describe("When changing user email", async () => {
    let events: PersistedEvent[];
    let userEmail: string | undefined;

    beforeAll(async () => {
      const result = await aUser()
        .withInitialEmail("john.doe@example.com")
        .emailChanged({ email: "john.newemail@example.com" })
        .build();
      events = result.events;
      userEmail = [...events].reverse().find((event) => event.data.email)
        ?.data.email;
    });

    test("Then two events are created", async () => {
      expect(events).toHaveLength(2);
    });

    test("Then the user has the new email", async () => {
      expect(userEmail).toEqual("john.newemail@example.com");
    });
  });

  describe("When renaming a user", async () => {
    let events: PersistedEvent[];
    let userName: string | undefined;

    beforeAll(async () => {
      const result = await aUser()
        .withInitialName("John Doe")
        .renamed({ name: "Jane Doe" })
        .build();
      events = result.events;
      userName = [...events].reverse().find((event) => event.data.name)
        ?.data.name;
    });

    test("Then two events are created", async () => {
      expect(events).toHaveLength(2);
    });

    test("Then the user has the new name", async () => {
      expect(userName).toEqual("Jane Doe");
    });
  });

  describe("When deleting a user after multiple changes", async () => {
    let events: PersistedEvent[];
    let userName: string | undefined;
    let userEmail: string | undefined;

    beforeAll(async () => {
      const result = await aUser()
        .withInitialEmail("john.doe@example.com")
        .withInitialName("John Doe")
        .renamed({ name: "Jane Doe" })
        .emailChanged({ email: "jane.doe@example.com" })
        .deleted()
        .build();
      events = result.events;
      const reversedEvents = [...events].reverse();
      userName = reversedEvents.find((event) => event.data.name)?.data.name;
      userEmail = reversedEvents.find((event) => event.data.email)?.data.email;
    });

    test("Then four events are created", async () => {
      expect(events).toHaveLength(4);
    });

    test("Then the user has the final name", async () => {
      expect(userName).toEqual("Jane Doe");
    });

    test("Then the user has the final email", async () => {
      expect(userEmail).toEqual("jane.doe@example.com");
    });
  });

  describe("When applying multiple changes to a user", async () => {
    let events: PersistedEvent[];
    let userName: string | undefined;
    let userEmail: string | undefined;

    beforeAll(async () => {
      const result = await aUser()
        .withInitialEmail("initial@example.com")
        .withInitialName("Initial Name")
        .emailChanged({ email: "second@example.com" })
        .renamed({ name: "Second Name" })
        .emailChanged({ email: "third@example.com" })
        .renamed({ name: "Third Name" })
        .build();
      events = result.events;
      const reversedEvents = [...events].reverse();
      userName = reversedEvents.find((event) => event.data.name)?.data.name;
      userEmail = reversedEvents.find((event) => event.data.email)?.data.email;
    });

    test("Then five events are created", async () => {
      expect(events).toHaveLength(5);
    });

    test("Then the user has the final name", async () => {
      expect(userName).toEqual("Third Name");
    });

    test("Then the user has the final email", async () => {
      expect(userEmail).toEqual("third@example.com");
    });
  });

  describe("When assigning a user to a company", async () => {
    let userEvents: PersistedEvent[];
    let companyEvents: PersistedEvent[];
    let companyId: string | undefined;

    beforeAll(async () => {
      const { events } = await aUser()
        .withInitialEmail("john.doe@example.com")
        .withInitialName("John Doe")
        .with(aCompany())
        .build();
      userEvents = events;
      companyId = events[1].data.companyId;

      companyEvents = await sorciTestClient.getEventsByQuery({
        $where: {
          identifiers: { companyId }
        }
      });
    });

    test("Then the user is assigned to the company", async () => {
      expect(companyId).toBeUlid();
      expect(companyEvents.length).toBeGreaterThanOrEqual(2);
      expect(userEvents.length).toBeGreaterThanOrEqual(2);
    });
  });
});
