import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { BrandSection } from "@/components/brand-section";
import { brandSections } from "@/components/review/sections";
import { addDays, formatRange } from "@/lib/dates";
import type { BrandReview } from "@/lib/review";
import { createServiceClient } from "@/lib/supabase/service";

export const metadata: Metadata = { title: "Shared Weekly Review", robots: { index: false, follow: false } };

/**
 * A locked week, read-only, for anyone with the link until it expires. Only
 * the frozen snapshot is shown, so nothing live leaks through.
 */
async function Shared({ params }: { params: PageProps<"/share/[token]">["params"] }) {
  await connection();
  const { token } = await params;
  const db = createServiceClient();
  const { data: meeting } = await db
    .from("meetings")
    .select("id, week_start, notes, locked_at, share_expires_at")
    .eq("share_token", token)
    .maybeSingle();

  const valid = meeting?.locked_at && meeting.share_expires_at && new Date(meeting.share_expires_at) > new Date();
  if (!meeting || !valid) {
    return (
      <main className="flex min-h-dvh items-center justify-center p-6">
        <div className="max-w-md rounded-2xl border border-line bg-surface p-8 text-center">
          <h1 className="font-display text-3xl font-extrabold">Link expired</h1>
          <p className="mt-2 text-ink-2">This shared review is no longer available. Ask whoever sent it for a new link.</p>
        </div>
      </main>
    );
  }

  const [{ data: snaps }, { data: items }, { data: brands }] = await Promise.all([
    db.from("week_snapshots").select("brand_id, pack").eq("meeting_id", meeting.id),
    db.from("action_items").select("id, title, owner_name, status").eq("meeting_id", meeting.id).order("created_at"),
    db.from("brands").select("id, sort_order"),
  ]);
  const order = new Map((brands ?? []).map((b) => [b.id, b.sort_order]));
  const reviews = (snaps ?? []).sort((a, b) => (order.get(a.brand_id) ?? 0) - (order.get(b.brand_id) ?? 0)).map((s) => s.pack as BrandReview);

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-14 px-4 py-8 lg:px-8">
      <header className="flex flex-col gap-1">
        <p className="text-sm font-medium text-muted">
          Pulse · Weekly Review · {formatRange(meeting.week_start, addDays(meeting.week_start, 6))} · read-only, locked copy
        </p>
        <h1 className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl">How the week went</h1>
      </header>
      {reviews.map((r) => (
        <BrandSection key={r.brand.slug} brand={r.brand}>
          {brandSections(r).map((s) => (
            <div key={s.key} className="print-avoid-break">
              {s.node}
            </div>
          ))}
        </BrandSection>
      ))}
      <section className="flex flex-col gap-4">
        <h2 className="font-display text-3xl font-extrabold tracking-tight">The meeting</h2>
        <div className="rounded-2xl border border-line bg-surface p-5">
          <h3 className="text-sm font-semibold tracking-wide text-muted uppercase">Action items</h3>
          {items?.length ? (
            <ul className="mt-2 divide-y divide-line">
              {items.map((i) => (
                <li key={i.id} className="py-2">
                  <span className="font-semibold">{i.title}</span>
                  <span className="text-sm text-muted">
                    {" "}
                    · {i.owner_name ?? "no owner"} · {i.status}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-ink-2">None.</p>
          )}
        </div>
        <div className="rounded-2xl border border-line bg-surface p-5">
          <h3 className="text-sm font-semibold tracking-wide text-muted uppercase">Notes</h3>
          <p className="mt-2 whitespace-pre-wrap">{meeting.notes || "No notes were taken."}</p>
        </div>
      </section>
    </main>
  );
}

export default function Page(props: PageProps<"/share/[token]">) {
  return (
    <Suspense fallback={<div className="p-12 text-ink-2">Loading…</div>}>
      <Shared params={props.params} />
    </Suspense>
  );
}
