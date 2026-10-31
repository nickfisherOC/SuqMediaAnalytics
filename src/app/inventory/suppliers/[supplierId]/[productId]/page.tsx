import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SampleBadge, SupplierProductEditor } from "@/components/inventory/suppliers";
import { PageSkeleton } from "@/components/page-skeleton";
import { listProductTypes } from "@/lib/data/product-types";
import { getSupplierProduct } from "@/lib/data/suppliers";

export const metadata: Metadata = { title: "Supplier product · Inventory" };

async function ProductPage({ params }: { params: PageProps<"/inventory/suppliers/[supplierId]/[productId]">["params"] }) {
  const { supplierId, productId } = await params;
  const [{ mode, today, supplier, product }, types] = await Promise.all([getSupplierProduct(supplierId, productId), listProductTypes()]);
  return (
    <div className="flex flex-col gap-8">
      <Link href={supplier ? `/inventory/suppliers/${supplier.id}` : "/inventory/suppliers"} className="text-sm font-medium text-ink-2 hover:text-ink">
        ← {supplier ? supplier.name : "All suppliers"}
      </Link>
      {supplier && product ? (
        <>
          <header className="flex flex-col gap-1">
            <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-muted">
              {[supplier.name, product.brand, product.styleNumber].filter(Boolean).join(" · ")}
              {product.isSample && <SampleBadge />}
            </p>
            <h1 className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl">{product.name}</h1>
          </header>
          <SupplierProductEditor key={product.id} supplier={supplier} product={product} types={types} today={today} canUpload={mode === "live"} />
        </>
      ) : (
        <p className="text-ink-2">That product isn&apos;t on the list any more.</p>
      )}
    </div>
  );
}

export default function Page(props: PageProps<"/inventory/suppliers/[supplierId]/[productId]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ProductPage params={props.params} />
    </Suspense>
  );
}
