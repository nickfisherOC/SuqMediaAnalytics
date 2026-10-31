import type { Metadata } from "next";
import { Suspense } from "react";
import { InventoryTabs } from "@/components/inventory/tabs";
import { TypesManager } from "@/components/inventory/types-manager";
import { PageSkeleton } from "@/components/page-skeleton";
import { listProductTypes } from "@/lib/data/product-types";
import { getViewer } from "@/lib/data/source";

export const metadata: Metadata = { title: "Product types · Inventory" };

async function Types() {
  const [types, { mode }] = await Promise.all([listProductTypes(), getViewer()]);
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <p className="text-sm font-medium text-muted">Inventory · product types</p>
        <h1 className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl">Types and their specs</h1>
      </header>
      <InventoryTabs />
      <TypesManager types={types} canEdit={mode === "live"} />
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Types />
    </Suspense>
  );
}
