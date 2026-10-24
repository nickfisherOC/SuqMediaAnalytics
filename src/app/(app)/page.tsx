import type { Metadata } from "next";
import { Suspense } from "react";
import { BrandSection } from "@/components/brand-section";
import { ActionItems } from "@/components/meeting/action-items";
import { MeetingNotes } from "@/components/meeting/notes";
import { WeekControls } from "@/components/meeting/week-controls";
import { PageSkeleton } from "@/components/page-skeleton";
import { brandSections } from "@/components/review/sections";
import { loadReviewPage } from "@/lib/data/review-page";
import { addDays, formatRange } from "@/lib/dates";

export const metadata: Metadata = { title: "Weekly Review" };

async function WeeklyReview({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  const params = await searchParams;
  const { ctx, controls, weekStart, meeting, locked, reviews, targets } = await loadReviewPage(params);
  const presentQuery = new URLSearchParams(Object.entries(params).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : []))).toString();

  return (
    <div className="flex flex-col gap-14">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium text-muted">
            Weekly Review · {formatRange(controls.period.from, controls.period.to)}
            {controls.period.partial && " · still in progress"}
          </p>
          <h1 className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl">How the week went</h1>
        </div>
        <WeekControls
          weekStart={weekStart}
          presentHref={`/present${presentQuery ? `?${presentQuery}` : ""}`}
          locked={locked}
          isAdmin={ctx.mode === "live" && ctx.viewer.role === "admin"}
          weekOver={weekStart ? addDays(weekStart, 6) < ctx.today : false}
          shareToken={meeting?.shareToken ?? null}
          shareExpiresAt={meeting?.shareExpiresAt ?? null}
        />
      </header>

      {locked && meeting?.lockedAt && (
        <p className="rounded-xl border border-line bg-surface-2/60 px-4 py-3 text-sm text-ink-2">
          <span className="font-semibold text-ink">Locked</span> on{" "}
          {new Date(meeting.lockedAt).toLocaleString("en-CA", { timeZone: "America/Edmonton", dateStyle: "medium", timeStyle: "short" })}. These are the
          numbers as they were discussed; later changes from the platforms don&apos;t affect them.
        </p>
      )}

      {reviews.map((r) => (
        <BrandSection key={r.brand.slug} brand={r.brand}>
          {brandSections(r).map((s) => (
            <div key={s.key} className="print-avoid-break">
              {s.node}
            </div>
          ))}
        </BrandSection>
      ))}

      {weekStart && meeting ? (
        <section className="flex flex-col gap-4" aria-label="Meeting">
          <h2 className="font-display text-3xl font-extrabold tracking-tight">The meeting</h2>
          <ActionItems weekStart={weekStart} items={meeting.items} previousItems={meeting.previousItems} targets={targets} locked={locked} />
          <MeetingNotes weekStart={weekStart} initial={meeting.notes} locked={locked} />
        </section>
      ) : (
        <p className="no-print rounded-2xl border border-dashed border-line p-5 text-sm text-ink-2">
          Notes, action items and locking work on a full Monday-to-Sunday week. Choose <span className="font-semibold">Last week</span> in the
          Period box, or a custom Monday to Sunday.
        </p>
      )}
    </div>
  );
}

export default function Page(props: PageProps<"/">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <WeeklyReview searchParams={props.searchParams} />
    </Suspense>
  );
}
