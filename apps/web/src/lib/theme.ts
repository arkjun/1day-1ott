import { useEffect, useState } from "react";
import { prefersDark } from "./heatmap";

function resolvedTheme(): "light" | "dark" {
  const t = document.documentElement.dataset.theme;
  if (t === "dark" || t === "light") return t;
  return prefersDark();
}

/** 현재 해석된 테마 + 토글. data-theme 를 root 에 찍고 localStorage 에 저장. */
export function useTheme() {
  const [resolved, setResolved] = useState<"light" | "dark">(resolvedTheme);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setResolved(resolvedTheme());
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const toggle = () => {
    const next = resolved === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {
      /* ignore */
    }
    setResolved(next);
  };

  return { resolved, toggle };
}
