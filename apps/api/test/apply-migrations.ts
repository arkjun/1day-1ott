import { applyD1Migrations, env } from "cloudflare:test";

// 각 테스트는 격리된 스토리지를 받으므로, 스키마는 셋업에서 적용한다.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
