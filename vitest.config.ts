import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// `@/` resolves to the repo root, mirroring tsconfig paths.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
