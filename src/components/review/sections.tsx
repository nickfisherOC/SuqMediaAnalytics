import { Suspense } from "react";
import { Ideas } from "@/components/ai/ideas";
import { SummaryBar } from "@/components/ai/summary-bar";
import { Funnel } from "@/components/charts/funnel";
import { FlagList } from "@/components/flag-list";
import { Headline, HighlightList } from "@/components/highlights";
import { StatTile } from "@/components/stat-tile";
import { WhatsWinning } from "@/components/whats-winning";
import type { AiView } from "@/lib/data/ai-summary";
import type { BrandReview } from "@/lib/review";

export interface ReviewSection {
  key: string;
  title: string;
  node: React.ReactNode;
}

const H3 = ({ children }: { children: React.ReactNode }) => (
  <h3 className="mb-3 text-sm font-semibold tracking-wide text-muted uppercase">{children}</h3>
);

/**
 * One brand's review as an ordered list of sections. The page stacks them;
 * presentation mode shows one per slide. Order follows the meeting. When
 * Pulse AI has written this period, its headline, highlights, patterns and
 * ideas replace the rule-based ones.
 */
export function brandSections(r: BrandReview, opts: { ai?: AiView; presenting?: boolean } = {}): ReviewSection[] {
  const { pack, highlights: h } = r;
  const n = opts.ai?.narrative ?? null;
  const improved = n ? n.improved : h.improved;
  const needsWork = n ? n.needs_work : h.needsWork;

  const sections: ReviewSection[] = [
    {
      key: "headline",
      title: "The headline",
      node: (
        <Headline text={n?.headline ?? h.headline}>
          {opts.presenting ? null : (
            <Suspense>
              <SummaryBar brand={r.brand.slug} generatedAt={n?.generatedAt ?? null} stale={opts.ai?.stale ?? false} />
            </Suspense>
          )}
        </Headline>
      ),
    },
    {
      key: "scoreboard",
      title: "Scoreboard",
      node: (
        <div>
          <H3>Scoreboard</H3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {pack.scoreboard.map((id) => (
              <StatTile key={id} figure={pack.figures[id]} compareLabel={r.compareLabel} sample={pack.isSample} />
            ))}
          </div>
        </div>
      ),
    },
    {
      key: "highlights",
      title: "What improved and what needs work",
      node: (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <HighlightList items={improved} tone="good" />
          <HighlightList items={needsWork} tone="bad" />
        </div>
      ),
    },
    {
      key: "winning",
      title: "What's winning",
      node: (
        <div className="flex flex-col gap-4">
          <div>
            <H3>What&apos;s winning</H3>
            <WhatsWinning groups={r.groups} best={r.best} />
          </div>
          {n && n.patterns.length > 0 && (
            <div className="rounded-2xl border border-line bg-surface p-5">
              <H3>What the winners share</H3>
              <ul className="flex flex-col gap-3">
                {n.patterns.map((p) => (
                  <li key={p.finding} className="text-lg leading-snug">
                    <span className="font-semibold text-ink">{p.finding}</span>
                    <span className="text-ink-2"> {p.evidence}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ),
    },
    {
      key: "funnel",
      title: "The funnel",
      node: (
        <div>
          <H3>The funnel</H3>
          <Funnel steps={pack.funnel.map((s) => ({ label: s.label, figure: pack.figures[s.figureId] }))} />
        </div>
      ),
    },
  ];

  if (n) {
    sections.push({
      key: "ideas",
      title: "Ideas for this week",
      node: (
        <div>
          <H3>Ideas for this week</H3>
          <Ideas ideas={opts.ai?.ideas ?? []} />
        </div>
      ),
    });
  }

  sections.push({
    key: "fix",
    title: "Still to fix",
    node: (
      <div>
        <H3>Still to fix</H3>
        <FlagList flags={r.flags} />
      </div>
    ),
  });
  return sections;
}
