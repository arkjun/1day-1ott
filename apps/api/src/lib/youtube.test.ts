import { describe, expect, it, vi } from "vitest";
import { fetchYouTubeChannelName } from "./youtube";

describe("fetchYouTubeChannelName", () => {
  it("과거 YouTube 기록은 oEmbed에서 채널명을 보완할 수 있다", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({ author_name: "테스트 채널" }),
    );

    await expect(
      fetchYouTubeChannelName("dQw4w9WgXcQ", fetcher),
    ).resolves.toBe("테스트 채널");
    expect(fetcher).toHaveBeenCalledWith(
      "https://www.youtube.com/oembed?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DdQw4w9WgXcQ&format=json",
      { signal: expect.any(AbortSignal) },
    );
  });

  it("oEmbed 실패나 빈 채널명은 null로 처리한다", async () => {
    await expect(
      fetchYouTubeChannelName("dQw4w9WgXcQ", async () =>
        new Response(null, { status: 502 }),
      ),
    ).resolves.toBeNull();
    await expect(
      fetchYouTubeChannelName("dQw4w9WgXcQ", async () =>
        Response.json({ author_name: " " }),
      ),
    ).resolves.toBeNull();
  });

  it("oEmbed가 응답하지 않으면 제한 시간 뒤 null로 처리한다", async () => {
    vi.useFakeTimers();
    const pendingFetch = vi.fn(
      async (_input: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        }),
    );

    const result = fetchYouTubeChannelName(
      "dQw4w9WgXcQ",
      pendingFetch,
      100,
    );
    await vi.advanceTimersByTimeAsync(100);

    await expect(result).resolves.toBeNull();
    vi.useRealTimers();
  });
});
