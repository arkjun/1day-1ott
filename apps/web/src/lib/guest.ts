import { countToLevel, entryInputSchema } from "@1ott/shared";
import type { EntriesApi, EntryRow } from "./api";

const STORAGE_KEY = "1ott:guest:v1";

export interface GuestProfile {
  username: string;
}

interface GuestData extends GuestProfile {
  version: 1;
  active: boolean;
  entries: EntryRow[];
}

function read(storage: Storage): GuestData | null {
  try {
    const value = JSON.parse(storage.getItem(STORAGE_KEY) ?? "null") as Partial<GuestData> | null;
    if (
      value?.version !== 1 ||
      typeof value.active !== "boolean" ||
      typeof value.username !== "string" ||
      !Array.isArray(value.entries)
    ) {
      return null;
    }
    return value as GuestData;
  } catch {
    return null;
  }
}

function write(storage: Storage, data: GuestData) {
  storage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function requireGuest(storage: Storage): GuestData {
  const data = read(storage);
  if (!data) throw new Error("guest_not_found");
  return data;
}

export function readActiveGuest(
  storage: Storage = window.localStorage,
): GuestProfile | null {
  const data = read(storage);
  return data?.active ? { username: data.username } : null;
}

export function startGuest(
  storage: Storage = window.localStorage,
): GuestProfile {
  const existing = read(storage);
  const data: GuestData = existing
    ? { ...existing, active: true }
    : {
        version: 1,
        active: true,
        username: `guest_${crypto.randomUUID().slice(0, 8)}`,
        entries: [],
      };
  write(storage, data);
  return { username: data.username };
}

export function stopGuest(storage: Storage = window.localStorage) {
  const data = read(storage);
  if (data) write(storage, { ...data, active: false });
}

export function createGuestEntriesApi(storage: Storage): EntriesApi {
  return {
    async createEntry(rawInput) {
      const input = entryInputSchema.parse(rawInput);
      const data = requireGuest(storage);
      const id = crypto.randomUUID();
      const contentId =
        input.contentId ??
        (input.tmdbId != null
          ? `tmdb:${input.type}:${input.tmdbId}`
          : input.ytId
            ? `yt:${input.ytId}`
            : `content:${crypto.randomUUID()}`);
      data.entries.unshift({
        id,
        contentId,
        watchedOn: input.watchedOn,
        reaction: input.reaction ?? null,
        note: input.note ?? null,
        isNotePublic: input.isNotePublic,
        platform: input.platform ?? null,
        type: input.type,
        title: input.title,
        channelName: input.channelName ?? null,
        posterUrl: input.posterUrl ?? null,
      });
      write(storage, data);
      return { id, contentId };
    },

    async listEntries() {
      const entries = [...requireGuest(storage).entries].sort((a, b) =>
        b.watchedOn.localeCompare(a.watchedOn),
      );
      return { entries };
    },

    async updateEntry(id, patch) {
      if (patch.watchedOn && !/^\d{4}-\d{2}-\d{2}$/.test(patch.watchedOn)) {
        throw new Error("invalid_watched_on");
      }
      if (patch.note && patch.note.length > 1000) throw new Error("note_too_long");
      if (patch.platform && patch.platform.length > 60) {
        throw new Error("platform_too_long");
      }
      const data = requireGuest(storage);
      const index = data.entries.findIndex((entry) => entry.id === id);
      const entry = data.entries[index];
      if (!entry) throw new Error("entry_not_found");
      data.entries[index] = { ...entry, ...patch };
      write(storage, data);
      return { ok: true };
    },

    async deleteEntry(id) {
      const data = requireGuest(storage);
      const entries = data.entries.filter((entry) => entry.id !== id);
      if (entries.length === data.entries.length) throw new Error("entry_not_found");
      write(storage, { ...data, entries });
      return { ok: true };
    },

    async heatmap() {
      const counts = new Map<string, number>();
      for (const entry of requireGuest(storage).entries) {
        counts.set(entry.watchedOn, (counts.get(entry.watchedOn) ?? 0) + 1);
      }
      return {
        cells: [...counts]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, count]) => ({ date, count, level: countToLevel(count) })),
      };
    },
  };
}
