import type { Metadata } from "next";
import { Suspense } from "react";
import { SupplierDirectory } from "@/components/inventory/suppliers";
import { InventoryTabs } from "@/components/inventory/tabs";
import { PageSkeleton } from "@/components/page-skeleton";
import { getViewer } from "@/lib/data/source";
import { listProductTypes } from "@/lib/data/product-types";
import { listSuppliers } from "@/lib/data/suppliers";

export const metadata: Metadata = { title: "Suppliers · Inventory" };

async function Suppliers() {
  const [{ suppliers, today }, { viewer }, types] = await Promise.all([listSuppliers(), getViewer(), listProductTypes()]);
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <p className="text-sm font-medium text-muted">Inventory · dropship &amp; manufacturers</p>
        <h1 className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl">What we can order</h1>
      </header>
      <InventoryTabs />
      <SupplierDirectory suppliers={suppliers} types={types} today={today} isAdmin={viewer.role === "admin"} />
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Suppliers />
    </Suspense>
  );
}
