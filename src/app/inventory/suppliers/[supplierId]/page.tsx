import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SampleBadge } from "@/components/inventory/samples";
import { SupplierEditor } from "@/components/inventory/suppliers";
import { PageSkeleton } from "@/components/page-skeleton";
import { listProductTypes } from "@/lib/data/product-types";
import { getSupplier } from "@/lib/data/suppliers";
import { KIND_LABEL } from "@/lib/suppliers";

export const metadata: Metadata = { title: "Supplier · Inventory" };

async function SupplierPage({ params }: { params: PageProps<"/inventory/suppliers/[supplierId]">["params"] }) {
  const { supplierId } = await params;
  const [{ mode, found, today }, types] = await Promise.all([getSupplier(supplierId), listProductTypes()]);
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
            <div className="flex items-center gap-4">
              {found.supplier.logoUrl && (
                // A signed link to a private image; a plain <img> keeps it simple.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={found.supplier.logoUrl} alt="" className="size-14 shrink-0 rounded-xl bg-surface-2 object-contain p-1.5" />
              )}
              <h1 className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl">{found.supplier.name}</h1>
            </div>
            {found.supplier.website && (
              <a href={found.supplier.website} target="_blank" rel="noreferrer" className="w-fit text-sm text-ink-2 underline hover:text-ink">
                {found.supplier.website.replace(/^https?:\/\//, "")} ↗
              </a>
            )}
          </header>
          <SupplierEditor key={found.supplier.id} supplier={found.supplier} products={found.products} types={types} today={today} canUpload={mode === "live"} />
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
