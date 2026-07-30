import {
  cloudflareTest,
  readD1Migrations,
} from "@cloudflare/vitest-pool-workers";
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig(async () => {
  const migrations = await readD1Migrations(
    path.join(import.meta.dirname, "migrations"),
  );

  return {
    plugins: [
      // wrangler.jsonc 를 그대로 쓰지 않는 이유: assets(웹 dist 필요)와
      // 프로덕션 vars 를 피하고 테스트 전용 바인딩만 주입하기 위해.
      cloudflareTest({
        miniflare: {
          compatibilityDate: "2025-05-31",
          compatibilityFlags: ["nodejs_compat"],
          d1Databases: ["DB"],
          r2Buckets: ["MEDIA"],
          kvNamespaces: ["FEDIFY_KV", "FEDIFY_ORDERING_KV"],
          queueProducers: {
            FEDIFY_QUEUE: { queueName: "fedify-test" },
          },
          bindings: {
            TEST_MIGRATIONS: migrations,
            BETTER_AUTH_SECRET: "test-only-secret-not-used-in-prod",
            RESEND_API_KEY: "re_test-only-key-not-used-for-requests",
            BETTER_AUTH_URL: "http://localhost",
            WEB_ORIGIN: "http://localhost",
            MEDIA_ORIGIN: "https://media.test",
            FEDERATION_KEY_SECRET: "test-only-federation-key-secret",
          },
        },
      }),
    ],
    test: {
      setupFiles: ["./test/apply-migrations.ts"],
    },
  };
});
