import type { Metadata } from "next";
import { Suspense } from "react";
import { brandSections } from "@/components/review/sections";
import type { ActionItem } from "@/lib/data/meeting";
import { loadReviewPage } from "@/lib/data/review-page";
import { formatRange } from "@/lib/dates";
import { Slides, type Slide } from "./slides";

export const metadata: Metadata = { title: "Presentation" };

async function Presentation({ searchParams }: { searchParams: PageProps<"/present">["searchParams"] }) {
  const params = await searchParams;
  const { controls, reviews, actionItems, notes, ai, search } = await loadReviewPage(params);
  const range = formatRange(controls.period.from, controls.period.to);
  const query = new URLSearchParams(Object.entries(params).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : []))).toString();

  const slides: Slide[] = [
    {
      key: "title",
      kicker: `Weekly Review · ${range}`,
      node: (
        <div className="flex h-full flex-col justify-center gap-6">
          <h1 className="font-display text-6xl font-extrabold tracking-tight sm:text-7xl">How things are going</h1>
          <ul className="flex flex-col gap-3 text-2xl text-ink-2">
            {reviews.map((r) => (
              <li key={r.brand.slug}>
                <span className="font-semibold text-ink">{r.brand.name}:</span> {ai[r.brand.slug]?.narrative?.headline ?? r.highlights.headline}
              </li>
            ))}
          </ul>
        </div>
      ),
    },
  ];

  for (const r of reviews) {
    for (const s of brandSections(r, { ai: ai[r.brand.slug], search: search[r.brand.slug], presenting: true })) {
      slides.push({ key: `${r.brand.slug}-${s.key}`, kicker: `${r.brand.name} · ${s.title}`, accent: r.brand.accent, node: s.node });
    }
  }

  const itemList = (label: string, list: ActionItem[]) =>
    list.length ? (
      <div key={label}>
        <p className="mb-3 text-base font-semibold tracking-wide text-muted uppercase">{label}</p>
        <ul className="flex flex-col gap-3">
          {list.map((i) => (
            <li key={i.id} className="flex flex-wrap items-baseline gap-x-3">
              <span className={`font-semibold ${i.status === "dropped" ? "text-muted line-through" : ""}`}>{i.title}</span>
              <span className="text-base text-muted">
                {i.ownerName ?? "no owner"}
                {i.dueDate ? ` · due ${i.dueDate}` : ""}
              </span>
            </li>
          ))}
        </ul>
      </div>
    ) : null;
  slides.push({
    key: "actions",
    kicker: "Action items",
    node: actionItems.length ? (
      <div className="flex flex-col gap-8 text-2xl">
        {itemList("Open", actionItems.filter((i) => i.status === "open"))}
        {itemList("Finished in the last two weeks", actionItems.filter((i) => i.status !== "open"))}
      </div>
    ) : (
      <p className="text-2xl text-ink-2">No action items yet. Add them on the Weekly Review page.</p>
    ),
  });
  slides.push({
    key: "notes",
    kicker: "Recent notes",
    node: notes.length ? (
      <ul className="flex flex-col gap-4 text-2xl">
        {notes.slice(0, 8).map((n) => (
          <li key={n.id}>
            <span className="text-base font-semibold text-muted">{n.date}</span>
            <p className="whitespace-pre-wrap">{n.text}</p>
          </li>
        ))}
      </ul>
    ) : (
      <p className="text-2xl text-ink-2">No notes yet.</p>
    ),
  });

  return <Slides slides={slides} exitHref={`/${query ? `?${query}` : ""}`} />;
}

export default function Page(props: PageProps<"/present">) {
  return (
    <Suspense fallback={<div className="p-12 text-ink-2">Loading the presentation…</div>}>
      <Presentation searchParams={props.searchParams} />
    </Suspense>
  );
}
