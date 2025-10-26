import { expect } from "vitest";

declare module "vitest" {
  interface Assertion<T = any> {
    toBeUlid(): T;
  }
}

expect.extend({
  toBeUlid(received) {
    const ulidRegex = /^[0-9A-HJKMNP-TV-Z]{26}$/;
    const pass = typeof received === "string" && ulidRegex.test(received);

    if (pass) {
      return {
        message: () => `expected "${received}" not to be a valid ULID`,
        pass: true
      };
    } else {
      return {
        message: () => `expected "${received}" to be a valid ULID`,
        pass: false
      };
    }
  }
});
