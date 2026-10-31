import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SampleBadge, SupplierEditor } from "@/components/inventory/suppliers";
import { PageSkeleton } from "@/components/page-skeleton";
import { getSupplier } from "@/lib/data/suppliers";
import { KIND_LABEL } from "@/lib/suppliers";

export const metadata: Metadata = { title: "Supplier · Inventory" };

async function SupplierPage({ params }: { params: PageProps<"/inventory/suppliers/[supplierId]">["params"] }) {
  const { supplierId } = await params;
  const { found, today } = await getSupplier(supplierId);
  return (
    <div className="flex flex-col gap-8">
      <Link href="/inventory/suppliers" className="text-sm font-medium text-ink-2 hover:text-ink">
        ← All suppliers
      </Link>
      {found ? (
        <>
          <header className="flex flex-col gap-1">
            <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-muted">
              {[KIND_LABEL[found.supplier.kind], found.supplier.location].filter(Boolean).join(" · ")}
              {found.supplier.isSample && <SampleBadge />}
            </p>
            <h1 className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl">{found.supplier.name}</h1>
            {found.supplier.website && (
              <a href={found.supplier.website} target="_blank" rel="noreferrer" className="w-fit text-sm text-ink-2 underline hover:text-ink">
                {found.supplier.website.replace(/^https?:\/\//, "")} ↗
              </a>
            )}
          </header>
          <SupplierEditor key={found.supplier.id} supplier={found.supplier} products={found.products} today={today} />
        </>
      ) : (
        <p className="text-ink-2">That supplier isn&apos;t on the list any more.</p>
      )}
    </div>
  );
}

export default function Page(props: PageProps<"/inventory/suppliers/[supplierId]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <SupplierPage params={props.params} />
    </Suspense>
  );
}
