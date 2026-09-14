import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  publicDir: false,
  build: {
    outDir: "dist/content",
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      input: resolve(import.meta.dirname, "src/content/content.ts"),
      output: {
        entryFileNames: "content.js",
        format: "iife",
      },
    },
  },
});