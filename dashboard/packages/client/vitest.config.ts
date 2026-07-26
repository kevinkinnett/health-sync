import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./src/__tests__/setup.ts",
    css: false,
    // `e2e/` holds Playwright specs, which need a real browser and are run
    // by `pnpm e2e`. Without this, vitest's default glob picks them up and
    // fails on the `@playwright/test` import.
    exclude: ["**/node_modules/**", "**/dist/**", "e2e/**"],
  },
});
