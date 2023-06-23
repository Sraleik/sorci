// vite.config.ts
import { resolve } from "path";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

// https://vitejs.dev/guide/build.html#library-mode
export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      name: "sorci",
      fileName: "sorci",
      formats: ["es", "umd", "iife", "cjs"],
    },
    rollupOptions: {
      // make sure to externalize deps that shouldn't be bundled
      // into your library
      external: ["postgres", "nanoid"],
      output: {
        // Provide global variables to use in the UMD build
        // for externalized deps
        globals: {
          postgres: 'Postgres',
          nanoid: 'Nanoid'
        },
      },
    },
  },
  plugins: [dts()],
});
