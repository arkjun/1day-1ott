import type { D1Migration } from "cloudflare:test";
import type { Env as AppEnv } from "../src/env";

// pool-workers 0.18: `env`는 전역 Cloudflare.Env 로 타이핑된다.
// vitest.config.ts 의 miniflare.bindings 와 일치해야 한다.
declare global {
  namespace Cloudflare {
    interface Env extends AppEnv {
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}
