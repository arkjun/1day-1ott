/** 콘텐츠 유형별 색 메타. bar 는 CSS 그라디언트(막대/게이지), color 는 SVG 등 단색용.
 *  표시 라벨은 i18n(`type.*`)에서 가져온다. */
export const TYPE_META: Record<string, { bar: string; color: string }> = {
  movie: { bar: "linear-gradient(90deg,#ff5a36,#ff8a5c)", color: "#ff5a36" },
  tv: { bar: "linear-gradient(90deg,#2f7bff,#5aa0ff)", color: "#2f7bff" },
  variety: { bar: "linear-gradient(90deg,#f5a623,#ffc45c)", color: "#f5a623" },
  documentary: { bar: "linear-gradient(90deg,#8b5cf6,#a78bfa)", color: "#8b5cf6" },
  anime: { bar: "linear-gradient(90deg,#37b25c,#63d987)", color: "#37b25c" },
  // color 는 스택 그래프에서 movie(#ff5a36)와 구분되도록 어두운 레드.
  youtube: { bar: "linear-gradient(90deg,#ff3d3d,#ff7a7a)", color: "#c11c1c" },
  other: { bar: "linear-gradient(90deg,#8a94a3,#b3bcc9)", color: "#8a94a3" },
};
