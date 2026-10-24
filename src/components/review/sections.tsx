import { Funnel } from "@/components/charts/funnel";
import { FlagList } from "@/components/flag-list";
import { Headline, HighlightList } from "@/components/highlights";
import { StatTile } from "@/components/stat-tile";
import { WhatsWinning } from "@/components/whats-winning";
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
 * presentation mode shows one per slide. Order follows the meeting.
 */
export function brandSections(r: BrandReview, opts: { autoHeadline?: boolean } = {}): ReviewSection[] {
  const { pack, highlights: h } = r;
  return [
    { key: "headline", title: "The headline", node: <Headline text={h.headline} auto={opts.autoHeadline ?? true} /> },
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
          <HighlightList items={h.improved} tone="good" />
          <HighlightList items={h.needsWork} tone="bad" />
        </div>
      ),
    },
    {
      key: "winning",
      title: "What's winning",
      node: (
        <div>
          <H3>What&apos;s winning</H3>
          <WhatsWinning groups={r.groups} best={r.best} />
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
    {
      key: "fix",
      title: "Still to fix",
      node: (
        <div>
          <H3>Still to fix</H3>
          <FlagList flags={r.flags} />
        </div>
      ),
    },
  ];
}
