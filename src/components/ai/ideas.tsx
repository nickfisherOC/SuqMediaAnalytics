"use client";

import { useState, useTransition } from "react";
import { acceptRecommendation, rejectRecommendation } from "@/app/(app)/review-actions";
import type { Idea } from "@/lib/data/ai-summary";
import { OUTCOME_LABEL } from "@/lib/outcomes";

const EFFORT = { S: "Quick", M: "Half a day", L: "Bigger project" } as const;

function IdeaRow({ idea, readOnly }: { idea: Idea; readOnly: boolean }) {
  const [pending, start] = useTransition();
  const [owner, setOwner] = useState("");
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; message?: string }>) =>
    start(async () => {
      const r = await fn();
      setError(r.ok ? null : (r.message ?? "Couldn't save that."));
    });

  return (
    <li className={`flex flex-col gap-2 py-4 ${pending ? "opacity-60" : ""} ${idea.status === "rejected" ? "opacity-60" : ""}`}>
      <p className={`text-lg leading-snug font-semibold ${idea.status === "rejected" ? "line-through" : ""}`}>{idea.what}</p>
      <p className="text-ink-2">{idea.why}</p>
      <p className="text-xs text-muted">
        Aims to move {idea.target} {idea.direction} · {EFFORT[idea.effort]} · {idea.confidence} confidence
      </p>

      {idea.status === "proposed" && !readOnly && (
        <div className="no-print flex flex-wrap items-center gap-2">
          <input
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            placeholder="Who (optional)"
            aria-label={`Owner for: ${idea.what}`}
            className="h-9 w-40 rounded-lg border border-line bg-page px-3 text-sm"
          />
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => acceptRecommendation(idea.id, owner))}
            className="h-9 rounded-lg bg-ink px-3 text-sm font-semibold text-page disabled:opacity-60"
          >
            Do it: add to action items
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => rejectRecommendation(idea.id))}
            className="h-9 rounded-lg px-3 text-sm font-medium text-ink-2 hover:bg-surface-2 hover:text-ink"
          >
            Not now
          </button>
        </div>
      )}
      {idea.status === "accepted" && (
        <p className="text-sm font-medium text-good">
          Added to action items{idea.outcome ? ` · result: ${OUTCOME_LABEL[idea.outcome]}` : " · Pulse checks the result two weeks after it was added"}
        </p>
      )}
      {idea.status === "rejected" && <p className="text-sm text-muted">Passed on this one.</p>}
      {error && <p className="text-sm text-bad">{error}</p>}
    </li>
  );
}

/** The AI's ideas for the coming week. Accepting one makes it an action item with a before-number. */
export function Ideas({ ideas, readOnly = false }: { ideas: Idea[]; readOnly?: boolean }) {
  if (!ideas.length) return <p className="text-ink-2">No ideas yet. They come with the AI summary.</p>;
  return (
    <ul className="divide-y divide-line rounded-2xl border border-line bg-surface px-5">
      {ideas.map((i) => (
        <IdeaRow key={i.id} idea={i} readOnly={readOnly} />
      ))}
    </ul>
  );
}
