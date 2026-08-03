import type {
  NoteReactionEmoji,
  NoteReactionSummary,
  PublicNote,
  PublicProfile as Profile,
} from "@1ott/shared";
import { noteReactionEmojis } from "@1ott/shared";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import ActivityCalendar from "react-activity-calendar";
import { api } from "../lib/api";
import { activityLabels } from "../i18n/format";
import { LanguageSelect } from "./LanguageSelect";
import { GREEN, buildYear, currentStreak, isoDaysAgo } from "../lib/heatmap";
import { useTheme } from "../lib/theme";
import { updatePageMetadata } from "../lib/seo";
import { REACTION_META } from "../lib/reactions";
import { Avatar } from "./Avatar";
import { ProfileFollows } from "./ProfileFollows";

interface PublicProfileActionsProps {
  scheme: "light" | "dark";
  copied: boolean;
  onToggle: () => void;
  onCopyLink: () => void;
}

export function PublicProfileActions({
  scheme,
  copied,
  onToggle,
  onCopyLink,
}: PublicProfileActionsProps) {
  const { t } = useTranslation();

  return (
    <div style={{ display: "flex", gap: 8 }}>
      <LanguageSelect />
      <button
        style={st.iconBtn}
        onClick={onToggle}
        aria-label={t("action.toggleTheme")}
        title={t("action.toggleTheme")}
      >
        {scheme === "dark" ? "☀️" : "🌙"}
      </button>
      <button style={st.ghost} onClick={onCopyLink}>
        {copied ? t("common.copied") : t("share.copyLink")}
      </button>
    </div>
  );
}

export function ProfileHeader({ profile }: { profile: Profile }) {
  const { t } = useTranslation();
  return (
    <div style={st.profileHeader}>
      <Avatar
        src={profile.avatarUrl}
        alt={t("profile.avatarAlt", { name: profile.name })}
        size={76}
      />
      <div style={{ minWidth: 0 }}>
        <h1 style={{ margin: 0, overflowWrap: "anywhere" }}>{profile.name}</h1>
        <div style={st.profileMeta}>
          <span>@{profile.username}</span>
          {profile.federationEnabled ? (
            <span style={st.federationBadge}>
              🌐 {t("profile.federationEnabled")}
            </span>
          ) : null}
        </div>
        {profile.bio ? <p style={st.bio}>{profile.bio}</p> : null}
      </div>
    </div>
  );
}

export function PublicProfile({ username }: { username: string }) {
  const { t, i18n } = useTranslation();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "notfound">("loading");
  const [copied, setCopied] = useState(false);
  const [pendingReactionEntryId, setPendingReactionEntryId] = useState<
    string | null
  >(null);
  const [reactionError, setReactionError] = useState<string | null>(null);
  const { resolved: scheme, toggle } = useTheme();

  // 언어가 바뀌면 포스터 제목도 그 언어로 다시 받아온다.
  useEffect(() => {
    api
      .publicProfile(username)
      .then((p) => {
        setProfile(p);
        setState("ok");
      })
      .catch(() => setState("notfound"));
  }, [username, i18n.language]);

  useEffect(() => {
    if (state === "notfound") {
      updatePageMetadata(
        window.location.pathname,
        i18n.resolvedLanguage ?? i18n.language,
        {
          title: `${t("profile.notFoundTitle")} | ${t("common.serviceName")}`,
          robots: "noindex,nofollow",
        },
      );
      return;
    }
    if (!profile) return;
    updatePageMetadata(
      window.location.pathname,
      i18n.resolvedLanguage ?? i18n.language,
      {
        title: `${t("seo.profileTitle", { username: profile.username })} | ${t("common.serviceName")}`,
        description: profile.bio ?? t("seo.profileDescription", {
          username: profile.username,
          count: profile.total,
        }),
      },
    );
  }, [i18n.language, i18n.resolvedLanguage, profile, state, t]);

  if (state === "loading") return <p style={{ padding: 24 }}>{t("common.loading")}</p>;
  if (state === "notfound" || !profile)
    return (
      <div style={{ maxWidth: 480, margin: "80px auto", padding: 24, textAlign: "center" }}>
        <h2>{t("profile.notFoundTitle")}</h2>
        <p style={{ color: "var(--muted)" }}>{t("profile.notFoundBody")}</p>
        <a href="/">{t("profile.toHome")}</a>
      </div>
    );

  const cells = profile.cells;
  const streak = currentStreak(cells);
  const thisMonth = cells
    .filter((c) => c.date.startsWith(isoDaysAgo(0).slice(0, 7)))
    .reduce((a, c) => a + c.count, 0);
  const year = buildYear(cells);

  async function copyLink() {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function updateNoteReaction(
    entryId: string,
    emoji: NoteReactionEmoji,
    remove: boolean,
  ) {
    setPendingReactionEntryId(entryId);
    setReactionError(null);
    try {
      const result = remove
        ? await api.removeNoteReaction(entryId, emoji)
        : await api.reactToNote(entryId, emoji);
      setProfile((current) =>
        current
          ? {
              ...current,
              notes: current.notes.map((note) =>
                note.id === entryId
                  ? { ...note, reactions: result.reactions }
                  : note,
              ),
            }
          : current,
      );
    } catch {
      setReactionError(t("noteReaction.failed"));
    } finally {
      setPendingReactionEntryId(null);
    }
  }

  return (
    <div style={st.wrap}>
      <div style={st.top}>
        <div>
          <div style={{ fontSize: 12, color: "#8890a0" }}>
            🌱 {t("common.serviceName")}
          </div>
          <ProfileHeader profile={profile} />
          <ProfileFollows
            username={profile.username}
            followerCount={profile.followerCount}
            followingCount={profile.followingCount}
            onFollowerCountChange={(followerCount) =>
              setProfile((current) =>
                current ? { ...current, followerCount } : current,
              )
            }
          />
        </div>
        <PublicProfileActions
          scheme={scheme}
          copied={copied}
          onToggle={toggle}
          onCopyLink={copyLink}
        />
      </div>

      <div style={st.stats}>
        <Stat k={t("stat.streak")} v={streak} unit={t("unit.day", { count: streak })} accent />
        <Stat k={t("stat.thisMonth")} v={thisMonth} unit={t("unit.entry", { count: thisMonth })} />
        <Stat k={t("stat.total")} v={profile.total} unit={t("unit.entry", { count: profile.total })} />
      </div>

      <div style={st.card}>
        <div style={st.cardHead}>
          <b>{t("heatmap.title")}</b>
          <span style={st.muted}>{t("heatmap.hint")}</span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <ActivityCalendar
            data={year}
            colorScheme={scheme}
            theme={GREEN}
            blockSize={12}
            blockMargin={3}
            labels={activityLabels(i18n.language)}
          />
        </div>
      </div>

      {profile.posters.length > 0 && (
        <div style={st.card}>
          <div style={st.cardHead}>
            <b>{t("posters.title")}</b>
          </div>
          <div style={st.posterGrid}>
            {profile.posters
              .filter((p) => p.posterUrl)
              .map((p) => (
                <a key={p.id} href={`/c/${p.contentId}`} style={{ display: "block" }}>
                  <img src={p.posterUrl!} alt={p.title} title={p.title} style={st.poster} />
                </a>
              ))}
          </div>
        </div>
      )}

      <PublicNotes
        notes={profile.notes}
        canReact={profile.canReact}
        pendingEntryId={pendingReactionEntryId}
        error={reactionError}
        onReact={updateNoteReaction}
      />
    </div>
  );
}

const noteReactionEmojiSet = new Set<string>(noteReactionEmojis);

function ReactionGlyph({
  summary,
}: {
  summary: Pick<NoteReactionSummary, "emoji">;
}) {
  return <span>{summary.emoji}</span>;
}

function ReactionPickerIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="10" cy="12" r="7" />
      <path d="M7.5 10h.01M12.5 10h.01M7.5 14.5c1.4 1.1 3.6 1.1 5 0" />
      <path d="M19 3v6M16 6h6" />
    </svg>
  );
}

export function PublicNotes({
  notes,
  canReact,
  pendingEntryId,
  error,
  onReact,
}: {
  notes: PublicNote[];
  canReact: boolean;
  pendingEntryId: string | null;
  error?: string | null;
  onReact: (
    entryId: string,
    emoji: NoteReactionEmoji,
    remove: boolean,
  ) => void;
}) {
  const { t } = useTranslation();
  const [reactionPickerEntryId, setReactionPickerEntryId] = useState<
    string | null
  >(null);
  const reactionPickerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!reactionPickerEntryId) return;

    function closeOnOutsidePress(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        !reactionPickerRef.current?.contains(event.target)
      ) {
        setReactionPickerEntryId(null);
      }
    }

    document.addEventListener("pointerdown", closeOnOutsidePress);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePress);
  }, [reactionPickerEntryId]);

  if (notes.length === 0) return null;

  return (
    <div style={st.card}>
      <div style={st.cardHead}>
        <b>{t("note.publicTitle")}</b>
      </div>
      <div>
        {notes.map((entry) => {
          const standardReactions = entry.reactions.filter(
            (reaction) =>
              noteReactionEmojiSet.has(reaction.emoji) &&
              reaction.imageUrl == null,
          );
          const remoteReactions = entry.reactions.filter(
            (reaction) =>
              !noteReactionEmojiSet.has(reaction.emoji) ||
              reaction.imageUrl != null,
          );
          const pickerOpen = reactionPickerEntryId === entry.id;

          return (
            <article key={entry.id} style={st.noteRow}>
              {entry.posterUrl ? (
                <a href={`/c/${entry.contentId}`} style={st.notePosterLink}>
                  <img
                    src={entry.posterUrl}
                    alt=""
                    loading="lazy"
                    style={st.notePoster}
                  />
                </a>
              ) : null}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={st.noteMeta}>
                  <a href={`/c/${entry.contentId}`} style={st.noteTitle}>
                    {entry.title}
                  </a>
                  {entry.channelName ? <span>{entry.channelName}</span> : null}
                  <span>{entry.watchedOn}</span>
                  {entry.reaction ? (
                    <span title={t(`reaction.${entry.reaction}`)}>
                      {REACTION_META[entry.reaction].emoji}
                    </span>
                  ) : null}
                </div>
                <p style={st.noteBody}>{entry.note}</p>
                <div
                  role="group"
                  aria-label={t("noteReaction.group")}
                  style={st.noteReactions}
                >
                  {standardReactions.map((summary) => {
                    const emoji = summary.emoji as NoteReactionEmoji;
                    const remoteTitle =
                      summary.remoteCount > 0
                        ? t("noteReaction.federatedCount", {
                            count: summary.remoteCount,
                          })
                        : undefined;
                    return (
                      <button
                        key={emoji}
                        type="button"
                        style={{
                          ...st.reactionButton,
                          ...(summary.reactedByMe
                            ? st.reactionButtonActive
                            : {}),
                        }}
                        aria-label={t("noteReaction.react", { emoji })}
                        aria-pressed={summary.reactedByMe}
                        title={
                          remoteTitle ??
                          (canReact
                            ? t("noteReaction.react", { emoji })
                            : t("noteReaction.loginToReact"))
                        }
                        disabled={!canReact || pendingEntryId != null}
                        onClick={() =>
                          onReact(entry.id, emoji, summary.reactedByMe)
                        }
                      >
                        <span>{emoji}</span>
                        <span>{summary.count}</span>
                        {summary.remoteCount > 0 ? (
                          <span
                            aria-label={t("noteReaction.federatedCount", {
                              count: summary.remoteCount,
                            })}
                            style={st.remoteCount}
                          >
                            🌐{summary.remoteCount}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                  {remoteReactions.map((summary) => (
                    <span
                      key={`${summary.emoji}\n${summary.imageUrl ?? ""}`}
                      style={st.remoteReaction}
                      title={t("noteReaction.federatedCount", {
                        count: summary.remoteCount,
                      })}
                    >
                      <ReactionGlyph summary={summary} />
                      <span>{summary.count}</span>
                      <span
                        aria-label={t("noteReaction.federatedCount", {
                          count: summary.remoteCount,
                        })}
                        style={st.remoteCount}
                      >
                        🌐{summary.remoteCount}
                      </span>
                    </span>
                  ))}
                  <div
                    ref={pickerOpen ? reactionPickerRef : undefined}
                    style={st.reactionPickerWrap}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        setReactionPickerEntryId(null);
                        event.currentTarget.querySelector("button")?.focus();
                      }
                    }}
                  >
                    <button
                      type="button"
                      style={st.reactionAddButton}
                      aria-label={t("noteReaction.add")}
                      aria-expanded={pickerOpen}
                      aria-haspopup="true"
                      title={
                        canReact
                          ? t("noteReaction.add")
                          : t("noteReaction.loginToReact")
                      }
                      disabled={!canReact || pendingEntryId != null}
                      onClick={() =>
                        setReactionPickerEntryId((current) =>
                          current === entry.id ? null : entry.id,
                        )
                      }
                    >
                      <ReactionPickerIcon />
                    </button>
                    {pickerOpen ? (
                      <div
                        role="group"
                        aria-label={t("noteReaction.picker")}
                        style={st.reactionPicker}
                      >
                        {noteReactionEmojis.map((emoji) => {
                          const summary = standardReactions.find(
                            (reaction) => reaction.emoji === emoji,
                          );
                          return (
                            <button
                              key={emoji}
                              type="button"
                              style={{
                                ...st.reactionChoice,
                                ...(summary?.reactedByMe
                                  ? st.reactionChoiceActive
                                  : {}),
                              }}
                              aria-label={t("noteReaction.react", { emoji })}
                              aria-pressed={summary?.reactedByMe ?? false}
                              disabled={pendingEntryId != null}
                              onClick={() => {
                                setReactionPickerEntryId(null);
                                onReact(
                                  entry.id,
                                  emoji,
                                  summary?.reactedByMe ?? false,
                                );
                              }}
                            >
                              {emoji}
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>
      {error ? (
        <p role="alert" style={st.reactionError}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

function Stat({ k, v, unit, accent }: { k: string; v: number; unit: string; accent?: boolean }) {
  return (
    <div style={st.tile}>
      <div style={st.tileK}>{k}</div>
      <div style={{ ...st.tileV, color: accent ? "#ff5a36" : "inherit" }}>
        {v}
        <small style={st.tileU}>{unit}</small>
      </div>
    </div>
  );
}

const st: Record<string, React.CSSProperties> = {
  wrap: { maxWidth: 920, margin: "0 auto", padding: "28px 20px 60px" },
  top: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap", marginBottom: 20 },
  profileHeader: { display: "flex", alignItems: "flex-start", gap: 14, marginTop: 8, maxWidth: 620 },
  profileMeta: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", color: "var(--muted)", marginTop: 2 },
  federationBadge: { display: "inline-flex", alignItems: "center", padding: "2px 7px", border: "1px solid var(--border)", borderRadius: 999, background: "var(--surface-2)", fontSize: 11, fontWeight: 600 },
  bio: { margin: "10px 0 0", lineHeight: 1.55, whiteSpace: "pre-wrap", overflowWrap: "anywhere" },
  stats: { display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 16 },
  tile: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "14px 16px", boxShadow: "var(--shadow)" },
  tileK: { fontSize: 12, color: "var(--muted)" },
  tileV: { marginTop: 6, fontSize: 28, fontWeight: 800, letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums" },
  tileU: { fontSize: 13, fontWeight: 600, color: "var(--muted)", marginLeft: 3 },
  card: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 18, marginBottom: 16, boxShadow: "var(--shadow)" },
  cardHead: { display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 },
  muted: { color: "var(--muted)", fontSize: 12 },
  posterGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(78px,1fr))", gap: 10 },
  poster: { width: "100%", aspectRatio: "2 / 3", objectFit: "cover", borderRadius: 8, border: "1px solid var(--border)" },
  noteRow: {
    display: "flex",
    gap: 12,
    padding: "12px 0",
    borderBottom: "1px solid var(--border)",
    contentVisibility: "auto",
    containIntrinsicSize: "80px",
  },
  notePosterLink: { display: "block", flex: "0 0 48px" },
  notePoster: {
    display: "block",
    width: 48,
    aspectRatio: "2 / 3",
    objectFit: "cover",
    borderRadius: 6,
    border: "1px solid var(--border)",
  },
  noteMeta: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    color: "var(--muted)",
    fontSize: 12,
  },
  noteTitle: { color: "inherit", fontWeight: 700 },
  noteBody: {
    margin: "6px 0 0",
    lineHeight: 1.6,
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
  },
  noteReactions: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
    marginTop: 10,
  },
  reactionButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    minHeight: 30,
    padding: "4px 8px",
    border: "1px solid var(--border)",
    borderRadius: 999,
    background: "var(--surface-2)",
    color: "inherit",
    fontSize: 12,
  },
  reactionButtonActive: {
    borderColor: "var(--accent)",
    background: "var(--accent-weak)",
  },
  reactionPickerWrap: {
    position: "relative",
    display: "inline-flex",
  },
  reactionAddButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 32,
    minHeight: 30,
    padding: 0,
    border: "1px solid var(--border)",
    borderRadius: 999,
    background: "var(--surface-2)",
    color: "var(--muted)",
  },
  reactionPicker: {
    position: "absolute",
    left: 0,
    bottom: "calc(100% + 6px)",
    zIndex: 10,
    display: "flex",
    gap: 2,
    padding: 6,
    border: "1px solid var(--border)",
    borderRadius: 10,
    background: "var(--surface)",
    boxShadow: "var(--shadow)",
  },
  reactionChoice: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 34,
    height: 34,
    padding: 0,
    border: 0,
    borderRadius: 7,
    background: "transparent",
    fontSize: 18,
  },
  reactionChoiceActive: {
    background: "var(--accent-weak)",
  },
  remoteReaction: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    minHeight: 30,
    padding: "4px 8px",
    boxSizing: "border-box",
    border: "1px solid var(--border)",
    borderRadius: 999,
    background: "var(--surface-2)",
    fontSize: 12,
  },
  remoteCount: { color: "var(--muted)", fontSize: 10 },
  reactionError: { margin: "10px 0 0", color: "crimson", fontSize: 13 },
  ghost: { border: "1px solid var(--border)", borderRadius: 10, padding: "9px 14px", background: "var(--surface)", color: "inherit" },
  iconBtn: { border: "1px solid var(--border)", borderRadius: 10, padding: "9px 12px", background: "var(--surface)", lineHeight: 1 },
};
