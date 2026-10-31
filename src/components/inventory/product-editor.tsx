"use client";

import { useOptimistic, useRef, useState, useTransition } from "react";
import clsx from "clsx";
import {
  addPhoto,
  addStock,
  adjustStock,
  archiveProduct,
  makeCover,
  removeColour,
  removePhoto,
  removeStockCell,
  setStock,
  updateProduct,
  type ActionResult,
} from "@/app/inventory/actions";
import { STANDARD_SIZES, stockGrid, totalUnits, type InventoryProduct, type StockCell } from "@/lib/inventory";
import type { IconKey, ProductType } from "@/lib/product-types";
import { Photos } from "./photos";
import { SpecsEditor, SpecsSummary } from "./specs-editor";

const card = "rounded-2xl border border-line bg-surface p-5";
const field = "h-9 w-full rounded-lg border border-line bg-page px-3 text-sm text-ink";
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
  m && <p className={clsx("text-sm", m.ok ? "text-good" : "text-bad")} role={m.ok ? "status" : "alert"}>{m.text}</p>;

/** A product's page: photos, the colour × size counts, and its details. */
export function ProductEditor({ product, types, canUpload }: { product: InventoryProduct; types: ProductType[]; canUpload: boolean }) {
  const type = types.find((t) => t.id === product.typeId) ?? null;
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="flex flex-col gap-6">
        <ProductPhotos product={product} icon={type?.icon} canUpload={canUpload} />
        <SpecsSummary type={type} specs={product.specs} customFields={product.customFields} />
        <Stock product={product} />
      </div>
      <div className="flex flex-col gap-6">
        <Details product={product} types={types} />
        <Archive product={product} />
      </div>
    </div>
  );
}

function ProductPhotos({ product, icon, canUpload }: { product: InventoryProduct; icon?: IconKey; canUpload: boolean }) {
  return (
    <Photos
      name={product.name}
      photos={product.photos}
      photoUrls={product.photoUrls}
      folder={product.id}
      icon={icon}
      canUpload={canUpload}
      onAdd={(path) => addPhoto(product.id, path)}
      onRemove={(path) => removePhoto(product.id, path)}
      onCover={(path) => makeCover(product.id, path)}
    />
  );
}

// ─── Stock counts ──────────────────────────────────────────────────────────

function Stock({ product }: { product: InventoryProduct }) {
  const [stock, apply] = useOptimistic(product.stock, (state: StockCell[], c: { id: string; quantity: number }) =>
    state.map((s) => (s.id === c.id ? { ...s, quantity: c.quantity } : s)),
  );
  const { pending, message, run } = useAction();
  const grid = stockGrid(stock);
  const low = product.lowStockAt;

  const change = (cell: StockCell, quantity: number, action: () => Promise<ActionResult>) =>
    run(async () => {
      apply({ id: cell.id, quantity: Math.max(0, quantity) });
      return action();
    });

  return (
    <section className={card}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <H2>On the shelf</H2>
        <p className="text-sm text-ink-2">
          <span className="font-semibold text-ink">{totalUnits(stock).toLocaleString("en-CA")}</span> units
          {low > 0 && <> · low at {low} or fewer</>}
        </p>
      </div>

      {grid.colours.length === 0 && <p className="mb-4 text-sm text-ink-2">No sizes yet. Add a colour and its sizes below to start counting.</p>}

      <div className="flex flex-col gap-5">
        {grid.colours.map((colour) => {
          const cells = grid.sizes.flatMap((size) => grid.cell(colour, size) ?? []);
          return (
            <div key={colour || "none"}>
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <h3 className="font-semibold">
                  {colour || "No colour"}{" "}
                  <span className="text-sm font-normal text-ink-2">· {totalUnits(cells).toLocaleString("en-CA")}</span>
                </h3>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => confirm(`Remove ${colour || "this colour"} and all its counts?`) && run(() => removeColour(product.id, colour))}
                  className="text-xs text-muted hover:text-bad"
                >
                  Remove colour
                </button>
              </div>
              <ul className="flex flex-wrap gap-2">
                {cells.map((cell) => (
                  <li key={cell.id}>
                    <Counter
                      cell={cell}
                      isLow={low > 0 && cell.quantity <= low}
                      onStep={(d) => change(cell, cell.quantity + d, () => adjustStock(cell.id, d))}
                      onSet={(n) => change(cell, n, () => setStock(cell.id, n))}
                      onRemove={() => confirm(`Remove size ${cell.size}${colour ? ` in ${colour}` : ""}?`) && run(() => removeStockCell(cell.id))}
                    />
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      <Message m={message} />
      <AddSizes productId={product.id} colours={grid.colours} />
    </section>
  );
}

function Counter({ cell, isLow, onStep, onSet, onRemove }: { cell: StockCell; isLow: boolean; onStep: (d: number) => void; onSet: (n: number) => void; onRemove: () => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const n = Number(draft);
    setDraft(null);
    if (Number.isInteger(n) && n >= 0 && n !== cell.quantity) onSet(n);
  };
  const step = "grid size-9 place-items-center rounded-lg bg-surface-2 text-lg font-semibold text-ink-2 hover:text-ink";
  return (
    <div className={clsx("flex w-36 flex-col gap-1 rounded-xl border p-2", isLow ? "border-[color:var(--status-critical)]" : "border-line")}>
      <div className="flex items-baseline justify-between px-1 text-sm">
        <span className="font-semibold">{cell.size}</span>
        {isLow ? (
          <span className="text-xs font-semibold text-bad">Low</span>
        ) : (
          cell.quantity === 0 && (
            <button type="button" onClick={onRemove} className="text-xs text-muted hover:text-bad" aria-label={`Remove size ${cell.size}`}>
              Remove
            </button>
          )
        )}
      </div>
      <div className="flex items-center gap-1">
        <button type="button" className={step} onClick={() => onStep(-1)} disabled={cell.quantity === 0} aria-label={`One less ${cell.size}`}>
          −
        </button>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          value={draft ?? String(cell.quantity)}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
          aria-label={`Count of ${cell.colour ? `${cell.colour} ` : ""}${cell.size}`}
          className="h-9 w-full min-w-0 rounded-lg border border-line bg-page text-center font-semibold tabular-nums"
        />
        <button type="button" className={step} onClick={() => onStep(1)} aria-label={`One more ${cell.size}`}>
          +
        </button>
      </div>
    </div>
  );
}

function AddSizes({ productId, colours }: { productId: string; colours: string[] }) {
  const { pending, message, run } = useAction();
  const form = useRef<HTMLFormElement>(null);
  return (
    <form
      ref={form}
      action={(fd) =>
        run(async () => {
          const other = String(fd.get("other") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
          const r = await addStock(productId, String(fd.get("colour") ?? ""), [...fd.getAll("size").map(String), ...other]);
          if (r.ok) form.current?.reset();
          return r;
        })
      }
      className="mt-6 flex flex-col gap-3 border-t border-line pt-4"
    >
      <p className="text-sm font-semibold">Add a colour or sizes</p>
      <label className="flex max-w-xs flex-col gap-1 text-xs text-muted">
        Colour (pick one above to add sizes to it)
        <input name="colour" list={`colours-${productId}`} placeholder="e.g. Black" maxLength={60} className={field} />
        <datalist id={`colours-${productId}`}>
          {colours.filter(Boolean).map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </label>
      <fieldset className="flex flex-wrap gap-2">
        <legend className="mb-1 text-xs text-muted">Sizes</legend>
        {STANDARD_SIZES.map((s) => (
          <label key={s} className="flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-sm has-[:checked]:border-ink has-[:checked]:bg-surface-2">
            <input type="checkbox" name="size" value={s} className="size-4" /> {s}
          </label>
        ))}
      </fieldset>
      <label className="flex max-w-xs flex-col gap-1 text-xs text-muted">
        Other sizes, separated by commas (e.g. One size, 32, Youth M)
        <input name="other" maxLength={200} className={field} />
      </label>
      <div>
        <button type="submit" disabled={pending} className="h-9 rounded-lg bg-ink px-4 text-sm font-semibold text-page disabled:opacity-60">
          {pending ? "Adding…" : "Add"}
        </button>
      </div>
      <Message m={message} />
    </form>
  );
}

// ─── Details ───────────────────────────────────────────────────────────────

const DETAILS: { name: string; label: string; key: keyof InventoryProduct; placeholder?: string; long?: boolean }[] = [
  { name: "name", label: "Name", key: "name" },
  { name: "brand", label: "Brand", key: "brand", placeholder: "e.g. Gildan" },
  { name: "style_number", label: "Style number", key: "styleNumber", placeholder: "e.g. 18500" },
  { name: "location", label: "Where it is", key: "location", placeholder: "e.g. Shelf A2" },
  { name: "description", label: "Description", key: "description", long: true },
  { name: "print_notes", label: "Printing notes", key: "printNotes", placeholder: "What prints well on it, press settings…", long: true },
];

function Details({ product, types }: { product: InventoryProduct; types: ProductType[] }) {
  const { pending, message, run } = useAction();
  return (
    <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); run(() => updateProduct(product.id, fd), "Saved."); }} className={clsx(card, "flex flex-col gap-3")}>
      <H2>Details and specs</H2>
      {DETAILS.map((d) => (
        <label key={d.name} className="flex flex-col gap-1 text-xs text-muted">
          {d.label}
          {d.long ? (
            <textarea name={d.name} defaultValue={(product[d.key] as string | null) ?? ""} placeholder={d.placeholder} rows={3} className="rounded-lg border border-line bg-page px-3 py-2 text-sm text-ink" />
          ) : (
            <input name={d.name} defaultValue={(product[d.key] as string | null) ?? ""} placeholder={d.placeholder} required={d.name === "name"} className={field} />
          )}
        </label>
      ))}
      <SpecsEditor types={types} typeId={product.typeId} specs={product.specs} customFields={product.customFields} table="inventory" productId={product.id} />
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-xs text-muted">
          Cost per unit (CAD)
          <input name="cost" inputMode="decimal" defaultValue={product.cost ?? ""} placeholder="e.g. 14.50" className={field} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Warn when a size is at or below
          <input name="low_stock_at" type="number" min={0} defaultValue={product.lowStockAt || ""} placeholder="Off" className={field} />
        </label>
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="h-9 rounded-lg bg-ink px-4 text-sm font-semibold text-page disabled:opacity-60">
          {pending ? "Saving…" : "Save"}
        </button>
        <Message m={message} />
      </div>
    </form>
  );
}

function Archive({ product }: { product: InventoryProduct }) {
  const { pending, message, run } = useAction();
  return (
    <div className="flex flex-col items-start gap-1 px-1">
      <button
        type="button"
        disabled={pending}
        onClick={() => confirm(`Take "${product.name}" off the inventory list?`) && run(() => archiveProduct(product.id))}
        className="text-sm text-muted hover:text-bad"
      >
        Remove this product
      </button>
      <Message m={message} />
    </div>
  );
}
