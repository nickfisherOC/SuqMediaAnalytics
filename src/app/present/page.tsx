import type { Metadata } from "next";
import { Suspense } from "react";
import { brandSections } from "@/components/review/sections";
import { loadReviewPage } from "@/lib/data/review-page";
import { formatRange } from "@/lib/dates";
import { Slides, type Slide } from "./slides";

export const metadata: Metadata = { title: "Presentation" };

async function Presentation({ searchParams }: { searchParams: PageProps<"/present">["searchParams"] }) {
  const params = await searchParams;
  const { controls, meeting, locked, reviews } = await loadReviewPage(params);
  const range = formatRange(controls.period.from, controls.period.to);
  const query = new URLSearchParams(Object.entries(params).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : []))).toString();

  const slides: Slide[] = [
    {
      key: "title",
      kicker: `Weekly Review · ${range}${locked ? " · locked" : ""}`,
      node: (
        <div className="flex h-full flex-col justify-center gap-6">
          <h1 className="font-display text-6xl font-extrabold tracking-tight sm:text-7xl">How the week went</h1>
          <ul className="flex flex-col gap-3 text-2xl text-ink-2">
            {reviews.map((r) => (
              <li key={r.brand.slug}>
                <span className="font-semibold text-ink">{r.brand.name}:</span> {r.highlights.headline}
              </li>
            ))}
          </ul>
        </div>
      ),
    },
  ];

  for (const r of reviews) {
    for (const s of brandSections(r)) {
      slides.push({ key: `${r.brand.slug}-${s.key}`, kicker: `${r.brand.name} · ${s.title}`, accent: r.brand.accent, node: s.node });
    }
  }

  if (meeting) {
    const items = [...meeting.previousItems.map((i) => ({ ...i, when: "Last week" })), ...meeting.items.map((i) => ({ ...i, when: "This week" }))];
    slides.push({
      key: "actions",
      kicker: "Action items",
      node: items.length ? (
        <ul className="flex flex-col gap-4 text-2xl">
          {items.map((i) => (
            <li key={i.id} className="flex flex-wrap items-baseline gap-x-3">
              <span className={`font-semibold ${i.status === "dropped" ? "text-muted line-through" : ""}`}>{i.title}</span>
              <span className="text-base text-muted">
                {i.when} · {i.ownerName ?? "no owner"} · {i.status}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-2xl text-ink-2">No action items yet. Add them on the Weekly Review page.</p>
      ),
    });
    slides.push({
      key: "notes",
      kicker: "Notes",
      node: <div className="text-2xl leading-relaxed whitespace-pre-wrap">{meeting.notes || <span className="text-muted">No notes yet.</span>}</div>,
    });
  }

  return <Slides slides={slides} exitHref={`/${query ? `?${query}` : ""}`} />;
}

export default function Page(props: PageProps<"/present">) {
  return (
    <Suspense fallback={<div className="p-12 text-ink-2">Loading the presentation…</div>}>
      <Presentation searchParams={props.searchParams} />
    </Suspense>
  );
}
