import { SorciEvent, sorciEventFactory } from "./sorci-event";
import { ulid } from "ulidx";
import { v4 as uuid } from "uuid";
import { customAlphabet } from "nanoid";

describe("Given the default SorciEvent", () => {
  describe("When creating a new SorciEvent", () => {
    const eventPayload = {
      type: "course-created",
      data: { name: "Maths", courseId: ulid() }
    };

    const event = SorciEvent.create(eventPayload);

    test("Then the event id is an ulid", () => {
      expect(event.id).toMatch(/^[\dA-HJKMNP-TV-Z]{26}$/);
    });
    test("Then the type is correct", () => {
      expect(event.type).toEqual(eventPayload.type);
    });
    test("Then the data is correct", () => {
      expect(event.data).toEqual(eventPayload.data);
    });
    test("Then the identifier is correct", () => {
      expect(event.identifier).toEqual({
        courseId: eventPayload.data.courseId
      });
    });
    test("Then the timestamp is correct", () => {
      expect(event.timestamp).toBeInstanceOf(Date);
    });
  });
});

describe("Given SorciEvent customize to use uuid", () => {
  describe("When creating a new SorciEvent", () => {
    const eventPayload = {
      type: "course-created",
      data: { name: "Maths", courseId: uuid() }
    };

    const SorciEventUuid = sorciEventFactory(() => uuid());

    const event = SorciEventUuid.create(eventPayload);

    test("Then the event id is an ulid", () => {
      expect(event.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[8|9aAbB][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
    });
    test("Then the type is correct", () => {
      expect(event.type).toEqual(eventPayload.type);
    });
    test("Then the data is correct", () => {
      expect(event.data).toEqual(eventPayload.data);
    });
    test("Then the identifier is correct", () => {
      expect(event.identifier).toEqual({
        courseId: eventPayload.data.courseId
      });
    });
    test("Then the timestamp is correct", () => {
      expect(event.timestamp).toBeInstanceOf(Date);
    });
  });
});

describe("Given SorciEvent customize to use nanoid", () => {
  describe("When creating a new SorciEvent", () => {
    const tinyId = customAlphabet("0123456789abcdef", 12);
    const eventPayload = {
      type: "course-created",
      data: { name: "Maths", courseId: tinyId() }
    };

    const SorciEventUuid = sorciEventFactory(() => tinyId());

    const event = SorciEventUuid.create(eventPayload);

    test("Then the event id is an ulid", () => {
      expect(event.id).toMatch(/^[\da-f]{12}$/i);
    });
    test("Then the type is correct", () => {
      expect(event.type).toEqual(eventPayload.type);
    });
    test("Then the data is correct", () => {
      expect(event.data).toEqual(eventPayload.data);
    });
    test("Then the identifier is correct", () => {
      expect(event.identifier).toEqual({
        courseId: eventPayload.data.courseId
      });
    });
    test("Then the timestamp is correct", () => {
      expect(event.timestamp).toBeInstanceOf(Date);
    });
  });
});
