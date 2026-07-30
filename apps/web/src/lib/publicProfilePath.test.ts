import { describe, expect, it } from "vitest";
import {
  publicProfilePath,
  usernameFromPublicProfilePath,
} from "./publicProfilePath";

describe("공개 프로필 경로", () => {
  it("username으로 @ 경로를 만든다", () => {
    expect(publicProfilePath("arkjun")).toBe("/@arkjun");
  });

  it("@ 경로에서 username을 읽는다", () => {
    expect(usernameFromPublicProfilePath("/@arkjun")).toBe("arkjun");
    expect(usernameFromPublicProfilePath("/%40arkjun")).toBe("arkjun");
  });

  it("기존 /u 경로와 빈 username은 공개 프로필 경로로 처리하지 않는다", () => {
    expect(usernameFromPublicProfilePath("/u/arkjun")).toBeNull();
    expect(usernameFromPublicProfilePath("/@")).toBeNull();
  });
});
