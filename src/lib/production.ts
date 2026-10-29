import { addDays, diffDays, formatShort, type ISODate } from "@/lib/dates";

/** The print queue: steps as columns, jobs ordered rush-first within each. */

export interface ProductionStep {
  id: string;
  name: string;
  position: number;
  isDone: boolean;
}

export interface ProductionJob {
  id: string;
  title: string;
  url: string | null;
  dueDate: ISODate | null;
  rush: boolean;
  stepId: string;
  sortOrder: number;
  fromDeal: boolean;
}

/** Done jobs stay on the board this many days after reaching the last step. */
export const DONE_VISIBLE_DAYS = 14;

/** A step's jobs in board order: rush jobs on top, then by position. */
export function jobsInStep(jobs: ProductionJob[], stepId: string): ProductionJob[] {
  return jobs
    .filter((j) => j.stepId === stepId)
    .sort((a, b) => Number(b.rush) - Number(a.rush) || a.sortOrder - b.sortOrder);
}

/** A sort value that lands between two neighbours (either may be missing). */
export function orderBetween(prev: number | undefined, next: number | undefined): number {
  if (prev !== undefined && next !== undefined) return (prev + next) / 2;
  if (prev !== undefined) return prev + 1;
  if (next !== undefined) return next - 1;
  return 0;
}

/**
 * Where a job goes when it's dropped into `stepId` at `index` (its place in
 * that step's board order, counted without the job itself).
 */
export function placeJob(jobs: ProductionJob[], jobId: string, stepId: string, index: number): { stepId: string; sortOrder: number } {
  const rush = jobs.find((j) => j.id === jobId)?.rush ?? false;
  const others = jobsInStep(jobs, stepId).filter((j) => j.id !== jobId);
  // Rush jobs always sit on top, so a job only moves among jobs with the same rush flag.
  const rushCount = others.filter((j) => j.rush).length;
  const group = others.filter((j) => j.rush === rush);
  const i = Math.max(0, Math.min(rush ? index : index - rushCount, group.length));
  return { stepId, sortOrder: orderBetween(group[i - 1]?.sortOrder, group[i]?.sortOrder) };
}

export type DueState = "overdue" | "today" | "soon" | "later" | "none";

/** How urgent a due date is. Finished jobs are never overdue. */
export function dueState(dueDate: ISODate | null, today: ISODate, done: boolean): DueState {
  if (!dueDate || done) return "none";
  const days = diffDays(today, dueDate);
  if (days < 0) return "overdue";
  if (days === 0) return "today";
  if (days <= 3) return "soon";
  return "later";
}

/** "Due today", "Due tomorrow", "2 days late", "Due Oct 31". */
export function dueLabel(dueDate: ISODate | null, today: ISODate): string {
  if (!dueDate) return "No due date";
  const days = diffDays(today, dueDate);
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  if (days === -1) return "1 day late";
  if (days < 0) return `${-days} days late`;
  return `Due ${formatShort(dueDate)}`;
}

/** The earliest date a finished job is still shown. */
export function doneCutoff(today: ISODate): ISODate {
  return addDays(today, -DONE_VISIBLE_DAYS);
}
