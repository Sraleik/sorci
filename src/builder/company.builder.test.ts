import { createId } from "../common/utils";

describe("Test on company", async () => {
  test("Create a simple company", async () => {
    const { events } = await aCompany().build();
    const companyId = events[0].data.companyId;

    expect(companyId).toBeUlid();
    expect(events).toHaveLength(1);
  });

  test("Create a company with a custom name, email, address and id", async () => {
    const companyId = createId();
    const companyName = "ACME Corporation";
    const companyEmail = "contact@acme.com";
    const companyAddress = "123 Main Street, New York, NY 10001";

    const { events } = await aCompany()
      .withInitialName(companyName)
      .withInitialEmail(companyEmail)
      .withInitialAddress(companyAddress)
      .withId(companyId)
      .build();

    const createdEvent = events[0];
    const persistedName = createdEvent.data.name;
    const persistedEmail = createdEvent.data.email;
    const persistedAddress = createdEvent.data.address;
    const persistedId = createdEvent.identifier.companyId;

    expect(persistedId).toEqual(companyId);
    expect(persistedName).toEqual(companyName);
    expect(persistedEmail).toEqual(companyEmail);
    expect(persistedAddress).toEqual(companyAddress);
    expect(events).toHaveLength(1);
  });

  test("Rename a company", async () => {
    const { events } = await aCompany()
      .withInitialName("ACME Corporation")
      .renamed("ACME International")
      .build();

    const companyName = events.reverse().find((event) => event.data.name)
      ?.data.name;

    expect(events).toHaveLength(2);
    expect(companyName).toEqual("ACME International");
  });

  test("Change company email", async () => {
    const { events } = await aCompany()
      .withInitialEmail("old@acme.com")
      .emailChanged("new@acme.com")
      .build();

    const companyEmail = events.reverse().find((event) => event.data.email)
      ?.data.email;

    expect(events).toHaveLength(2);
    expect(companyEmail).toEqual("new@acme.com");
  });

  test("Change company address", async () => {
    const { events } = await aCompany()
      .withInitialAddress("123 Old Street")
      .addressChanged("456 New Avenue")
      .build();

    const companyAddress = events.reverse().find((event) => event.data.address)
      ?.data.address;

    expect(events).toHaveLength(2);
    expect(companyAddress).toEqual("456 New Avenue");
  });

  test("Delete a company", async () => {
    const { events } = await aCompany()
      .withInitialName("ACME Corporation")
      .withInitialEmail("contact@acme.com")
      .renamed("ACME International")
      .emailChanged("info@acme-intl.com")
      .deleted()
      .build();

    const reversedEvents = [...events].reverse();

    const companyName = reversedEvents.find((event) => event.data.name)?.data
      .name;
    const companyEmail = reversedEvents.find((event) => event.data.email)?.data
      .email;

    expect(events).toHaveLength(4);
    expect(companyName).toEqual("ACME International");
    expect(companyEmail).toEqual("info@acme-intl.com");
  });

  test("Company with multiple changes", async () => {
    const { events } = await aCompany()
      .withInitialName("Initial Corp")
      .withInitialEmail("initial@corp.com")
      .withInitialAddress("100 Initial St")
      .renamed("Second Corp")
      .emailChanged("second@corp.com")
      .addressChanged("200 Second Ave")
      .renamed("Third Corp")
      .emailChanged("third@corp.com")
      .addressChanged("300 Third Blvd")
      .build();

    const reversedEvents = [...events].reverse();

    const companyName = reversedEvents.find((event) => event.data.name)?.data
      .name;
    const companyEmail = reversedEvents.find((event) => event.data.email)?.data
      .email;
    const companyAddress = reversedEvents.find((event) => event.data.address)
      ?.data.address;

    expect(events).toHaveLength(7);
    expect(companyName).toEqual("Third Corp");
    expect(companyEmail).toEqual("third@corp.com");
    expect(companyAddress).toEqual("300 Third Blvd");
  });
});
