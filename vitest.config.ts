import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

// Nur den `@/`-Prefix auf src/ mappen (analog tsconfig paths). Das Regex
// stellt sicher, dass scoped npm-Pakete wie @t3-oss/* unberuehrt bleiben.
export default defineConfig({
  resolve: {
    alias: [{ find: /^@\//, replacement: `${resolve(import.meta.dirname, "src")}/` }],
  },
  test: {
    environment: "node",
  },
});
