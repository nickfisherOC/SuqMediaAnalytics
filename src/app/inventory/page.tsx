import type { Metadata } from "next";
import { Suspense } from "react";
import { ProductList } from "@/components/inventory/product-list";
import { PageSkeleton } from "@/components/page-skeleton";
import { listInventory } from "@/lib/data/inventory";

export const metadata: Metadata = { title: "Inventory" };

async function Inventory() {
  const { products } = await listInventory();
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <p className="text-sm font-medium text-muted">Inventory · in Calgary</p>
        <h1 className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl">What&apos;s on the shelves</h1>
      </header>
      <ProductList products={products} />
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Inventory />
    </Suspense>
  );
}
