"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import clsx from "clsx";
import {
  addSupplierPhoto,
  archiveSupplier,
  archiveSupplierProduct,
  createSupplier,
  createSupplierProduct,
  makeSupplierCover,
  markChecked,
  removeSampleSuppliers,
  removeSupplierPhoto,
  updateSupplier,
  updateSupplierProduct,
  type ActionResult,
} from "@/app/inventory/suppliers/actions";
import type { ISODate } from "@/lib/dates";
import { STANDARD_SIZES } from "@/lib/inventory";
import {
  KIND_LABEL,
  MOQ_PER_LABEL,
  checkedLabel,
  cleanBreaks,
  fromPrice,
  moqLabel,
  money,
  type PriceBreak,
  type Supplier,
  type SupplierKind,
  type SupplierProduct,
} from "@/lib/suppliers";
import { Photos } from "./photos";

const card = "rounded-2xl border border-line bg-surface p-5";
const field = "h-9 w-full rounded-lg border border-line bg-page px-3 text-sm text-ink";
const button = "h-9 rounded-lg bg-ink px-4 text-sm font-semibold text-page disabled:opacity-60";
const H2 = ({ children }: { children: React.ReactNode }) => <h2 className="mb-3 text-sm font-semibold tracking-wide text-muted uppercase">{children}</h2>;

function useAction() {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const run = (fn: () => Promise<ActionResult>, okText?: string) =>
    start(async () => {
      const r = await fn();
      if (!r) return; // the action redirected
      setMessage(r.ok ? (okText ? { ok: true, text: okText } : null) : { ok: false, text: r.message ?? "That didn't save." });
    });
  return { pending, message, run };
}

const Message = ({ m }: { m: { ok: boolean; text: string } | null }) =>
  m && (
    <p className={clsx("text-sm", m.ok ? "text-good" : "text-bad")} role={m.ok ? "status" : "alert"}>
      {m.text}
    </p>
  );

export function SampleBadge() {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--status-warning)] px-2 py-0.5 text-xs font-semibold text-ink"
      title="Made-up example data, to show how this works. Replace it with your real suppliers."
    >
      <span aria-hidden className="size-1.5 rounded-full bg-[color:var(--status-warning)]" />
      Sample
    </span>
  );
}

const sizeRange = (sizes: string[]) => (sizes.length > 2 ? `${sizes[0]}–${sizes[sizes.length - 1]}` : sizes.join(", "));

// ─── Directory ────────────────────────────────────────────────────────────

/** Every supplier with its products, a search box, and Add supplier. */
export function SupplierDirectory({
  suppliers,
  today,
  isAdmin,
}: {
  suppliers: { supplier: Supplier; products: SupplierProduct[] }[];
  today: ISODate;
  isAdmin: boolean;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const hit = (v: string | null | undefined) => Boolean(v?.toLowerCase().includes(q));
  const shown = suppliers
    .map(({ supplier, products }) => ({
      supplier,
      products: !q || hit(supplier.name) || hit(KIND_LABEL[supplier.kind]) ? products : products.filter((p) => [p.name, p.brand, p.styleNumber, p.category, ...p.colours].some(hit)),
    }))
    .filter(({ supplier, products }) => !q || products.length > 0 || hit(supplier.name));
  const hasSample = suppliers.some((s) => s.supplier.isSample || s.products.some((p) => p.isSample));
  const count = suppliers.reduce((n, s) => n + s.products.length, 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <p className="text-lg text-ink-2">
          <span className="font-semibold text-ink">{suppliers.length}</span> {suppliers.length === 1 ? "supplier" : "suppliers"} ·{" "}
          <span className="font-semibold text-ink">{count}</span> {count === 1 ? "product" : "products"}
        </p>
        <AddSupplier />
      </div>

      {hasSample && <SampleNotice isAdmin={isAdmin} />}

      {suppliers.length > 0 && (
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search suppliers, products, brands, colours"
          aria-label="Search suppliers"
          className="h-10 w-full max-w-md rounded-lg border border-line bg-surface px-3 text-sm"
        />
      )}

      {suppliers.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line p-8 text-center text-ink-2">
          No suppliers yet. Add your dropshipper, blank supplier or manufacturer above, then add what you can order from them.
        </p>
      ) : shown.length === 0 ? (
        <p className="text-ink-2">Nothing matches &ldquo;{query}&rdquo;.</p>
      ) : (
        shown.map(({ supplier, products }) => (
          <section key={supplier.id} className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 className="text-2xl font-bold tracking-tight">
                  <Link href={`/inventory/suppliers/${supplier.id}`} className="hover:underline">
                    {supplier.name}
                  </Link>
                </h2>
                <span className="text-sm text-ink-2">{[KIND_LABEL[supplier.kind], supplier.location].filter(Boolean).join(" · ")}</span>
                {supplier.isSample && <SampleBadge />}
              </div>
              <Link href={`/inventory/suppliers/${supplier.id}`} className="text-sm font-medium text-ink-2 hover:text-ink">
                Supplier details →
              </Link>
            </div>
            {supplier.leadTime && <p className="-mt-2 text-sm text-ink-2">Lead time: {supplier.leadTime}</p>}
            <ProductGrid supplierId={supplier.id} products={products} today={today} />
          </section>
        ))
      )}
    </div>
  );
}

function SampleNotice({ isAdmin }: { isAdmin: boolean }) {
  const { pending, message, run } = useAction();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[color:var(--status-warning)] p-4">
      <p className="text-sm text-ink">
        <span className="font-semibold">Suppliers marked Sample are made up</span>, to show how this works. Add your real suppliers, then remove the samples.
      </p>
      {isAdmin && (
        <button
          type="button"
          disabled={pending}
          onClick={() => confirm("Delete all the sample suppliers and their products?") && run(() => removeSampleSuppliers())}
          className="h-9 rounded-lg border border-line px-3 text-sm font-medium text-ink-2 hover:text-bad"
        >
          {pending ? "Removing…" : "Remove samples"}
        </button>
      )}
      <Message m={message} />
    </div>
  );
}

function AddSupplier() {
  const { pending, message, run } = useAction();
  return (
    <form action={(fd) => run(() => createSupplier(fd))} className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1 text-xs text-muted">
        Add a supplier
        <input name="name" required maxLength={120} placeholder="Company name" className="h-9 w-56 rounded-lg border border-line bg-page px-3 text-sm text-ink" />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Type
        <KindSelect />
      </label>
      <button type="submit" disabled={pending} className={button}>
        {pending ? "Adding…" : "Add"}
      </button>
      <div className="w-full">
        <Message m={message} />
      </div>
    </form>
  );
}

function KindSelect({ value }: { value?: SupplierKind }) {
  return (
    <select name="kind" defaultValue={value ?? "dropship"} className="h-9 rounded-lg border border-line bg-page px-2 text-sm text-ink">
      {(Object.keys(KIND_LABEL) as SupplierKind[]).map((k) => (
        <option key={k} value={k}>
          {KIND_LABEL[k]}
        </option>
      ))}
    </select>
  );
}

function ProductGrid({ supplierId, products, today }: { supplierId: string; products: SupplierProduct[]; today: ISODate }) {
  if (!products.length) return <p className="text-sm text-ink-2">No products from this supplier yet.</p>;
  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {products.map((p) => {
        const checked = checkedLabel(p.lastChecked, today);
        const price = fromPrice(p.priceBreaks);
        return (
          <li key={p.id}>
            <Link href={`/inventory/suppliers/${supplierId}/${p.id}`} className="flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-surface hover:border-ink-2">
              <div className="aspect-[4/3] bg-surface-2">
                {p.photoUrls[0] ? (
                  // Signed links to private photos; a plain <img> keeps it simple.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.photoUrls[0]} alt="" loading="lazy" className="h-full w-full object-cover" />
                ) : (
                  <div className="grid h-full place-items-center text-sm text-muted">No photo yet</div>
                )}
              </div>
              <div className="flex flex-1 flex-col gap-1 p-4">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="leading-snug font-semibold">{p.name}</h3>
                  {p.isSample && <SampleBadge />}
                </div>
                <p className="text-sm text-ink-2">{[p.brand, p.styleNumber, p.category].filter(Boolean).join(" · ")}</p>
                <p className="mt-auto pt-2 text-sm font-semibold">
                  {moqLabel(p.moq, p.moqPer)}
                  {price && <span className="font-normal text-ink-2"> · {price}</span>}
                </p>
                <p className="text-sm text-ink-2">
                  {[p.sizes.length ? sizeRange(p.sizes) : null, p.colours.length ? `${p.colours.length} ${p.colours.length === 1 ? "colour" : "colours"}` : null].filter(Boolean).join(" · ") ||
                    "Sizes and colours not set"}
                </p>
                <p className={clsx("text-xs", checked.stale ? "font-semibold text-bad" : "text-muted")}>
                  {checked.text}
                  {checked.stale && " · worth re-checking"}
                </p>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

// ─── One supplier ─────────────────────────────────────────────────────────

const SUPPLIER_FIELDS: { name: string; label: string; key: keyof Supplier; placeholder?: string; long?: boolean; type?: string }[] = [
  { name: "name", label: "Name", key: "name" },
  { name: "location", label: "Where they are", key: "location", placeholder: "e.g. Edmonton, AB" },
  { name: "website", label: "Website", key: "website", placeholder: "e.g. example.com" },
  { name: "contact_name", label: "Contact person", key: "contactName" },
  { name: "contact_email", label: "Contact email", key: "contactEmail", type: "email" },
  { name: "contact_phone", label: "Contact phone", key: "contactPhone", type: "tel" },
  { name: "lead_time", label: "Usual lead time", key: "leadTime", placeholder: "e.g. 3–5 business days to print, plus shipping" },
  { name: "shipping_notes", label: "Shipping", key: "shippingNotes", placeholder: "Costs, blind shipping, where they ship to…", long: true },
  { name: "notes", label: "Notes", key: "notes", long: true },
];

export function SupplierEditor({ supplier, products, today }: { supplier: Supplier; products: SupplierProduct[]; today: ISODate }) {
  const details = useAction();
  const archive = useAction();
  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-2xl font-bold tracking-tight">What we can order</h2>
          <AddSupplierProduct supplierId={supplier.id} />
        </div>
        <ProductGrid supplierId={supplier.id} products={products} today={today} />
      </section>

      <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); details.run(() => updateSupplier(supplier.id, fd), "Saved."); }} className={clsx(card, "flex max-w-2xl flex-col gap-3")}>
        <H2>Supplier details</H2>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Type
          <KindSelect value={supplier.kind} />
        </label>
        {SUPPLIER_FIELDS.map((f) => (
          <label key={f.name} className="flex flex-col gap-1 text-xs text-muted">
            {f.label}
            {f.long ? (
              <textarea name={f.name} defaultValue={(supplier[f.key] as string | null) ?? ""} placeholder={f.placeholder} rows={3} className="rounded-lg border border-line bg-page px-3 py-2 text-sm text-ink" />
            ) : (
              <input name={f.name} type={f.type ?? "text"} defaultValue={(supplier[f.key] as string | null) ?? ""} placeholder={f.placeholder} required={f.name === "name"} className={field} />
            )}
          </label>
        ))}
        <div className="flex items-center gap-3">
          <button type="submit" disabled={details.pending} className={button}>
            {details.pending ? "Saving…" : "Save"}
          </button>
          <Message m={details.message} />
        </div>
      </form>

      <div className="flex flex-col items-start gap-1 px-1">
        <button
          type="button"
          disabled={archive.pending}
          onClick={() => confirm(`Take ${supplier.name} and its products off the list?`) && archive.run(() => archiveSupplier(supplier.id))}
          className="text-sm text-muted hover:text-bad"
        >
          Remove this supplier
        </button>
        <Message m={archive.message} />
      </div>
    </div>
  );
}

function AddSupplierProduct({ supplierId }: { supplierId: string }) {
  const { pending, message, run } = useAction();
  return (
    <form action={(fd) => run(() => createSupplierProduct(supplierId, fd))} className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1 text-xs text-muted">
        Add a product
        <input name="name" required maxLength={120} placeholder="e.g. Heavyweight hoodie" className="h-9 w-56 rounded-lg border border-line bg-page px-3 text-sm text-ink" />
      </label>
      <button type="submit" disabled={pending} className={button}>
        {pending ? "Adding…" : "Add"}
      </button>
      <div className="w-full">
        <Message m={message} />
      </div>
    </form>
  );
}

// ─── One supplier product ─────────────────────────────────────────────────

export function SupplierProductEditor({ supplier, product, today, canUpload }: { supplier: Supplier; product: SupplierProduct; today: ISODate; canUpload: boolean }) {
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="flex flex-col gap-6">
        <Summary supplier={supplier} product={product} today={today} />
        <Photos
          name={product.name}
          photos={product.photos}
          photoUrls={product.photoUrls}
          folder={`suppliers/${product.id}`}
          canUpload={canUpload}
          onAdd={(path) => addSupplierPhoto(product.id, path)}
          onRemove={(path) => removeSupplierPhoto(product.id, path)}
          onCover={(path) => makeSupplierCover(product.id, path)}
        />
      </div>
      <div className="flex flex-col gap-6">
        <ProductDetails product={product} />
        <ArchiveProduct product={product} />
      </div>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

/** The ordering facts at a glance: minimum, prices, sizes, colours, timing. */
function Summary({ supplier, product: p, today }: { supplier: Supplier; product: SupplierProduct; today: ISODate }) {
  const { pending, message, run } = useAction();
  const checked = checkedLabel(p.lastChecked, today);
  const breaks = cleanBreaks(p.priceBreaks);
  return (
    <section className={card}>
      <H2>Ordering</H2>
      <p className="font-display text-3xl font-extrabold tracking-tight">{moqLabel(p.moq, p.moqPer)}</p>

      {breaks.length > 0 ? (
        <table className="mt-4 w-full max-w-sm text-sm">
          <thead>
            <tr className="text-left text-xs text-muted">
              <th className="py-1 font-medium">Order</th>
              <th className="py-1 text-right font-medium">Price each (CAD)</th>
            </tr>
          </thead>
          <tbody>
            {breaks.map((b, i) => (
              <tr key={b.minQty} className="border-t border-line">
                <td className="py-1.5">{breaks[i + 1] ? `${b.minQty}–${breaks[i + 1].minQty - 1}` : `${b.minQty}+`}</td>
                <td className="py-1.5 text-right font-semibold tabular-nums">{money(b.price)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="mt-2 text-sm text-ink-2">No prices yet.</p>
      )}

      <dl className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Fact label="Sizes">{p.sizes.length ? p.sizes.join(", ") : "Not set"}</Fact>
        <Fact label="Colours">{p.colours.length ? p.colours.join(", ") : "Not set"}</Fact>
        <Fact label="Lead time">{p.leadTime ?? supplier.leadTime ?? "Not set"}</Fact>
        <Fact label="Sample cost">{p.sampleCost === null ? "Not set" : money(p.sampleCost)}</Fact>
      </dl>

      <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-line pt-4">
        <p className={clsx("text-sm", checked.stale ? "font-semibold text-bad" : "text-ink-2")}>
          {checked.text}
          {checked.stale && " · worth re-checking with the supplier"}
        </p>
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => markChecked(p.id, today), "Marked as checked today.")}
          className="h-8 rounded-lg border border-line px-3 text-xs font-medium text-ink-2 hover:text-ink"
        >
          I just checked this
        </button>
        <Message m={message} />
      </div>
    </section>
  );
}

const PRODUCT_FIELDS: { name: string; label: string; key: keyof SupplierProduct; placeholder?: string; long?: boolean }[] = [
  { name: "name", label: "Name", key: "name" },
  { name: "brand", label: "Brand", key: "brand" },
  { name: "style_number", label: "Style number", key: "styleNumber" },
  { name: "category", label: "Type", key: "category", placeholder: "e.g. Hoodie, T-shirt, Hat" },
  { name: "fabric", label: "Fabric", key: "fabric" },
  { name: "weight", label: "Weight", key: "weight", placeholder: "e.g. 8 oz or 270 gsm" },
  { name: "fit", label: "Fit", key: "fit" },
  { name: "description", label: "Description", key: "description", long: true },
  { name: "print_notes", label: "Printing / decoration", key: "printNotes", placeholder: "What they can print or stitch, and where", long: true },
];

function ProductDetails({ product: p }: { product: SupplierProduct }) {
  const { pending, message, run } = useAction();
  const [breaks, setBreaks] = useState<{ key: number; minQty: string; price: string }[]>(() => {
    const rows = cleanBreaks(p.priceBreaks).map((b: PriceBreak, i) => ({ key: i, minQty: String(b.minQty), price: String(b.price) }));
    return rows.length ? rows : [{ key: 0, minQty: "", price: "" }];
  });
  const nextKey = useRef(breaks.length);
  const standard = new Set(STANDARD_SIZES);
  const other = p.sizes.filter((s) => !standard.has(s));

  return (
    <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); run(() => updateSupplierProduct(p.id, fd), "Saved."); }} className={clsx(card, "flex flex-col gap-3")}>
      <H2>Details and specs</H2>
      {PRODUCT_FIELDS.map((f) => (
        <label key={f.name} className="flex flex-col gap-1 text-xs text-muted">
          {f.label}
          {f.long ? (
            <textarea name={f.name} defaultValue={(p[f.key] as string | null) ?? ""} placeholder={f.placeholder} rows={3} className="rounded-lg border border-line bg-page px-3 py-2 text-sm text-ink" />
          ) : (
            <input name={f.name} defaultValue={(p[f.key] as string | null) ?? ""} placeholder={f.placeholder} required={f.name === "name"} className={field} />
          )}
        </label>
      ))}

      <p className="mt-2 text-sm font-semibold">Ordering</p>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-xs text-muted">
          Minimum order
          <input name="moq" type="number" min={1} defaultValue={p.moq ?? ""} placeholder="e.g. 12" className={field} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Applies
          <select name="moq_per" defaultValue={p.moqPer} className="h-9 rounded-lg border border-line bg-page px-2 text-sm text-ink">
            {Object.entries(MOQ_PER_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-xs text-muted">Price breaks (CAD each)</legend>
        {breaks.map((b, i) => (
          <div key={b.key} className="flex items-center gap-2">
            <input
              name="break_qty"
              type="number"
              min={1}
              value={b.minQty}
              onChange={(e) => setBreaks(breaks.map((x, j) => (j === i ? { ...x, minQty: e.target.value } : x)))}
              placeholder="Qty"
              aria-label="From quantity"
              className="h-9 w-24 rounded-lg border border-line bg-page px-3 text-sm"
            />
            <span className="text-sm text-ink-2">+ at $</span>
            <input
              name="break_price"
              inputMode="decimal"
              value={b.price}
              onChange={(e) => setBreaks(breaks.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))}
              placeholder="0.00"
              aria-label="Price each"
              className="h-9 w-28 rounded-lg border border-line bg-page px-3 text-sm"
            />
            <button type="button" onClick={() => setBreaks(breaks.filter((_, j) => j !== i))} className="text-xs text-muted hover:text-bad" aria-label="Remove this price break">
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setBreaks([...breaks, { key: nextKey.current++, minQty: "", price: "" }])}
          className="w-fit text-sm font-medium text-ink-2 hover:text-ink"
        >
          + Add a price break
        </button>
      </fieldset>

      <fieldset className="flex flex-wrap gap-2">
        <legend className="mb-1 text-xs text-muted">Sizes available</legend>
        {STANDARD_SIZES.map((s) => (
          <label key={s} className="flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-sm has-[:checked]:border-ink has-[:checked]:bg-surface-2">
            <input type="checkbox" name="size" value={s} defaultChecked={p.sizes.includes(s)} className="size-4" /> {s}
          </label>
        ))}
      </fieldset>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Other sizes, separated by commas
        <input name="other_sizes" defaultValue={other.join(", ")} placeholder="e.g. One size, Youth M, 32" className={field} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Colours, separated by commas
        <input name="colours" defaultValue={p.colours.join(", ")} placeholder="e.g. Black, Navy, Safety Orange" className={field} />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="col-span-2 flex flex-col gap-1 text-xs text-muted">
          Lead time (leave blank to use the supplier&apos;s)
          <input name="lead_time" defaultValue={p.leadTime ?? ""} className={field} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Sample cost (CAD)
          <input name="sample_cost" inputMode="decimal" defaultValue={p.sampleCost ?? ""} placeholder="e.g. 85" className={field} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Last checked with supplier
          <input name="last_checked" type="date" defaultValue={p.lastChecked ?? ""} className={field} />
        </label>
      </div>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={button}>
          {pending ? "Saving…" : "Save"}
        </button>
        <Message m={message} />
      </div>
    </form>
  );
}

function ArchiveProduct({ product }: { product: SupplierProduct }) {
  const { pending, message, run } = useAction();
  return (
    <div className="flex flex-col items-start gap-1 px-1">
      <button
        type="button"
        disabled={pending}
        onClick={() => confirm(`Take "${product.name}" off the list?`) && run(() => archiveSupplierProduct(product.id, product.supplierId))}
        className="text-sm text-muted hover:text-bad"
      >
        Remove this product
      </button>
      <Message m={message} />
    </div>
  );
}
