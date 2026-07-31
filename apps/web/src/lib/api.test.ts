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
