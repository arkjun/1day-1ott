/** 콘텐츠 유형별 표시 메타. bar 는 CSS 그라디언트(막대/게이지), color 는 SVG 등 단색용. */
export const TYPE_META: Record<string, { label: string; bar: string; color: string }> = {
  movie: { label: "영화", bar: "linear-gradient(90deg,#ff5a36,#ff8a5c)", color: "#ff5a36" },
  tv: { label: "드라마", bar: "linear-gradient(90deg,#2f7bff,#5aa0ff)", color: "#2f7bff" },
  variety: { label: "예능", bar: "linear-gradient(90deg,#f5a623,#ffc45c)", color: "#f5a623" },
  anime: { label: "애니", bar: "linear-gradient(90deg,#37b25c,#63d987)", color: "#37b25c" },
  // color 는 스택 그래프에서 movie(#ff5a36)와 구분되도록 어두운 레드.
  youtube: { label: "유튜브", bar: "linear-gradient(90deg,#ff3d3d,#ff7a7a)", color: "#c11c1c" },
  other: { label: "직접입력", bar: "linear-gradient(90deg,#8a94a3,#b3bcc9)", color: "#8a94a3" },
};
