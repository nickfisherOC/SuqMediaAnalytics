import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ProductEditor } from "@/components/inventory/product-editor";
import { PageSkeleton } from "@/components/page-skeleton";
import { getInventoryProduct } from "@/lib/data/inventory";

export const metadata: Metadata = { title: "Inventory" };

async function Product({ params }: { params: PageProps<"/inventory/[id]">["params"] }) {
  const { id } = await params;
  const { mode, product } = await getInventoryProduct(id);
  return (
    <div className="flex flex-col gap-8">
      <Link href="/inventory" className="text-sm font-medium text-ink-2 hover:text-ink">
        ← All inventory
      </Link>
      {product ? (
        <>
          <header className="flex flex-col gap-1">
            <p className="text-sm font-medium text-muted">{[product.brand, product.styleNumber, product.category].filter(Boolean).join(" · ") || "Inventory · in Calgary"}</p>
            <h1 className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl">{product.name}</h1>
          </header>
          <ProductEditor key={product.id} product={product} canUpload={mode === "live"} />
        </>
      ) : (
        <p className="text-ink-2">That product isn&apos;t on the list any more.</p>
      )}
    </div>
  );
}

export default function Page(props: PageProps<"/inventory/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Product params={props.params} />
    </Suspense>
  );
}
