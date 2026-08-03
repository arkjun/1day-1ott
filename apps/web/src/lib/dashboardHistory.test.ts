import { describe, expect, it, vi } from "vitest";
import {
  ensureDashboardHistoryState,
  pushDashboardHistoryState,
  readDashboardHistoryState,
} from "./dashboardHistory";

function fakeHistory(initialState: unknown) {
  let state = initialState;
  const replaceState = vi.fn((nextState: unknown) => {
    state = nextState;
  });
  const pushState = vi.fn((nextState: unknown) => {
    state = nextState;
  });

  return {
    history: {
      get state() {
        return state;
      },
      replaceState,
      pushState,
    },
    replaceState,
    pushState,
  };
}

describe("dashboardHistory", () => {
  it("현재 항목을 홈 화면 상태로 초기화하면서 기존 상태를 보존한다", () => {
    const { history, replaceState } = fakeHistory({ existing: "value" });

    const state = ensureDashboardHistoryState(history);

    expect(state).toEqual({ view: "home", selectedDate: null });
    expect(replaceState).toHaveBeenCalledWith(
      {
        existing: "value",
        dashboard: { view: "home", selectedDate: null },
      },
      "",
    );
  });

  it("이미 대시보드 상태가 있으면 히스토리를 다시 쓰지 않는다", () => {
    const existing = {
      dashboard: { view: "all", selectedDate: "2026-08-02" },
    };
    const { history, replaceState } = fakeHistory(existing);

    expect(ensureDashboardHistoryState(history)).toEqual(existing.dashboard);
    expect(replaceState).not.toHaveBeenCalled();
  });

  it("날짜별 기록 화면을 새 히스토리 항목으로 추가한다", () => {
    const { history, pushState } = fakeHistory({ existing: "value" });

    pushDashboardHistoryState(history, {
      view: "all",
      selectedDate: "2026-08-02",
    });

    expect(pushState).toHaveBeenCalledWith(
      {
        existing: "value",
        dashboard: { view: "all", selectedDate: "2026-08-02" },
      },
      "",
    );
  });

  it("유효하지 않은 히스토리 상태는 무시한다", () => {
    expect(readDashboardHistoryState(null)).toBeNull();
    expect(readDashboardHistoryState({ dashboard: { view: "detail" } })).toBeNull();
    expect(
      readDashboardHistoryState({
        dashboard: { view: "all", selectedDate: 20260802 },
      }),
    ).toBeNull();
  });
});
