"use client";

import { useOptimistic, useRef, useState, useTransition, type DragEvent } from "react";
import clsx from "clsx";
import { addJob, moveJob, removeJob, setDueDate, setRush, type ActionResult } from "@/app/production/actions";
import type { ISODate } from "@/lib/dates";
import { dueLabel, dueState, jobsInStep, placeJob, type ProductionJob, type ProductionStep } from "@/lib/production";

type Change = { id: string; fields: Partial<ProductionJob> } | { id: string; remove: true };

const EDGE: Record<ReturnType<typeof dueState>, string> = {
  overdue: "border-l-[color:var(--status-critical)]",
  today: "border-l-[color:var(--status-warning)]",
  soon: "border-l-[color:var(--status-warning)]",
  later: "border-l-line",
  none: "border-l-line",
};

const iconButton = "grid size-8 place-items-center rounded-md bg-surface-2 text-sm text-ink-2 hover:text-ink disabled:opacity-30";

/** The print queue: one column per step; drag cards (or use the arrows) to move them. */
export function ProductionBoard({ steps, jobs: serverJobs, today }: { steps: ProductionStep[]; jobs: ProductionJob[]; today: ISODate }) {
  const [jobs, apply] = useOptimistic(serverJobs, (state: ProductionJob[], c: Change) =>
    "remove" in c ? state.filter((j) => j.id !== c.id) : state.map((j) => (j.id === c.id ? { ...j, ...c.fields } : j)),
  );
  const [, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ stepId: string; index: number } | null>(null);

  const run = (change: Change, action: () => Promise<ActionResult>) =>
    start(async () => {
      apply(change);
      const r = await action();
      setError(r.ok ? null : (r.message ?? "That didn't save."));
    });

  const move = (job: ProductionJob, stepId: string, index: number) => {
    const to = placeJob(jobs, job.id, stepId, index);
    run({ id: job.id, fields: to }, () => moveJob(job.id, to.stepId, to.sortOrder, to.stepId !== job.stepId));
  };

  /** Where in a column the pointer is: the number of other cards above it. */
  const indexAt = (e: DragEvent<HTMLElement>) => {
    const cards = [...e.currentTarget.querySelectorAll<HTMLElement>("[data-job]")].filter((el) => el.dataset.job !== dragId);
    return cards.filter((el) => {
      const r = el.getBoundingClientRect();
      return e.clientY > r.top + r.height / 2;
    }).length;
  };

  const active = jobs.filter((j) => !steps.find((s) => s.id === j.stepId)?.isDone);
  const late = active.filter((j) => dueState(j.dueDate, today, false) === "overdue").length;
  const dueSoon = active.filter((j) => ["today", "soon"].includes(dueState(j.dueDate, today, false))).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <p className="text-lg text-ink-2">
          <span className="font-semibold text-ink">{active.length}</span> {active.length === 1 ? "job" : "jobs"} on the go
          {dueSoon > 0 && <> · <span className="font-semibold text-ink">{dueSoon}</span> due in the next 3 days</>}
          {late > 0 && <> · <span className="font-semibold text-bad">{late} late</span></>}
        </p>
        <AddJob onError={setError} />
      </div>
      {error && <p className="text-sm text-bad" role="alert">{error}</p>}

      <div className="grid grid-cols-1 gap-4 md:auto-cols-fr md:grid-flow-col">
        {steps.map((step, si) => {
          const list = jobsInStep(jobs, step.id);
          const showDrop = (i: number) => dragId && drop?.stepId === step.id && drop.index === i;
          return (
            <section
              key={step.id}
              aria-label={step.name}
              className={clsx("flex min-h-40 flex-col gap-2 rounded-2xl border border-line bg-surface p-3", drop?.stepId === step.id && "ring-2 ring-accent")}
              onDragOver={(e) => {
                if (!dragId) return;
                e.preventDefault();
                const index = indexAt(e);
                if (drop?.stepId !== step.id || drop.index !== index) setDrop({ stepId: step.id, index });
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setDrop(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                const job = jobs.find((j) => j.id === dragId);
                if (job) move(job, step.id, indexAt(e));
                setDragId(null);
                setDrop(null);
              }}
            >
              <h2 className="flex items-baseline justify-between px-1 text-sm font-semibold tracking-wide text-muted uppercase">
                {step.name}
                <span className="text-xs font-normal normal-case">{list.length}</span>
              </h2>
              {list.length === 0 && !dragId && <p className="px-1 py-4 text-sm text-muted">{step.isDone ? "Nothing finished in the last two weeks." : "Nothing here."}</p>}
              {list.map((job, i) => {
                const others = list.filter((j) => j.id !== dragId);
                return (
                  <div key={job.id}>
                    {showDrop(others.indexOf(job)) && <DropLine />}
                    <JobCard
                      job={job}
                      today={today}
                      done={step.isDone}
                      dragging={dragId === job.id}
                      onDragStart={() => setDragId(job.id)}
                      onDragEnd={() => {
                        setDragId(null);
                        setDrop(null);
                      }}
                      onUp={i > 0 ? () => move(job, step.id, i - 1) : undefined}
                      onDown={i < list.length - 1 ? () => move(job, step.id, i + 1) : undefined}
                      onBack={si > 0 ? () => move(job, steps[si - 1].id, Infinity) : undefined}
                      onNext={si < steps.length - 1 ? () => move(job, steps[si + 1].id, Infinity) : undefined}
                      nextName={steps[si + 1]?.name}
                      backName={steps[si - 1]?.name}
                      onRush={() => run({ id: job.id, fields: { rush: !job.rush } }, () => setRush(job.id, !job.rush))}
                      onDue={(d) => run({ id: job.id, fields: { dueDate: d || null } }, () => setDueDate(job.id, d))}
                      onRemove={() => confirm(`Take "${job.title}" off the board?`) && run({ id: job.id, remove: true }, () => removeJob(job.id))}
                    />
                  </div>
                );
              })}
              {showDrop(list.filter((j) => j.id !== dragId).length) && <DropLine />}
            </section>
          );
        })}
      </div>
      <p className="text-xs text-muted">
        Won deals in Lead Rescue are added to the first step overnight. Drag a card to move it, or use the arrows. 🔥 Rush jobs always sit at the top.
      </p>
    </div>
  );
}

function DropLine() {
  return <div aria-hidden className="mb-2 h-1 rounded-full bg-accent" />;
}

interface CardProps {
  job: ProductionJob;
  today: ISODate;
  done: boolean;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onUp?: () => void;
  onDown?: () => void;
  onBack?: () => void;
  onNext?: () => void;
  nextName?: string;
  backName?: string;
  onRush: () => void;
  onDue: (date: string) => void;
  onRemove: () => void;
}

function JobCard({ job, today, done, dragging, onDragStart, onDragEnd, onUp, onDown, onBack, onNext, nextName, backName, onRush, onDue, onRemove }: CardProps) {
  const state = dueState(job.dueDate, today, done);
  return (
    <article
      data-job={job.id}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", job.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className={clsx(
        "flex cursor-grab flex-col gap-2 rounded-xl border border-l-4 border-line bg-page p-3 active:cursor-grabbing",
        EDGE[state],
        dragging && "opacity-40",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className={clsx("leading-snug font-semibold", done && "text-ink-2")}>{job.title}</h3>
        <button
          type="button"
          onClick={onRush}
          aria-pressed={job.rush}
          title={job.rush ? "Rush: on. Click to turn off." : "Mark as a rush job"}
          className={clsx("shrink-0 rounded-md px-2 py-0.5 text-xs font-semibold", job.rush ? "bg-[color:var(--status-critical)] text-white" : "bg-surface-2 text-muted hover:text-ink")}
        >
          🔥 Rush
        </button>
      </div>

      <label className="flex flex-wrap items-center gap-2 text-sm">
        <span className={clsx("font-medium", state === "overdue" ? "text-bad" : state === "today" || state === "soon" ? "text-ink" : "text-ink-2")}>
          {done ? "Finished" : dueLabel(job.dueDate, today)}
        </span>
        <input
          type="date"
          value={job.dueDate ?? ""}
          onChange={(e) => onDue(e.target.value)}
          aria-label={`Due date for ${job.title}`}
          className="h-7 rounded-md border border-line bg-surface px-1 text-xs text-ink-2"
        />
      </label>

      <div className="flex flex-wrap items-center gap-1">
        {job.url ? (
          <a
            href={job.url}
            target="_blank"
            rel="noreferrer"
            className="mr-auto rounded-md bg-ink px-2.5 py-1.5 text-xs font-semibold text-page hover:opacity-90"
          >
            Open in Lead Rescue ↗
          </a>
        ) : (
          <span className="mr-auto text-xs text-muted">{job.fromDeal ? "No Lead Rescue link" : "Added by hand"}</span>
        )}
        <button type="button" className={iconButton} disabled={!onBack} onClick={onBack} aria-label={backName ? `Move back to ${backName}` : "Move back"} title={backName ? `Back to ${backName}` : undefined}>
          ◀
        </button>
        <button type="button" className={iconButton} disabled={!onUp} onClick={onUp} aria-label="Move up">
          ▲
        </button>
        <button type="button" className={iconButton} disabled={!onDown} onClick={onDown} aria-label="Move down">
          ▼
        </button>
        <button type="button" className={iconButton} disabled={!onNext} onClick={onNext} aria-label={nextName ? `Move on to ${nextName}` : "Move on"} title={nextName ? `On to ${nextName}` : undefined}>
          ▶
        </button>
      </div>
      <button type="button" onClick={onRemove} className="self-end text-xs text-muted hover:text-bad">
        Remove
      </button>
    </article>
  );
}

function AddJob({ onError }: { onError: (m: string | null) => void }) {
  const [pending, start] = useTransition();
  const form = useRef<HTMLFormElement>(null);
  return (
    <form
      ref={form}
      action={(fd) =>
        start(async () => {
          const r = await addJob(fd);
          onError(r.ok ? null : (r.message ?? "That didn't save."));
          if (r.ok) form.current?.reset();
        })
      }
      className="flex flex-wrap items-end gap-2"
    >
      <label className="flex flex-col gap-1 text-xs text-muted">
        Add a job by hand
        <input name="title" required maxLength={120} placeholder="Customer or job name" className="h-9 w-56 rounded-lg border border-line bg-page px-3 text-sm text-ink" />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Due
        <input name="due" type="date" className="h-9 rounded-lg border border-line bg-page px-2 text-sm text-ink" />
      </label>
      <label className="flex h-9 items-center gap-1.5 text-sm text-ink-2">
        <input name="rush" type="checkbox" className="size-4" /> Rush
      </label>
      <button type="submit" disabled={pending} className="h-9 rounded-lg bg-ink px-4 text-sm font-semibold text-page disabled:opacity-60">
        {pending ? "Adding…" : "Add"}
      </button>
    </form>
  );
}
