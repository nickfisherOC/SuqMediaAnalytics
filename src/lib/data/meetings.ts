import "server-only";
import { addDays, type ISODate } from "@/lib/dates";
import type { BrandReview } from "@/lib/review";
import { createUserClient } from "@/lib/supabase/server";
import { getAppContext } from "./source";

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
}

export interface Meeting {
  id: string | null;
  weekStart: ISODate;
  notes: string;
  lockedAt: string | null;
  shareToken: string | null;
  shareExpiresAt: string | null;
  items: ActionItem[];
  /** Last week's items, reviewed at the start of this week's meeting. */
  previousItems: ActionItem[];
}

const empty = (weekStart: ISODate): Meeting => ({
  id: null,
  weekStart,
  notes: "",
  lockedAt: null,
  shareToken: null,
  shareExpiresAt: null,
  items: [],
  previousItems: [],
});

type ItemRow = {
  id: string;
  meeting_id: string;
  title: string;
  owner_name: string | null;
  due_date: string | null;
  status: ActionItem["status"];
  brand_id: string | null;
  target_metric: string | null;
  target_platform: string | null;
  baseline_value: number | null;
};

export async function getMeeting(weekStart: ISODate): Promise<Meeting> {
  const ctx = await getAppContext();
  if (ctx.mode === "preview") return empty(weekStart);

  const db = await createUserClient();
  const prevStart = addDays(weekStart, -7);
  const { data: meetings, error } = await db
    .from("meetings")
    .select("id, week_start, notes, locked_at, share_token, share_expires_at")
    .in("week_start", [weekStart, prevStart]);
  if (error) throw error;
  const cur = meetings.find((m) => m.week_start === weekStart);
  const prev = meetings.find((m) => m.week_start === prevStart);

  const ids = [cur?.id, prev?.id].filter(Boolean) as string[];
  let rows: ItemRow[] = [];
  if (ids.length) {
    const { data, error: iErr } = await db
      .from("action_items")
      .select("id, meeting_id, title, owner_name, due_date, status, brand_id, target_metric, target_platform, baseline_value")
      .in("meeting_id", ids)
      .order("created_at");
    if (iErr) throw iErr;
    rows = data as ItemRow[];
  }
  const slugById = new Map(ctx.brands.map((b) => [b.id, b.slug]));
  const toItem = (r: ItemRow): ActionItem => {
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
    };
  };

  return {
    ...empty(weekStart),
    id: cur?.id ?? null,
    notes: cur?.notes ?? "",
    lockedAt: cur?.locked_at ?? null,
    shareToken: cur?.share_token ?? null,
    shareExpiresAt: cur?.share_expires_at ?? null,
    items: rows.filter((r) => r.meeting_id === cur?.id).map(toItem),
    previousItems: rows.filter((r) => r.meeting_id === prev?.id).map(toItem),
  };
}

/** A locked week's frozen reviews, in brand order. */
export async function getLockedReviews(meetingId: string): Promise<BrandReview[]> {
  const ctx = await getAppContext();
  const db = await createUserClient();
  const { data, error } = await db.from("week_snapshots").select("brand_id, pack").eq("meeting_id", meetingId);
  if (error) throw error;
  const order = new Map(ctx.brands.map((b, i) => [b.id, i]));
  return data.sort((a, b) => (order.get(a.brand_id) ?? 99) - (order.get(b.brand_id) ?? 99)).map((r) => r.pack as BrandReview);
}
