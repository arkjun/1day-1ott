import { defineConfig } from "drizzle-kit";

// SQL 마이그레이션만 생성한다. 적용은 `wrangler d1 migrations apply` 가 담당.
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./migrations",
  dialect: "sqlite",
});
