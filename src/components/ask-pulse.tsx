"use client";

import { useEffect, useRef, useState } from "react";

interface Turn {
  role: "user" | "assistant";
  text: string;
  lookups?: string[];
  unverified?: string[];
  error?: boolean;
}

const SUGGESTIONS = [
  "Which series day got the most views across all platforms?",
  "Which deals have been sitting longest in their stage?",
  "What's SUQ Media's cost per lead this week vs last week?",
  "Which platform is growing followers fastest?",
];

const LOOKUP_LABEL: Record<string, string> = {
  get_metric: "metrics",
  get_top_content: "top content",
  get_pipeline: "pipeline",
  get_flags: "flags",
  get_notes_and_actions: "notes & actions",
  list_metrics: "metric list",
};

const STORAGE_KEY = "pulse-ask-history";

/** Renders the small amount of formatting answers use: **bold**, "- " bullets, paragraphs. */
function Rich({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/);
  const inline = (s: string) =>
    s.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
      part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : <span key={i}>{part}</span>,
    );
  return (
    <div className="flex flex-col gap-2">
      {blocks.map((b, i) => {
        const lines = b.split("\n");
        if (lines.every((l) => /^\s*[-•]\s+/.test(l))) {
          return (
            <ul key={i} className="ml-4 list-disc">
              {lines.map((l, j) => (
                <li key={j}>{inline(l.replace(/^\s*[-•]\s+/, ""))}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className="whitespace-pre-wrap">
            {inline(b)}
          </p>
        );
      })}
    </div>
  );
}

/** "Ask Pulse": a chat panel on every page that answers from Pulse's own numbers. */
export function AskPulse() {
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);

  // Keep the conversation while moving between pages (this tab only).
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) setTurns(JSON.parse(saved));
    } catch {}
  }, []);
  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(turns.slice(-30)));
    } catch {}
    end.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, busy]);
  useEffect(() => {
    if (open) box.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  async function send(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    const history = turns.filter((t) => !t.error).map(({ role, text }) => ({ role, text }));
    setTurns((t) => [...t, { role: "user", text: q }]);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: q, history }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      setTurns((t) => [
        ...t,
        {
          role: "assistant",
          text: data.answer,
          lookups: [...new Set((data.lookups as { name: string }[]).map((l) => LOOKUP_LABEL[l.name] ?? l.name))],
          unverified: data.unverified,
        },
      ]);
    } catch (e) {
      setTurns((t) => [...t, { role: "assistant", text: e instanceof Error ? e.message : "Something went wrong.", error: true }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="no-print">
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed right-4 bottom-4 z-40 flex items-center gap-2 rounded-full bg-accent px-5 py-3 font-semibold text-white shadow-lg hover:opacity-90"
          style={{ background: "var(--focus)" }}
        >
          <svg viewBox="0 0 20 20" className="size-5" aria-hidden>
            <path d="M3 4h14v9H8l-4 3v-3H3z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
          </svg>
          Ask Pulse
        </button>
      )}

      {open && (
        <aside
          role="dialog"
          aria-label="Ask Pulse"
          className="fixed inset-0 z-50 flex flex-col border-line bg-surface shadow-2xl sm:inset-auto sm:top-4 sm:right-4 sm:bottom-4 sm:w-[28rem] sm:rounded-2xl sm:border"
        >
          <header className="flex items-center justify-between border-b border-line px-4 py-3">
            <div>
              <h2 className="font-display text-lg font-extrabold">Ask Pulse</h2>
              <p className="text-xs text-muted">Answers come from Pulse&apos;s own numbers.</p>
            </div>
            <div className="flex items-center gap-1">
              {turns.length > 0 && (
                <button type="button" onClick={() => setTurns([])} className="rounded-lg px-2 py-1 text-xs text-muted hover:bg-surface-2 hover:text-ink">
                  Clear
                </button>
              )}
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="rounded-lg px-2 py-1 text-lg leading-none text-muted hover:bg-surface-2 hover:text-ink">
                ×
              </button>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto px-4 py-4">
            {turns.length === 0 ? (
              <div className="flex flex-col gap-2">
                <p className="text-sm text-ink-2">Ask anything about your numbers, content, ads or pipeline. For example:</p>
                {SUGGESTIONS.map((s) => (
                  <button key={s} type="button" onClick={() => send(s)} className="rounded-xl border border-line px-3 py-2 text-left text-sm hover:bg-surface-2">
                    {s}
                  </button>
                ))}
              </div>
            ) : (
              <ol className="flex flex-col gap-4">
                {turns.map((t, i) => (
                  <li key={i} className={t.role === "user" ? "self-end" : ""}>
                    {t.role === "user" ? (
                      <p className="max-w-[22rem] rounded-2xl rounded-br-sm bg-surface-2 px-3 py-2">{t.text}</p>
                    ) : (
                      <div className={`text-[15px] leading-relaxed ${t.error ? "text-bad" : ""}`}>
                        <Rich text={t.text} />
                        {t.lookups && t.lookups.length > 0 && <p className="mt-1.5 text-xs text-muted">Checked: {t.lookups.join(", ")}</p>}
                        {t.unverified && t.unverified.length > 0 && (
                          <p className="mt-1 text-xs text-bad">Couldn&apos;t confirm {t.unverified.join(", ")} against Pulse&apos;s data. Treat with care.</p>
                        )}
                      </div>
                    )}
                  </li>
                ))}
                {busy && (
                  <li className="text-sm text-muted" role="status">
                    Looking that up… (usually about 10 seconds)
                  </li>
                )}
              </ol>
            )}
            <div ref={end} />
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
            className="flex items-end gap-2 border-t border-line p-3"
          >
            <textarea
              ref={box}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send(input);
                }
              }}
              rows={2}
              placeholder="Ask a question…"
              aria-label="Your question"
              className="max-h-40 flex-1 resize-none rounded-xl border border-line bg-page px-3 py-2"
            />
            <button type="submit" disabled={busy || !input.trim()} className="h-10 rounded-xl bg-ink px-4 text-sm font-semibold text-page disabled:opacity-50">
              Ask
            </button>
          </form>
        </aside>
      )}
    </div>
  );
}
