import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("감상평 반응 API", () => {
  it("취소할 이모티콘을 DELETE 요청 본문에 포함한다", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ reactions: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await api.removeNoteReaction("entry/1", "❤️");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/entries/entry%2F1/reaction",
      expect.objectContaining({
        method: "DELETE",
        credentials: "include",
        body: JSON.stringify({ emoji: "❤️" }),
      }),
    );
  });
});

describe("작품 상태 API", () => {
  it("작품 ID와 상태를 PUT 요청으로 보낸다", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ viewingStatus: "interested" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await api.setContentViewingStatus("content/1", "interested");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/content/content%2F1/status",
      expect.objectContaining({
        method: "PUT",
        credentials: "include",
        body: JSON.stringify({ viewingStatus: "interested" }),
      }),
    );
  });
});
