import type { Metadata } from "next";
import { Suspense } from "react";
import { BrandSection } from "@/components/brand-section";
import { ActionItems } from "@/components/meeting/action-items";
import { NotesLog } from "@/components/meeting/notes-log";
import { WeekControls } from "@/components/meeting/week-controls";
import { PageSkeleton } from "@/components/page-skeleton";
import { brandSections } from "@/components/review/sections";
import { loadReviewPage } from "@/lib/data/review-page";
import { formatRange } from "@/lib/dates";

export const metadata: Metadata = { title: "Weekly Review" };
// Writing an AI summary (the "Rewrite" button) takes about a minute.
export const maxDuration = 180;

async function WeeklyReview({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  const params = await searchParams;
  const { ctx, controls, reviews, actionItems, notes, targets, ai, search, ads, goals } = await loadReviewPage(params);
  const query = new URLSearchParams(Object.entries(params).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : []))).toString();

  return (
    <div className="flex flex-col gap-14">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium text-muted">
            Weekly Review · {formatRange(controls.period.from, controls.period.to)} vs {controls.compare.label.toLowerCase()}
            {controls.period.partial && " · still in progress"}
          </p>
          <h1 className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl">How things are going</h1>
        </div>
        <WeekControls presentHref={`/present${query ? `?${query}` : ""}`} />
      </header>

      {reviews.map((r) => (
        <BrandSection key={r.brand.slug} brand={r.brand}>
          {brandSections(r, { ai: ai[r.brand.slug], search: search[r.brand.slug], searchHref: `/search${query ? `?${query}` : ""}`, ads: ads[r.brand.slug], adsHref: `/ads${query ? `?${query}` : ""}`, goals: goals.byFigure }).map((s) => (
            <div key={s.key} className="print-avoid-break">
              {s.node}
            </div>
          ))}
        </BrandSection>
      ))}

      <section className="flex flex-col gap-4" aria-label="Meeting">
        <h2 className="font-display text-3xl font-extrabold tracking-tight">Actions and notes</h2>
        <ActionItems items={actionItems} targets={targets} period={controls.period} />
        <NotesLog notes={notes} today={ctx.today} brands={ctx.brands.map((b) => ({ slug: b.slug, name: b.name }))} isAdmin={ctx.viewer.role === "admin"} />
      </section>
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
