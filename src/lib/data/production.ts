import "server-only";
import { addDays, type ISODate } from "@/lib/dates";
import { doneCutoff, type ProductionJob, type ProductionStep } from "@/lib/production";
import { createUserClient } from "@/lib/supabase/server";
import { getViewer, type Viewer } from "./source";

export interface ProductionPage {
  mode: "preview" | "live";
  viewer: Viewer;
  today: ISODate;
  steps: ProductionStep[];
  jobs: ProductionJob[];
}

const PREVIEW_STEPS: ProductionStep[] = [
  { id: "s1", name: "Queued", position: 0, isDone: false },
  { id: "s2", name: "Prep/Prime", position: 1, isDone: false },
  { id: "s3", name: "Printing", position: 2, isDone: false },
  { id: "s4", name: "Done", position: 3, isDone: false },
  { id: "s5", name: "Shipped", position: 4, isDone: true },
];

function previewJobs(today: ISODate): ProductionJob[] {
  const j = (id: string, title: string, stepId: string, sortOrder: number, due: number | null, rush = false): ProductionJob => ({
    id,
    title,
    url: "https://app.leadrescue.pro",
    dueDate: due === null ? null : addDays(today, due),
    rush,
    stepId,
    sortOrder,
    fromDeal: true,
  });
  return [
    j("p1", "Ridgeline Excavating", "s1", 1, 9),
    j("p2", "Prairie Auto Body", "s1", 2, 2, true),
    j("p3", "Northside Framing", "s1", 3, null),
    j("p4", "Calgary Concrete Co.", "s2", 1, 1),
    j("p5", "Bow Valley Plumbing", "s3", 1, -1),
    j("p6", "Red Deer Roofing", "s4", 1, 1),
    j("p7", "Lethbridge Lube & Tire", "s5", 1, -3),
  ];
}

/** The print queue: steps and every job still on the board (finished jobs for two weeks). */
export async function loadProduction(): Promise<ProductionPage> {
  const { mode, viewer, today } = await getViewer();
  if (mode === "preview") return { mode, viewer, today, steps: PREVIEW_STEPS, jobs: previewJobs(today) };

  const db = await createUserClient();
  const [{ data: steps, error: sErr }, { data: jobs, error: jErr }] = await Promise.all([
    db.from("production_steps").select("id, name, position, is_done").order("position"),
    db
      .from("production_jobs")
      .select("id, title, url, due_date, rush, step_id, sort_order, step_changed_at, lead_id")
      .is("removed_at", null),
  ]);
  if (sErr) throw sErr;
  if (jErr) throw jErr;

  const doneIds = new Set(steps.filter((s) => s.is_done).map((s) => s.id));
  const cutoff = doneCutoff(today);
  return {
    mode,
    viewer,
    today,
    steps: steps.map((s) => ({ id: s.id, name: s.name, position: s.position, isDone: s.is_done })),
    jobs: jobs
      .filter((j) => !doneIds.has(j.step_id) || j.step_changed_at.slice(0, 10) >= cutoff)
      .map((j) => ({
        id: j.id,
        title: j.title,
        url: j.url,
        dueDate: j.due_date,
        rush: j.rush,
        stepId: j.step_id,
        sortOrder: j.sort_order,
        fromDeal: Boolean(j.lead_id),
      })),
  };
}
