import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The setup file imports app.js so the IIFE registers the
    // globalThis.ExpenseViz namespace before tests run.
    setupFiles: ["./vitest.setup.js"],
    include: ["js/**/*.test.js"],
  },
});
