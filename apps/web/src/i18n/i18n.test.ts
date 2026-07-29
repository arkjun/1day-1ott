import { createInstance } from "i18next";
import { describe, expect, it } from "vitest";
import { monthLabel, yearLabel } from "./format";
import { LANGS, resources } from "./locales";

/** 중첩 객체를 점(.) 키로 평탄화. 복수형 접미사(_one/_other/_zero/_two/_few/_many)는 제거해 논리 키만 비교. */
function baseKeys(obj: Record<string, unknown>, prefix = ""): Set<string> {
  const out = new Set<string>();
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") {
      for (const bk of baseKeys(v as Record<string, unknown>, key)) out.add(bk);
    } else {
      out.add(key.replace(/_(zero|one|two|few|many|other)$/, ""));
    }
  }
  return out;
}

describe("로케일 사전 파리티", () => {
  const ref = baseKeys(resources.ko.translation as Record<string, unknown>);

  it("ko/en/ja 가 동일한 논리 키 집합을 가진다", () => {
    for (const lng of LANGS) {
      const keys = baseKeys(resources[lng].translation as Record<string, unknown>);
      const missing = [...ref].filter((k) => !keys.has(k));
      const extra = [...keys].filter((k) => !ref.has(k));
      expect({ lng, missing, extra }).toEqual({ lng, missing: [], extra: [] });
    }
  });

  it("빈 문자열 값이 없다", () => {
    for (const lng of LANGS) {
      const flat = flatten(resources[lng].translation as Record<string, unknown>);
      for (const [k, v] of Object.entries(flat)) {
        expect(v, `${lng}:${k}`).not.toBe("");
      }
    }
  });
});

describe("서비스명", () => {
  it("언어별 표기를 사용한다", () => {
    expect(resources.ko.translation.common.serviceName).toBe("1일 1OTT");
    expect(resources.en.translation.common.serviceName).toBe("1DAY 1OTT");
    expect(resources.ja.translation.common.serviceName).toBe("1日 1OTT");
  });
});

describe("복수형(i18next)", () => {
  function t(lng: string) {
    const i = createInstance();
    i.init({ lng, fallbackLng: "ko", resources, interpolation: { escapeValue: false } });
    return i.t.bind(i);
  }

  it("영어는 단/복수를 구분한다", () => {
    const en = t("en");
    expect(en("count.entry", { count: 1 })).toBe("1 entry");
    expect(en("count.entry", { count: 3 })).toBe("3 entries");
  });

  it("한국어는 수량과 무관하게 조수사가 동일하다", () => {
    const ko = t("ko");
    expect(ko("count.entry", { count: 1 })).toBe("1편");
    expect(ko("count.entry", { count: 3 })).toBe("3편");
  });

  it("일본어 조수사", () => {
    const ja = t("ja");
    expect(ja("count.entry", { count: 3 })).toBe("3本");
  });
});

describe("월/연 포맷", () => {
  it("월 라벨은 로케일별로 다르다", () => {
    expect(monthLabel(7, "ko")).toBe("7월");
    expect(monthLabel(7, "ja")).toBe("7月");
    expect(monthLabel(7, "en")).toBe("Jul");
  });

  it("연 라벨", () => {
    expect(yearLabel(2026, "ko")).toBe("2026년");
    expect(yearLabel(2026, "ja")).toBe("2026年");
    expect(yearLabel(2026, "en")).toBe("2026");
  });
});

function flatten(obj: Record<string, unknown>, prefix = ""): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") Object.assign(out, flatten(v as Record<string, unknown>, key));
    else out[key] = v;
  }
  return out;
}
