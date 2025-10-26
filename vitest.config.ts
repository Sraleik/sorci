import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    globalSetup: "./test-global-setup.ts",
    setupFiles: ["./test-setup.ts"]
  }
});
