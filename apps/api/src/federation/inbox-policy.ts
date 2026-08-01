export const MAX_FEDERATION_INBOX_BODY_BYTES = 64 * 1024;

const supportedActivityTypes = new Set([
  "Follow",
  "Like",
  "EmojiReact",
  "Undo",
]);

type JsonRecord = Record<string, unknown>;

interface InboxPolicyBindings {
  db: D1Database;
  origin?: string;
  rateLimiter: RateLimit;
}

interface LocalTarget {
  kind: "actor" | "entry";
  id: string;
}

export function isFederationInboxPath(pathname: string): boolean {
  return (
    pathname === "/ap/inbox" ||
    /^\/ap\/users\/[^/]+\/inbox\/?$/.test(pathname)
  );
}

export async function prepareFederationInboxRequest(
  request: Request,
  bindings: InboxPolicyBindings,
): Promise<Request | Response> {
  if (!isActivityJson(request.headers.get("content-type"))) {
    return new Response("unsupported_media_type", { status: 415 });
  }

  const body = await readBoundedBody(request);
  if (body === "too_large") {
    return new Response("payload_too_large", { status: 413 });
  }
  if (body === null) return new Response("invalid_json", { status: 400 });

  let activity: JsonRecord;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(body)) as unknown;
    if (!isRecord(parsed)) throw new TypeError("Activity must be an object.");
    activity = parsed;
  } catch {
    return new Response("invalid_json", { status: 400 });
  }

  const type = compactType(activity.type);
  const actorOrigin = extractActorOrigin(activity.actor);
  const target = type
    ? extractLocalTarget(activity, type, bindings.origin ?? request.url)
    : null;
  if (!type || !supportedActivityTypes.has(type) || !actorOrigin || !target) {
    logDropped("unsupported_or_nonlocal", type, actorOrigin);
    return new Response(null, { status: 202 });
  }

  const recipient = inboxRecipient(new URL(request.url).pathname);
  if (recipient && target.kind === "actor" && target.id !== recipient) {
    logDropped("recipient_mismatch", type, actorOrigin);
    return new Response(null, { status: 202 });
  }

  const rateLimitResponse = await enforceRateLimit(
    bindings.rateLimiter,
    actorOrigin,
    type,
  );
  if (rateLimitResponse) return rateLimitResponse;

  if (!(await targetExists(bindings.db, target, recipient))) {
    logDropped("unknown_target", type, actorOrigin);
    return new Response(null, { status: 202 });
  }

  return new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body,
    redirect: request.redirect,
    signal: request.signal,
  });
}

async function readBoundedBody(
  request: Request,
): Promise<Uint8Array | "too_large" | null> {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_FEDERATION_INBOX_BODY_BYTES) {
    return "too_large";
  }
  if (!request.body) return null;

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (total + value.byteLength > MAX_FEDERATION_INBOX_BODY_BYTES) {
      await reader.cancel();
      return "too_large";
    }
    chunks.push(value);
    total += value.byteLength;
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

function isActivityJson(contentType: string | null): boolean {
  const mediaType = contentType?.split(";", 1)[0]?.trim().toLowerCase();
  return (
    mediaType === "application/activity+json" ||
    mediaType === "application/ld+json" ||
    mediaType === "application/json"
  );
}

function extractLocalTarget(
  activity: JsonRecord,
  type: string,
  requestUrl: string,
): LocalTarget | null {
  if (type === "Undo") {
    if (!isRecord(activity.object)) return null;
    const undoneType = compactType(activity.object.type);
    if (!undoneType || !supportedActivityTypes.has(undoneType) || undoneType === "Undo") {
      return null;
    }
    return extractLocalTarget(activity.object, undoneType, requestUrl);
  }

  const objectId = extractId(activity.object);
  if (!objectId) return null;
  let objectUrl: URL;
  try {
    objectUrl = new URL(objectId);
  } catch {
    return null;
  }
  if (objectUrl.origin !== new URL(requestUrl).origin) return null;

  const pattern =
    type === "Follow"
      ? /^\/ap\/users\/([^/]+)\/?$/
      : /^\/ap\/entries\/([^/]+)\/?$/;
  const match = pattern.exec(objectUrl.pathname);
  if (!match?.[1]) return null;
  const id = decodePathSegment(match[1]);
  if (!id) return null;
  return { kind: type === "Follow" ? "actor" : "entry", id };
}

function extractActorOrigin(value: unknown): string | null {
  const actorId = extractId(value);
  if (!actorId) return null;
  try {
    const url = new URL(actorId);
    return url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}

function extractId(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const id = extractId(item);
      if (id) return id;
    }
    return null;
  }
  return isRecord(value) ? extractId(value.id) : null;
}

function compactType(value: unknown): string | null {
  const raw = Array.isArray(value)
    ? value.find((item): item is string => typeof item === "string")
    : typeof value === "string"
      ? value
      : null;
  if (!raw) return null;
  return raw.split(/[/#:]|%23/).filter(Boolean).at(-1) ?? null;
}

function inboxRecipient(pathname: string): string | null {
  const match = /^\/ap\/users\/([^/]+)\/inbox\/?$/.exec(pathname);
  return match?.[1] ? decodePathSegment(match[1]) : null;
}

function decodePathSegment(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

async function enforceRateLimit(
  limiter: RateLimit,
  actorOrigin: string,
  type: string,
): Promise<Response | null> {
  try {
    const global = await limiter.limit({ key: "federation-inbox:global" });
    if (!global.success) return rateLimited(type, actorOrigin, "global");
    const origin = await limiter.limit({
      key: `federation-inbox:origin:${actorOrigin}`,
    });
    return origin.success ? null : rateLimited(type, actorOrigin, "origin");
  } catch (error) {
    console.error("Federation inbox rate limiter failed", { error });
    return new Response("rate_limiter_unavailable", {
      status: 503,
      headers: { "retry-after": "60" },
    });
  }
}

function rateLimited(
  type: string,
  actorOrigin: string,
  scope: "global" | "origin",
): Response {
  console.warn("Rate limited federation inbox activity", {
    type,
    actorOrigin,
    scope,
  });
  return new Response("rate_limited", {
    status: 429,
    headers: { "retry-after": "60" },
  });
}

async function targetExists(
  db: D1Database,
  target: LocalTarget,
  recipient: string | null,
): Promise<boolean> {
  if (target.kind === "actor") {
    const row = await db
      .prepare(
        `SELECT id
           FROM user
          WHERE id = ? AND is_public = true AND federation_enabled = true`,
      )
      .bind(target.id)
      .first();
    return row != null;
  }

  const row = await db
    .prepare(
      `SELECT fp.entry_id
         FROM federation_publications fp
         JOIN entries e ON e.id = fp.entry_id
        WHERE fp.entry_id = ?
          AND fp.status = 'published'
          AND e.is_note_public = true
          AND (? IS NULL OR fp.user_id = ?)`,
    )
    .bind(target.id, recipient, recipient)
    .first();
  return row != null;
}

function logDropped(
  reason: string,
  type: string | null,
  actorOrigin: string | null,
): void {
  console.info("Dropped federation inbox activity before signature verification", {
    reason,
    type,
    actorOrigin,
  });
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value != null && !Array.isArray(value);
}
