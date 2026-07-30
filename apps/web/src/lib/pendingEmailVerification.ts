const STORAGE_KEY = "pending-verification-email";

export interface VerificationEmailStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): unknown;
  removeItem(key: string): unknown;
}

export function readPendingVerificationEmail(
  storage: VerificationEmailStorage = window.sessionStorage,
) {
  try {
    return storage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function savePendingVerificationEmail(
  email: string,
  storage: VerificationEmailStorage = window.sessionStorage,
) {
  try {
    storage.setItem(STORAGE_KEY, email);
  } catch {
    // 저장소가 차단된 환경에서는 현재 화면의 상태만 유지한다.
  }
}

export function clearPendingVerificationEmail(
  storage: VerificationEmailStorage = window.sessionStorage,
) {
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    // 저장소가 차단된 환경에서는 제거할 상태도 복원되지 않는다.
  }
}
