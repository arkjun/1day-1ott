import type { Reaction } from "@1ott/shared";

/** 넷플릭스식 반응 메타. 표시 순서: 싫어요 → 좋아요 → 매우 좋아요.
 *  표시 라벨은 i18n(`reaction.*`)에서 가져온다. */
export const REACTION_ORDER: Reaction[] = ["down", "up", "love"];

export const REACTION_META: Record<Reaction, { emoji: string }> = {
  down: { emoji: "👎" },
  up: { emoji: "👍" },
  love: { emoji: "👍👍" },
};
