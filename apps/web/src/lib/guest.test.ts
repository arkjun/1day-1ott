import type { EntryInput } from "@1ott/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createGuestEntriesApi,
  readActiveGuest,
  startGuest,
  stopGuest,
} from "./guest";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

const movie: EntryInput = {
  type: "movie",
  title: "테스트 영화",
  tmdbId: 42,
  posterUrl: "https://example.com/poster.jpg",
  watchedOn: "2026-08-06",
  reaction: "love",
  note: "좋았다",
  isNotePublic: true,
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("게스트 저장소", () => {
  it("임의 이름을 만들고 종료 후에도 같은 프로필을 재사용한다", () => {
    const storage = new MemoryStorage();
    vi.spyOn(crypto, "randomUUID").mockReturnValue(
      "12345678-1234-1234-1234-123456789012",
    );

    expect(startGuest(storage).username).toBe("guest_12345678");
    expect(readActiveGuest(storage)?.username).toBe("guest_12345678");

    stopGuest(storage);
    expect(readActiveGuest(storage)).toBeNull();
    expect(startGuest(storage).username).toBe("guest_12345678");
  });

  it("기록을 localStorage에서 생성·조회·수정·삭제한다", async () => {
    const storage = new MemoryStorage();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    startGuest(storage);
    const api = createGuestEntriesApi(storage);

    const created = await api.createEntry(movie);
    expect(created.contentId).toBe("tmdb:movie:42");
    expect((await api.listEntries()).entries).toMatchObject([
      {
        id: created.id,
        contentId: "tmdb:movie:42",
        title: "테스트 영화",
        note: "좋았다",
      },
    ]);

    await api.updateEntry(created.id, { note: "수정", reaction: null });
    expect((await api.listEntries()).entries[0]).toMatchObject({
      note: "수정",
      reaction: null,
    });

    await api.deleteEntry(created.id);
    expect((await api.listEntries()).entries).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("날짜별 기록 수로 잔디 단계를 계산한다", async () => {
    const storage = new MemoryStorage();
    startGuest(storage);
    const api = createGuestEntriesApi(storage);

    await api.createEntry(movie);
    await api.createEntry({ ...movie, title: "두 번째", tmdbId: 43 });
    await api.createEntry({
      ...movie,
      title: "다른 날",
      tmdbId: 44,
      watchedOn: "2026-08-05",
    });

    expect((await api.heatmap()).cells).toEqual([
      { date: "2026-08-05", count: 1, level: 1 },
      { date: "2026-08-06", count: 2, level: 2 },
    ]);
  });
});
