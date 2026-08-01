import type {
  KvKey,
  KvStore,
  KvStoreListEntry,
  KvStoreSetOptions,
} from "@fedify/fedify";

interface KvRow {
  key: string;
  value: string;
  expires_at: number | null;
}

export class D1KvStore implements KvStore {
  constructor(private readonly db: D1Database) {}

  async get<T = unknown>(key: KvKey): Promise<T | undefined> {
    const row = await this.db
      .prepare(
        `SELECT key, value, expires_at
           FROM federation_kv
          WHERE key = ?`,
      )
      .bind(encodeKey(key))
      .first<KvRow>();
    if (!row || isExpired(row)) return undefined;
    return JSON.parse(row.value) as T;
  }

  async set(
    key: KvKey,
    value: unknown,
    options?: KvStoreSetOptions,
  ): Promise<void> {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) {
      throw new TypeError("Fedify KV values must be JSON-serializable.");
    }
    const expiresAt = options?.ttl
      ? Date.now() + options.ttl.total("milliseconds")
      : null;
    await this.db
      .prepare(
        `INSERT INTO federation_kv (key, value, expires_at)
         VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET
           value = excluded.value,
           expires_at = excluded.expires_at`,
      )
      .bind(encodeKey(key), serialized, expiresAt)
      .run();
  }

  async delete(key: KvKey): Promise<void> {
    await this.db
      .prepare("DELETE FROM federation_kv WHERE key = ?")
      .bind(encodeKey(key))
      .run();
  }

  async *list(prefix?: KvKey): AsyncIterable<KvStoreListEntry> {
    const rows = prefix
      ? await this.listPrefix(prefix)
      : await this.db
          .prepare(
            `SELECT key, value, expires_at
               FROM federation_kv
              ORDER BY key`,
          )
          .all<KvRow>();

    for (const row of rows.results) {
      if (isExpired(row)) continue;
      yield {
        key: JSON.parse(row.key) as KvKey,
        value: JSON.parse(row.value) as unknown,
      };
    }
  }

  private async listPrefix(prefix: KvKey) {
    const exactKey = encodeKey(prefix);
    const childPrefix = `${exactKey.slice(0, -1)},`;
    return this.db
      .prepare(
        `SELECT key, value, expires_at
           FROM federation_kv
          WHERE key = ? OR key LIKE ? ESCAPE '\\'
          ORDER BY key`,
      )
      .bind(exactKey, `${escapeLike(childPrefix)}%`)
      .all<KvRow>();
  }
}

function encodeKey(key: KvKey): string {
  return JSON.stringify(key);
}

function escapeLike(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

function isExpired(row: KvRow): boolean {
  return row.expires_at != null && row.expires_at <= Date.now();
}
