import { describe, expect, it } from "vitest";
import { validatePasswordChange } from "./password";

describe("비밀번호 변경 검증", () => {
  it("현재 비밀번호가 필요하다", () => {
    expect(validatePasswordChange("", "new-password", "new-password")).toBe(
      "currentRequired",
    );
  });

  it("새 비밀번호는 8자 이상이어야 한다", () => {
    expect(validatePasswordChange("old-password", "short", "short")).toBe(
      "minLength",
    );
  });

  it("새 비밀번호 확인이 일치해야 한다", () => {
    expect(
      validatePasswordChange("old-password", "new-password", "different"),
    ).toBe("mismatch");
  });

  it("현재 비밀번호와 같은 값은 거부한다", () => {
    expect(
      validatePasswordChange("same-password", "same-password", "same-password"),
    ).toBe("sameAsCurrent");
  });

  it("유효한 입력은 오류가 없다", () => {
    expect(
      validatePasswordChange("old-password", "new-password", "new-password"),
    ).toBeNull();
  });
});
