import { expect } from "vitest";

expect.extend({
  toBeUlid(received) {
    const ulidRegex = /^[\dA-HJKMNP-TV-Z]{26}$/i;
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

interface CustomMatchers<R = unknown> {
  toBeUlid(): R;
}

declare module "vitest" {
  interface Assertion<T = any> extends CustomMatchers<T> {}
  interface AsymmetricMatchersContaining extends CustomMatchers {}
}
