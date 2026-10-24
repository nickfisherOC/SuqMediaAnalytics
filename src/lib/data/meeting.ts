import "server-only";
import { addDays, type ISODate } from "@/lib/dates";
import type { Outcome } from "@/lib/outcomes";
import { createUserClient } from "@/lib/supabase/server";
import { getAppContext } from "./source";

/**
 * The meeting is a running conversation, not a fixed weekly slot: action items
 * stay open until they're done, and notes are a dated log (stored as timeline
 * annotations, so they also show on charts).
 */

export interface ActionItem {
  id: string;
  title: string;
  ownerName: string | null;
  dueDate: ISODate | null;
  status: "open" | "done" | "dropped";
  brand: string | null;
  /** Figure id the item hopes to move, e.g. "peoplesuq.comments.instagram". */
  targetFigure: string | null;
  baselineValue: number | null;
  /** Set two weeks after adding, by the nightly outcome check. */
  outcome: Outcome | null;
  fromAi: boolean;
  createdOn: ISODate;
  updatedOn: ISODate;
}

export interface Note {
  id: string;
  date: ISODate;
  text: string;
  brand: string | null;
  author: string | null;
  mine: boolean;
}

/** Finished items stay visible this long, so the meeting can see what got done. */
const DONE_VISIBLE_DAYS = 14;

export async function getActionItems(): Promise<ActionItem[]> {
  const ctx = await getAppContext();
  if (ctx.mode === "preview") return [];
  const db = await createUserClient();
  const since = addDays(ctx.today, -DONE_VISIBLE_DAYS);
  const { data, error } = await db
    .from("action_items")
    .select("id, title, owner_name, due_date, status, brand_id, target_metric, target_platform, baseline_value, outcome, recommendation_id, created_at, updated_at")
    .or(`status.eq.open,updated_at.gte.${since}`)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  const slugById = new Map(ctx.brands.map((b) => [b.id, b.slug]));
  return data.map((r) => {
    const brand = r.brand_id ? (slugById.get(r.brand_id) ?? null) : null;
    return {
      id: r.id,
      title: r.title,
      ownerName: r.owner_name,
      dueDate: r.due_date,
      status: r.status,
      brand,
      targetFigure: brand && r.target_metric ? `${brand}.${r.target_metric}.${r.target_platform ?? "all"}` : null,
      baselineValue: r.baseline_value === null ? null : Number(r.baseline_value),
      outcome: r.outcome,
      fromAi: !!r.recommendation_id,
      createdOn: r.created_at.slice(0, 10),
      updatedOn: r.updated_at.slice(0, 10),
    };
  });
}

export async function getNotes(limit = 40): Promise<Note[]> {
  const ctx = await getAppContext();
  if (ctx.mode === "preview") return [];
  const db = await createUserClient();
  const { data, error } = await db
    .from("annotations")
    .select("id, date, title, body, brand_id, created_by")
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  const ids = [...new Set(data.map((n) => n.created_by).filter(Boolean))] as string[];
  const { data: people } = ids.length ? await db.from("profiles").select("id, full_name, email").in("id", ids) : { data: [] };
  const nameById = new Map((people ?? []).map((p) => [p.id, p.full_name ?? p.email]));
  const slugById = new Map(ctx.brands.map((b) => [b.id, b.slug]));
  return data.map((n) => ({
    id: n.id,
    date: n.date,
    text: n.body ? `${n.title}\n${n.body}` : n.title,
    brand: n.brand_id ? (slugById.get(n.brand_id) ?? null) : null,
    author: n.created_by ? (nameById.get(n.created_by) ?? null) : null,
    mine: n.created_by === ctx.viewer.id,
  }));
}
