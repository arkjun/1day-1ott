import { describe, expect, it } from "vitest";
import {
  avatarUrl,
  MAX_AVATAR_BYTES,
  parseAvatarFile,
  ProfileImageError,
} from "./avatar";

function file(bytes: number[], name: string, type: string) {
  return new File([new Uint8Array(bytes)], name, { type });
}

describe("parseAvatarFile", () => {
  it("원래 JPEG 확장자 종류를 소문자로 보존한다", async () => {
    const jpg = await parseAvatarFile(file([0xff, 0xd8, 0xff], "ME.JPG", "image/jpeg"));
    const jpeg = await parseAvatarFile(file([0xff, 0xd8, 0xff], "me.jpeg", "image/jpeg"));

    expect(jpg.extension).toBe("jpg");
    expect(jpeg.extension).toBe("jpeg");
  });

  it("확장자, MIME, magic bytes가 일치하지 않으면 거부한다", async () => {
    await expect(
      parseAvatarFile(file([0xff, 0xd8, 0xff], "me.png", "image/png")),
    ).rejects.toEqual(new ProfileImageError("invalid_image_type"));
    await expect(
      parseAvatarFile(file([0x3c, 0x73, 0x76, 0x67], "me.svg", "image/svg+xml")),
    ).rejects.toEqual(new ProfileImageError("invalid_image_type"));
  });

  it("5MB를 초과하면 거부한다", async () => {
    await expect(
      parseAvatarFile(
        new File([new Uint8Array(MAX_AVATAR_BYTES + 1)], "large.jpg", {
          type: "image/jpeg",
        }),
      ),
    ).rejects.toEqual(new ProfileImageError("image_too_large"));
  });
});

describe("avatarUrl", () => {
  it("키가 없으면 R2 공용 기본 이미지를 반환한다", () => {
    expect(avatarUrl("https://media.test/", null)).toBe(
      "https://media.test/avatars/default.svg",
    );
    expect(avatarUrl("https://media.test", "avatars/id.webp")).toBe(
      "https://media.test/avatars/id.webp",
    );
  });
});
