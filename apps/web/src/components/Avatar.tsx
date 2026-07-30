import { useState } from "react";

export function Avatar({
  src,
  alt,
  size = 72,
}: {
  src: string;
  alt: string;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  const style: React.CSSProperties = {
    width: size,
    height: size,
    flex: `0 0 ${size}px`,
    borderRadius: "50%",
    border: "1px solid var(--border)",
    background: "var(--surface-2)",
  };

  if (failed) {
    return (
      <span
        role="img"
        aria-label={alt}
        style={{
          ...style,
          display: "grid",
          placeItems: "center",
          color: "#fff",
          background: "linear-gradient(145deg, #2f8f62, #173f32)",
          fontSize: size * 0.42,
        }}
      >
        1
      </span>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      width={size}
      height={size}
      onError={() => setFailed(true)}
      style={{ ...style, display: "block", objectFit: "cover" }}
    />
  );
}
