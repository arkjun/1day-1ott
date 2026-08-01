import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { D1KvStore } from "../src/federation/d1-kv-store";

describe("D1KvStore", () => {
  const store = new D1KvStore(env.DB);

  beforeEach(async () => {
    await env.DB.prepare("DELETE FROM federation_kv").run();
  });

  it("구조화된 키와 JSON 값을 저장하고 덮어쓴다", async () => {
    const key = ["_fedify", "publicKey", "https://remote.example/key"] as const;

    await store.set(key, { version: 1 });
    await store.set(key, { version: 2 });

    await expect(store.get(key)).resolves.toEqual({ version: 2 });
    const row = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM federation_kv",
    ).first<{ count: number }>();
    expect(row?.count).toBe(1);
  });

  it("만료된 값은 반환하거나 나열하지 않는다", async () => {
    const key = ["_fedify", "temporary"] as const;
    await store.set(key, "expired", {
      ttl: { total: () => -1 } as never,
    });

    await expect(store.get(key)).resolves.toBeUndefined();
    const entries = [];
    for await (const entry of store.list(["_fedify"])) entries.push(entry);
    expect(entries).toEqual([]);
  });

  it("정확한 prefix와 하위 키만 나열한다", async () => {
    await store.set(["root"], "exact");
    await store.set(["root", "child"], "child");
    await store.set(["root", "child", "leaf"], "leaf");
    await store.set(["root-other"], "other");

    const entries = [];
    for await (const entry of store.list(["root"])) entries.push(entry);

    expect(entries).toHaveLength(3);
    expect(entries).toEqual(
      expect.arrayContaining([
        { key: ["root"], value: "exact" },
        { key: ["root", "child"], value: "child" },
        { key: ["root", "child", "leaf"], value: "leaf" },
      ]),
    );
  });

  it("값을 삭제한다", async () => {
    const key = ["_fedify", "delete-me"] as const;
    await store.set(key, true);

    await store.delete(key);

    await expect(store.get(key)).resolves.toBeUndefined();
  });
});
