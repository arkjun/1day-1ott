import { describe, expect, it } from "vitest";
import {
  avatarUrl,
  MAX_AVATAR_BYTES,
  validateAvatarFile,
} from "./avatar";

describe("avatar", () => {
  it("키가 없으면 media 도메인의 기본 이미지를 사용한다", () => {
    expect(avatarUrl()).toBe(
      "https://media.1day1ott.com/avatars/default.svg",
    );
    expect(avatarUrl("avatars/id.jpg")).toBe(
      "https://media.1day1ott.com/avatars/id.jpg",
    );
  });

  it("지원 형식과 5MB 상한을 검사한다", () => {
    expect(validateAvatarFile(new File(["x"], "a.jpg", { type: "image/jpeg" }))).toBeNull();
    expect(validateAvatarFile(new File(["x"], "a.svg", { type: "image/svg+xml" }))).toBe(
      "invalid_image_type",
    );
    expect(
      validateAvatarFile(
        new File([new Uint8Array(MAX_AVATAR_BYTES + 1)], "a.png", {
          type: "image/png",
        }),
      ),
    ).toBe("image_too_large");
  });
});
