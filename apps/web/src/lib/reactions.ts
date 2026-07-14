import type { Reaction } from "@1ott/shared";

/** 넷플릭스식 반응 메타. 표시 순서: 싫어요 → 좋아요 → 매우 좋아요. */
export const REACTION_ORDER: Reaction[] = ["down", "up", "love"];

export const REACTION_META: Record<Reaction, { emoji: string; label: string }> = {
  down: { emoji: "👎", label: "싫어요" },
  up: { emoji: "👍", label: "좋아요" },
  love: { emoji: "👍👍", label: "매우 좋아요" },
};
