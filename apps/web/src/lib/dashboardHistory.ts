export type DashboardView = "home" | "calendar" | "all";

export interface DashboardHistoryState {
  view: DashboardView;
  selectedDate: string | null;
}

interface HistoryLike {
  readonly state: unknown;
  pushState(data: unknown, unused: string): void;
  replaceState(data: unknown, unused: string): void;
}

const DASHBOARD_STATE_KEY = "dashboard";
const HOME_STATE: DashboardHistoryState = {
  view: "home",
  selectedDate: null,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function withDashboardState(
  currentState: unknown,
  dashboardState: DashboardHistoryState,
) {
  return {
    ...(isRecord(currentState) ? currentState : {}),
    [DASHBOARD_STATE_KEY]: dashboardState,
  };
}

export function readDashboardHistoryState(
  state: unknown,
): DashboardHistoryState | null {
  if (!isRecord(state)) return null;
  const dashboardState = state[DASHBOARD_STATE_KEY];
  if (!isRecord(dashboardState)) return null;

  const { view, selectedDate } = dashboardState;
  if (view !== "home" && view !== "calendar" && view !== "all") return null;
  if (selectedDate !== null && typeof selectedDate !== "string") return null;

  return { view, selectedDate };
}

export function ensureDashboardHistoryState(
  history: HistoryLike,
): DashboardHistoryState {
  const current = readDashboardHistoryState(history.state);
  if (current) return current;

  history.replaceState(withDashboardState(history.state, HOME_STATE), "");
  return HOME_STATE;
}

export function pushDashboardHistoryState(
  history: HistoryLike,
  state: DashboardHistoryState,
) {
  history.pushState(withDashboardState(history.state, state), "");
}
