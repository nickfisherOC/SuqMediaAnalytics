"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

export interface Slide {
  key: string;
  /** Small label above the slide, e.g. "PeopleSuq · Scoreboard". */
  kicker: string;
  accent?: { light: string; dark: string };
  node: React.ReactNode;
}

/** One section per slide. → / Space / Page Down next, ← / Page Up back, F full screen, Esc leaves. */
export function Slides({ slides, exitHref }: { slides: Slide[]; exitHref: string }) {
  const router = useRouter();
  const [i, setI] = useState(0);
  const go = useCallback((d: number) => setI((x) => Math.min(slides.length - 1, Math.max(0, x + d))), [slides.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (["ArrowRight", "PageDown", " "].includes(e.key)) {
        e.preventDefault();
        go(1);
      } else if (["ArrowLeft", "PageUp"].includes(e.key)) {
        e.preventDefault();
        go(-1);
      } else if (e.key === "Home") setI(0);
      else if (e.key === "End") setI(slides.length - 1);
      else if (e.key.toLowerCase() === "f") void document.documentElement.requestFullscreen?.().catch(() => {});
      else if (e.key === "Escape" && !document.fullscreenElement) router.push(exitHref);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, router, exitHref, slides.length]);

  const s = slides[i];
  return (
    <div className="flex min-h-dvh flex-col bg-page">
      <div
        className="brand-scope flex flex-1 flex-col gap-6 px-6 py-8 sm:px-12 lg:px-20"
        style={s.accent ? ({ "--brand-light": s.accent.light, "--brand-dark": s.accent.dark } as React.CSSProperties) : undefined}
      >
        <p className="flex items-center gap-3 text-lg font-semibold text-ink-2">
          <span aria-hidden className="h-6 w-1.5 rounded-full bg-accent" />
          {s.kicker}
        </p>
        <div className="flex-1 text-lg [&_.text-5xl]:text-6xl" aria-live="polite">
          {s.node}
        </div>
      </div>
      <nav className="flex items-center justify-between gap-4 border-t border-line px-6 py-3 text-sm text-muted sm:px-12" aria-label="Slides">
        <button type="button" onClick={() => go(-1)} disabled={i === 0} className="rounded-lg px-3 py-1.5 hover:bg-surface-2 disabled:opacity-40">
          ← Back
        </button>
        <span>
          {i + 1} / {slides.length} · arrow keys to move · F for full screen · Esc to leave
        </span>
        <button
          type="button"
          onClick={() => go(1)}
          disabled={i === slides.length - 1}
          className="rounded-lg px-3 py-1.5 hover:bg-surface-2 disabled:opacity-40"
        >
          Next →
        </button>
      </nav>
    </div>
  );
}
