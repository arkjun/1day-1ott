import { describe, expect, it } from "vitest";
import {
  ANALYTICS_CONSENT_KEY,
  readAnalyticsConsent,
  writeAnalyticsConsent,
  isGaMeasurementId,
} from "./analytics";

describe("Google Analytics 설정", () => {
  it.each(["G-ABC123", "G-1A2B3C4D5E"])("%s 측정 ID를 허용한다", (id) => {
    expect(isGaMeasurementId(id)).toBe(true);
  });

  it.each(["", "UA-123", "G-", "GT-ABC123", " G-ABC123 "])(
    "%s 측정 ID를 거부한다",
    (id) => {
      expect(isGaMeasurementId(id)).toBe(false);
    },
  );

  it("저장된 동의값만 읽고 알 수 없는 값은 무시한다", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };

    expect(readAnalyticsConsent(storage)).toBeNull();
    writeAnalyticsConsent("granted", storage);
    expect(values.get(ANALYTICS_CONSENT_KEY)).toBe("granted");
    expect(readAnalyticsConsent(storage)).toBe("granted");

    values.set(ANALYTICS_CONSENT_KEY, "unknown");
    expect(readAnalyticsConsent(storage)).toBeNull();
  });
});
