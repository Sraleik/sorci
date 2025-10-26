import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer
} from "@testcontainers/postgresql";
import { createId } from "../common/utils";
import { Sorci } from "../sorci.interface";
import { SorciPostgres } from "../sorci.postgres";
import { UserBuilder } from "./user.builder";

let pgInstance: StartedPostgreSqlContainer;
let sorci: Sorci;

let aUser: () => UserBuilder;

beforeAll(async () => {
  const pgInstanceNotReady = new PostgreSqlContainer("postgres:15.3-alpine");
  pgInstance = await pgInstanceNotReady.start();
  const host = pgInstance.getHost();
  const port = pgInstance.getPort();
  const user = pgInstance.getUsername();
  const password = pgInstance.getPassword();
  const databaseName = pgInstance.getDatabase();

  sorci = new SorciPostgres({
    host,
    port,
    user,
    password,
    databaseName,
    streamName: "useless_stream_name"
  });

  aUser = () => new UserBuilder({ sorci });
}, 30000);

beforeEach(async () => {
  await sorci.setupTestStream();
});

afterEach(async () => {
  await sorci.dropCurrentStream();
});

afterAll(async () => {
  await sorci.close();
  await new Promise((resolve) => setTimeout(resolve, 100));
  await pgInstance.stop();
});

describe("Test on user", async () => {
  test("Create a simple user", async () => {
    const { events } = await aUser().build();
    const userId = events[0].data.userId;

    expect(userId).toBeUlid();
    expect(events).toHaveLength(1);
  });

  test("Create a user with a custom email, name and id", async () => {
    const userId = createId();
    const userEmail = "john.doe@example.com";
    const userName = "John Doe";
    const { events } = await aUser()
      .withInitialEmail(userEmail)
      .withInitialName(userName)
      .withId(userId)
      .build();

    const createdEvent = events[0];
    const userPersistedEmail = createdEvent.data.email;
    const userPersistedName = createdEvent.data.name;
    const userPersistedId = createdEvent.identifier.userId;

    expect(userPersistedId).toEqual(userId);
    expect(userPersistedEmail).toEqual(userEmail);
    expect(userPersistedName).toEqual(userName);
    expect(events).toHaveLength(1);
  });

  test("Change user email", async () => {
    const { events } = await aUser()
      .withInitialEmail("john.doe@example.com")
      .emailChanged("john.newemail@example.com")
      .build();

    const userEmail = events.reverse().find((event) => event.data.email)
      ?.data.email;

    expect(events).toHaveLength(2);
    expect(userEmail).toEqual("john.newemail@example.com");
  });

  test("Rename a user", async () => {
    const { events } = await aUser()
      .withInitialName("John Doe")
      .renamed("Jane Doe")
      .build();

    const userName = events.reverse().find((event) => event.data.name)
      ?.data.name;

    expect(events).toHaveLength(2);
    expect(userName).toEqual("Jane Doe");
  });

  test("Delete a user", async () => {
    const { events } = await aUser()
      .withInitialEmail("john.doe@example.com")
      .withInitialName("John Doe")
      .renamed("Jane Doe")
      .emailChanged("jane.doe@example.com")
      .deleted()
      .build();

    const reversedEvents = [...events].reverse();

    const userName = reversedEvents.find((event) => event.data.name)?.data.name;
    const userEmail = reversedEvents.find((event) => event.data.email)?.data
      .email;

    expect(events).toHaveLength(4);
    expect(userName).toEqual("Jane Doe");
    expect(userEmail).toEqual("jane.doe@example.com");
  });

  test("User with multiple changes", async () => {
    const { events } = await aUser()
      .withInitialEmail("initial@example.com")
      .withInitialName("Initial Name")
      .emailChanged("second@example.com")
      .renamed("Second Name")
      .emailChanged("third@example.com")
      .renamed("Third Name")
      .build();

    const reversedEvents = [...events].reverse();

    const userName = reversedEvents.find((event) => event.data.name)?.data.name;
    const userEmail = reversedEvents.find((event) => event.data.email)?.data
      .email;

    expect(events).toHaveLength(5);
    expect(userName).toEqual("Third Name");
    expect(userEmail).toEqual("third@example.com");
  });
});
