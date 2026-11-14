import { defineConfig } from "vitest/config";

// Eigene Config, damit Vitest nicht die vite.config.ts des übergeordneten Repos lädt.
export default defineConfig({
  test: { include: ["tests/**/*.test.ts"] },
});
