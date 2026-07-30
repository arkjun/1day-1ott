import {
  exportJwk,
  generateCryptoKeyPair,
  importJwk,
} from "@fedify/fedify";
import { eq } from "drizzle-orm";
import { createDb, schema } from "../db";
import type { Env } from "../env";

type KeyType = "RSASSA-PKCS1-v1_5" | "Ed25519";

interface EncryptedJwk {
  iv: string;
  data: string;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function encryptionKey(secret: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  return crypto.subtle.importKey(
    "raw",
    digest,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}

async function encryptJwk(
  jwk: JsonWebKey,
  secret: string,
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await encryptionKey(secret),
    encoder.encode(JSON.stringify(jwk)),
  );
  return JSON.stringify({
    iv: toBase64(iv),
    data: toBase64(new Uint8Array(data)),
  } satisfies EncryptedJwk);
}

async function decryptJwk(
  encrypted: string,
  secret: string,
): Promise<JsonWebKey> {
  const value = JSON.parse(encrypted) as EncryptedJwk;
  const data = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(value.iv) },
    await encryptionKey(secret),
    fromBase64(value.data),
  );
  return JSON.parse(decoder.decode(data)) as JsonWebKey;
}

export async function ensureActorKeys(
  env: Env,
  userId: string,
): Promise<void> {
  const db = createDb(env.DB);
  const stored = await db
    .select({ type: schema.federationActorKeys.type })
    .from(schema.federationActorKeys)
    .where(eq(schema.federationActorKeys.userId, userId))
    .all();
  const existing = new Set(stored.map((row) => row.type));

  for (const type of [
    "RSASSA-PKCS1-v1_5",
    "Ed25519",
  ] as const satisfies readonly KeyType[]) {
    if (existing.has(type)) continue;
    const pair = await generateCryptoKeyPair(type);
    await db
      .insert(schema.federationActorKeys)
      .values({
        userId,
        type,
        publicKey: JSON.stringify(await exportJwk(pair.publicKey)),
        encryptedPrivateKey: await encryptJwk(
          await exportJwk(pair.privateKey),
          env.FEDERATION_KEY_SECRET,
        ),
      })
      .onConflictDoNothing();
  }
}

export async function loadActorKeyPairs(
  env: Env,
  userId: string,
): Promise<CryptoKeyPair[]> {
  const db = createDb(env.DB);
  const rows = await db
    .select()
    .from(schema.federationActorKeys)
    .where(eq(schema.federationActorKeys.userId, userId))
    .all();

  return Promise.all(
    rows.map(async (row) => ({
      publicKey: await importJwk(
        JSON.parse(row.publicKey) as JsonWebKey,
        "public",
      ),
      privateKey: await importJwk(
        await decryptJwk(row.encryptedPrivateKey, env.FEDERATION_KEY_SECRET),
        "private",
      ),
    })),
  );
}
