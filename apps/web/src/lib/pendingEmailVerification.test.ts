import { describe, expect, it } from "vitest";
import {
  clearPendingVerificationEmail,
  readPendingVerificationEmail,
  savePendingVerificationEmail,
  type VerificationEmailStorage,
} from "./pendingEmailVerification";

function createStorage(): VerificationEmailStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

describe("가입 이메일 인증 대기 상태", () => {
  it("새로고침 후에도 인증 대상 이메일을 복원하고 완료 시 제거한다", () => {
    const storage = createStorage();

    savePendingVerificationEmail("new-user@example.com", storage);

    expect(readPendingVerificationEmail(storage)).toBe("new-user@example.com");

    clearPendingVerificationEmail(storage);

    expect(readPendingVerificationEmail(storage)).toBeNull();
  });

  it("브라우저 저장소를 사용할 수 없으면 대기 상태가 없는 것으로 처리한다", () => {
    const storage: VerificationEmailStorage = {
      getItem: () => {
        throw new Error("storage unavailable");
      },
      setItem: () => {
        throw new Error("storage unavailable");
      },
      removeItem: () => {
        throw new Error("storage unavailable");
      },
    };

    expect(() => savePendingVerificationEmail("new-user@example.com", storage)).not.toThrow();
    expect(readPendingVerificationEmail(storage)).toBeNull();
    expect(() => clearPendingVerificationEmail(storage)).not.toThrow();
  });
});
