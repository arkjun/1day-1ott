import type { PublicUserSummary } from "@1ott/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import { useSession } from "../lib/authClient";
import { Avatar } from "./Avatar";

type ListDirection = "followers" | "following";

interface ProfileFollowsProps {
  username: string;
  followerCount: number;
  followingCount: number;
  onFollowerCountChange: (count: number) => void;
}

export function ProfileFollows({
  username,
  followerCount,
  followingCount,
  onFollowerCountChange,
}: ProfileFollowsProps) {
  const { t } = useTranslation();
  const { data: session, isPending: sessionPending } = useSession();
  const sessionUserId = session?.user.id;
  const [status, setStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [isSelf, setIsSelf] = useState(false);
  const [following, setFollowing] = useState(false);
  const [changing, setChanging] = useState(false);
  const [changeError, setChangeError] = useState(false);
  const [listDirection, setListDirection] =
    useState<ListDirection | null>(null);
  const listTriggerRef = useRef<HTMLButtonElement | null>(null);
  const closeList = useCallback(() => setListDirection(null), []);

  useEffect(() => {
    if (sessionPending) return;
    if (!sessionUserId) {
      setStatus("idle");
      return;
    }
    let active = true;
    setStatus("loading");
    api
      .followStatus(username)
      .then((result) => {
        if (!active) return;
        setIsSelf(result.isSelf);
        setFollowing(result.following);
        setStatus("ready");
      })
      .catch(() => {
        if (active) setStatus("error");
      });
    return () => {
      active = false;
    };
  }, [sessionPending, sessionUserId, username]);

  async function toggleFollow() {
    setChanging(true);
    setChangeError(false);
    try {
      const result = following
        ? await api.unfollow(username)
        : await api.follow(username);
      setFollowing(result.following);
      onFollowerCountChange(result.followerCount);
    } catch {
      setChangeError(true);
    } finally {
      setChanging(false);
    }
  }

  const buttonMode = sessionPending
    ? "loading"
    : !sessionUserId
      ? "loggedOut"
      : status === "loading"
        ? "loading"
        : status === "error"
          ? "error"
          : isSelf
            ? "self"
            : "ready";

  return (
    <div style={styles.wrap}>
      <div style={styles.counts}>
        <button
          type="button"
          style={styles.countButton}
          onClick={(event) => {
            listTriggerRef.current = event.currentTarget;
            setListDirection("followers");
          }}
        >
          <b>{followerCount}</b> {t("follow.followers")}
        </button>
        <span aria-hidden="true">·</span>
        <button
          type="button"
          style={styles.countButton}
          onClick={(event) => {
            listTriggerRef.current = event.currentTarget;
            setListDirection("following");
          }}
        >
          <b>{followingCount}</b> {t("follow.followingCount")}
        </button>
      </div>
      <FollowButtonView
        mode={buttonMode}
        following={following}
        changing={changing}
        changeError={changeError}
        onToggle={toggleFollow}
      />
      {listDirection ? (
        <FollowListDialog
          key={listDirection}
          username={username}
          direction={listDirection}
          returnFocusTarget={listTriggerRef.current}
          onClose={closeList}
        />
      ) : null}
    </div>
  );
}

interface FollowButtonViewProps {
  mode: "loggedOut" | "self" | "loading" | "ready" | "error";
  following: boolean;
  changing: boolean;
  changeError: boolean;
  onToggle: () => void;
}

export function FollowButtonView({
  mode,
  following,
  changing,
  changeError,
  onToggle,
}: FollowButtonViewProps) {
  const { t } = useTranslation();
  if (mode === "self") return null;
  if (mode === "loggedOut") {
    return (
      <a href="/" style={styles.loginLink}>
        {t("follow.loginToFollow")}
      </a>
    );
  }
  if (mode === "error") {
    return <span style={styles.error}>{t("follow.loadFailed")}</span>;
  }
  if (mode === "loading") {
    return (
      <button type="button" style={styles.disabledButton} disabled>
        {t("common.loading")}
      </button>
    );
  }

  return (
    <div>
      <button
        type="button"
        style={following ? styles.followingButton : styles.followButton}
        disabled={changing}
        aria-pressed={following}
        title={following ? t("follow.unfollow") : undefined}
        onClick={onToggle}
      >
        {changing
          ? t("follow.changing")
          : following
            ? t("follow.following")
            : t("follow.follow")}
      </button>
      {changeError ? (
        <span role="status" style={styles.changeError}>
          {t("follow.changeFailed")}
        </span>
      ) : null}
    </div>
  );
}

interface FollowListDialogProps {
  username: string;
  direction: ListDirection;
  returnFocusTarget: HTMLElement | null;
  onClose: () => void;
}

function FollowListDialog({
  username,
  direction,
  returnFocusTarget,
  onClose,
}: FollowListDialogProps) {
  const [users, setUsers] = useState<PublicUserSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    let active = true;
    api
      .followList(username, direction)
      .then((result) => {
        if (!active) return;
        setUsers(result.users);
        setCursor(result.nextCursor);
        setState("ready");
      })
      .catch(() => {
        if (active) setState("error");
      });
    return () => {
      active = false;
    };
  }, [direction, retryToken, username]);

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      returnFocusTarget?.focus();
    };
  }, [onClose, returnFocusTarget]);

  async function loadMore() {
    if (!cursor) return;
    setState("loading");
    try {
      const result = await api.followList(username, direction, cursor);
      setUsers((current) => [...current, ...result.users]);
      setCursor(result.nextCursor);
      setState("ready");
    } catch {
      setState("error");
    }
  }

  function retry() {
    if (users.length > 0 && cursor) {
      void loadMore();
      return;
    }
    setState("loading");
    setRetryToken((current) => current + 1);
  }

  return (
    <FollowListView
      direction={direction}
      users={users}
      state={state}
      hasMore={cursor != null}
      onClose={onClose}
      onLoadMore={loadMore}
      onRetry={retry}
    />
  );
}

interface FollowListViewProps {
  direction: ListDirection;
  users: PublicUserSummary[];
  state: "loading" | "ready" | "error";
  hasMore: boolean;
  onClose: () => void;
  onLoadMore: () => void;
  onRetry: () => void;
}

export function FollowListView({
  direction,
  users,
  state,
  hasMore,
  onClose,
  onLoadMore,
  onRetry,
}: FollowListViewProps) {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const title =
    direction === "followers"
      ? t("follow.followers")
      : t("follow.followingCount");
  const empty =
    direction === "followers"
      ? t("follow.noFollowers")
      : t("follow.noFollowing");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || typeof dialog.showModal !== "function") return;
    dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="follow-list-dialog"
      aria-modal="true"
      aria-labelledby="follow-list-title"
      style={styles.dialog}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div style={styles.dialogHeader}>
        <h2 id="follow-list-title" style={styles.dialogTitle}>
          {title}
        </h2>
        <button
          type="button"
          style={styles.closeButton}
          aria-label={t("common.close")}
          autoFocus
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <div style={styles.userList}>
        {users.map((user) => (
          <a
            key={user.username}
            href={`/@${encodeURIComponent(user.username)}`}
            style={styles.userRow}
          >
            <Avatar
              src={user.avatarUrl}
              alt={t("profile.avatarAlt", { name: user.name })}
              size={44}
            />
            <span style={styles.userBody}>
              <b>{user.name}</b>
              <span style={styles.muted}>@{user.username}</span>
              {user.bio ? <span style={styles.bio}>{user.bio}</span> : null}
            </span>
          </a>
        ))}
        {state === "ready" && users.length === 0 ? (
          <p style={styles.empty}>{empty}</p>
        ) : null}
      </div>
      {direction === "followers" ? (
        <p style={styles.policy}>{t("follow.privateOmitted")}</p>
      ) : null}
      {state === "error" ? (
        <div role="status" style={styles.error}>
          <p>{t("follow.listFailed")}</p>
          <button
            type="button"
            style={styles.moreButton}
            onClick={onRetry}
          >
            {t("follow.retry")}
          </button>
        </div>
      ) : null}
      {state === "loading" ? (
        <p style={styles.muted}>{t("common.loading")}</p>
      ) : null}
      {state === "ready" && hasMore ? (
        <button
          type="button"
          style={styles.moreButton}
          onClick={onLoadMore}
        >
          {t("follow.more")}
        </button>
      ) : null}
    </dialog>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
    marginTop: 12,
  },
  counts: {
    display: "flex",
    alignItems: "center",
    gap: 7,
    color: "var(--muted)",
    fontSize: 13,
  },
  countButton: {
    padding: 0,
    border: 0,
    background: "transparent",
    color: "inherit",
    fontSize: "inherit",
  },
  loginLink: {
    padding: "7px 12px",
    border: "1px solid var(--border)",
    borderRadius: 9,
    color: "inherit",
    fontSize: 13,
    fontWeight: 700,
    textDecoration: "none",
  },
  followButton: {
    padding: "7px 14px",
    border: 0,
    borderRadius: 9,
    background: "var(--accent)",
    color: "#fff",
    fontWeight: 700,
  },
  followingButton: {
    padding: "7px 14px",
    border: "1px solid var(--border)",
    borderRadius: 9,
    background: "var(--surface)",
    color: "inherit",
    fontWeight: 700,
  },
  disabledButton: {
    padding: "7px 14px",
    border: "1px solid var(--border)",
    borderRadius: 9,
    background: "var(--surface-2)",
    color: "var(--muted)",
  },
  changeError: {
    display: "block",
    marginTop: 4,
    color: "crimson",
    fontSize: 12,
  },
  dialog: {
    position: "fixed",
    inset: 0,
    width: "min(480px, 100%)",
    maxHeight: "min(680px, calc(100vh - 40px))",
    margin: "auto",
    padding: 18,
    overflowY: "auto",
    border: "1px solid var(--border)",
    borderRadius: 14,
    background: "var(--surface)",
    color: "var(--text)",
    boxShadow: "0 24px 80px rgba(0,0,0,0.3)",
  },
  dialogHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 8,
  },
  dialogTitle: { margin: 0, fontSize: 19 },
  closeButton: {
    width: 36,
    height: 36,
    border: 0,
    borderRadius: 9,
    background: "var(--surface-2)",
    color: "inherit",
    fontSize: 22,
  },
  userList: { display: "grid" },
  userRow: {
    display: "flex",
    gap: 11,
    padding: "11px 0",
    borderBottom: "1px solid var(--border)",
    color: "inherit",
    textDecoration: "none",
  },
  userBody: { display: "grid", minWidth: 0 },
  muted: { color: "var(--muted)", fontSize: 12 },
  bio: {
    overflow: "hidden",
    color: "var(--muted)",
    fontSize: 13,
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  empty: {
    margin: "24px 0",
    color: "var(--muted)",
    textAlign: "center",
  },
  policy: { margin: "12px 0 0", color: "var(--muted)", fontSize: 11 },
  error: { color: "crimson", fontSize: 12 },
  moreButton: {
    width: "100%",
    marginTop: 12,
    padding: "9px 12px",
    border: "1px solid var(--border)",
    borderRadius: 9,
    background: "var(--surface-2)",
    color: "inherit",
    fontWeight: 700,
  },
};
