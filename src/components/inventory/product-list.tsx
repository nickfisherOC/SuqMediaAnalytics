"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { createProduct } from "@/app/inventory/actions";
import { methodsLabel } from "@/lib/branding";
import { lowCells, totalUnits, type InventoryProduct } from "@/lib/inventory";
import type { ProductType } from "@/lib/product-types";
import { NO_FILTERS, matches, type Filters } from "@/lib/filters";
import { NoPhoto } from "./drawings";
import { FilterBar } from "./filter-bar";
import { TypeSelect, cardSpecs } from "./specs-editor";

/** Every product on the shelves as cards, with a search box and an Add button. */
export function ProductList({ products, types }: { products: InventoryProduct[]; types: ProductType[] }) {
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const typeOf = (id: string | null) => types.find((t) => t.id === id) ?? null;
  const q = query.trim().toLowerCase();
  const filtered = products.filter((p) =>
    matches({ ...p, priceAt: () => p.cost, units: totalUnits(p.stock), isLow: lowCells(p.stock, p.lowStockAt).length > 0 }, filters, types),
  );
  const shown = q
    ? filtered.filter((p) =>
        [p.name, p.brand, p.styleNumber, typeOf(p.typeId)?.name, p.location, ...p.stock.map((s) => s.colour), ...Object.values(p.specs).map(String), ...p.brandingMethods].some((v) => v?.toLowerCase().includes(q)),
      )
    : filtered;
  const units = products.reduce((n, p) => n + totalUnits(p.stock), 0);
  const running = products.filter((p) => lowCells(p.stock, p.lowStockAt).length > 0).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <p className="text-lg text-ink-2">
          <span className="font-semibold text-ink">{products.length}</span> {products.length === 1 ? "product" : "products"} ·{" "}
          <span className="font-semibold text-ink">{units.toLocaleString("en-CA")}</span> units
          {running > 0 && (
            <>
              {" "}· <span className="font-semibold text-bad">{running} running low</span>
            </>
          )}
        </p>
        <AddProduct types={types} />
      </div>

      {products.length > 0 && (
        <FilterBar
          types={types}
          methodsInUse={products.flatMap((p) => p.brandingMethods)}
          filters={filters}
          onChange={setFilters}
          kind="calgary"
          shown={filtered.length}
          total={products.length}
        />
      )}

      {products.length > 0 && (
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, type, brand, colour, spec, branding or shelf"
          aria-label="Search inventory"
          className="h-10 w-full max-w-md rounded-lg border border-line bg-surface px-3 text-sm"
        />
      )}

      {products.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line p-8 text-center text-ink-2">
          Nothing on the shelves yet. Add your first product above: give it a name, then add photos, specs and counts.
        </p>
      ) : shown.length === 0 ? (
        <p className="text-ink-2">{q ? <>Nothing matches &ldquo;{query}&rdquo;{filtered.length < products.length && " with these filters"}.</> : "Nothing matches these filters."}</p>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {shown.map((p) => (
            <li key={p.id}>
              <ProductCard product={p} type={typeOf(p.typeId)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ProductCard({ product: p, type }: { product: InventoryProduct; type: ProductType | null }) {
  const low = lowCells(p.stock, p.lowStockAt);
  const colours = new Set(p.stock.map((s) => s.colour).filter(Boolean)).size;
  return (
    <Link href={`/inventory/${p.id}`} className="flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-surface hover:border-ink-2">
      <div className="aspect-square bg-surface-2">
        {p.photoUrls[0] ? (
          // Signed links to private photos; a plain <img> keeps it simple.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.photoUrls[0]} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <NoPhoto icon={type?.icon} />
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-4">
        <h2 className="leading-snug font-semibold">{p.name}</h2>
        <p className="text-sm text-ink-2">{[p.brand, p.styleNumber].filter(Boolean).join(" · ") || "No brand or style yet"}</p>
        <p className="text-sm text-ink-2">{cardSpecs(type, p.specs) || "No type yet"}</p>
        {methodsLabel(p.brandingMethods) && <p className="text-sm text-ink-2">Branding: {methodsLabel(p.brandingMethods)}</p>}
        <p className="mt-auto pt-2 text-sm">
          <span className="font-semibold">{totalUnits(p.stock).toLocaleString("en-CA")}</span> units
          {colours > 0 && <span className="text-ink-2"> · {colours} {colours === 1 ? "colour" : "colours"}</span>}
          {p.location && <span className="text-ink-2"> · {p.location}</span>}
        </p>
        {low.length > 0 && (
          <p className="text-sm font-semibold text-bad">
            {low.length} {low.length === 1 ? "size" : "sizes"} running low
          </p>
        )}
      </div>
    </Link>
  );
}

function AddProduct({ types }: { types: ProductType[] }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      action={(fd) =>
        start(async () => {
          // On success the action opens the new product's page.
          const r = await createProduct(fd);
          if (r) setError(r.ok ? null : (r.message ?? "That didn't save."));
        })
      }
      className="flex flex-wrap items-end gap-2"
    >
      <label className="flex flex-col gap-1 text-xs text-muted">
        Add a product
        <input name="name" required maxLength={120} placeholder="e.g. Black pullover hoodie" className="h-9 w-64 rounded-lg border border-line bg-page px-3 text-sm text-ink" />
      </label>
      <TypeSelect types={types} />
      <button type="submit" disabled={pending} className="h-9 rounded-lg bg-ink px-4 text-sm font-semibold text-page disabled:opacity-60">
        {pending ? "Adding…" : "Add"}
      </button>
      {error && <p className="w-full text-sm text-bad">{error}</p>}
    </form>
  );
}
