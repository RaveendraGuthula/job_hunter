import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  publicDir: false,
  build: {
    outDir: "dist/background",
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      input: resolve(import.meta.dirname, "src/background/service-worker.ts"),
      output: {
        entryFileNames: "service-worker.js",
        format: "iife",
      },
    },
  },
});