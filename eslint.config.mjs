import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/lib/database.ts", "src/lib/audit-schema.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        paths: [{ name: "@libsql/client", message: "Use Store.mutate() for audited business writes; the raw client belongs to database internals." }],
        patterns: ["@libsql/client/*", "libsql", "bun:sqlite", "node:sqlite", "better-sqlite3"],
      }],
    },
  },
  globalIgnores([".next/**", "next-env.d.ts"]),
]);
