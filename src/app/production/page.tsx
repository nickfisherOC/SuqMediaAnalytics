import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/page-skeleton";
import { ProductionBoard } from "@/components/production/board";
import { loadProduction } from "@/lib/data/production";

export const metadata: Metadata = { title: "Production" };

async function Production() {
  const { steps, jobs, today } = await loadProduction();
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <p className="text-sm font-medium text-muted">Production · print queue</p>
        <h1 className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl">What&apos;s on the go</h1>
      </header>
      <ProductionBoard steps={steps} jobs={jobs} today={today} />
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Production />
    </Suspense>
  );
}
