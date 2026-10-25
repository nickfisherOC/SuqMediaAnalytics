import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/page-skeleton";
import { Brands } from "@/components/settings/brands";
import { People } from "@/components/settings/people";
import { SeriesSettings } from "@/components/settings/series";
import { loadSettings } from "@/lib/data/settings";

export const metadata: Metadata = { title: "Settings" };

const H2 = ({ children, note }: { children: React.ReactNode; note: string }) => (
  <div className="mb-4">
    <h2 className="font-display text-3xl font-extrabold tracking-tight">{children}</h2>
    <p className="text-ink-2">{note}</p>
  </div>
);

async function Settings() {
  const s = await loadSettings();
  if (!s) return <p className="text-ink-2">Settings are for admins. Ask Nick or Krzysztof if something needs changing.</p>;
  const activeBrands = s.brands.filter((b) => b.active);
  return (
    <div className="flex flex-col gap-14">
      <header>
        <h1 className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl">Settings</h1>
      </header>
      <section>
        <H2 note="Who can sign in to Pulse, and what they can change.">People</H2>
        <People people={s.people} invites={s.invites} meId={s.ctx.viewer.id} />
      </section>
      <section>
        <H2 note="Each brand's name, colours, platforms and Weekly Review tiles. New brands show up across Pulse straight away.">Brands</H2>
        <Brands brands={s.brands} />
      </section>
      <section>
        <H2 note="Daily video series. Content Lab's tracker and the &quot;Day N&quot; labels come from these.">Content series</H2>
        <SeriesSettings series={s.series} brands={activeBrands.map((b) => ({ slug: b.slug, name: b.name }))} />
      </section>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Settings />
    </Suspense>
  );
}
