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
import { createBrowserSupabase } from "@/lib/supabase/browser";

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
export function ProductEditor({ product, canUpload }: { product: InventoryProduct; canUpload: boolean }) {
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="flex flex-col gap-6">
        <Photos product={product} canUpload={canUpload} />
        <Stock product={product} />
      </div>
      <div className="flex flex-col gap-6">
        <Details product={product} />
        <Archive product={product} />
      </div>
    </div>
  );
}

// ─── Photos ────────────────────────────────────────────────────────────────

/** Phone photos are huge; shrink to at most 1600 px on the long side as a JPEG. */
async function shrink(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't read that photo."))), "image/jpeg", 0.85));
}

function Photos({ product, canUpload }: { product: InventoryProduct; canUpload: boolean }) {
  const { pending, message, run } = useAction();
  const input = useRef<HTMLInputElement>(null);

  const upload = (files: FileList | null) => {
    if (!files?.length) return;
    run(async () => {
      const db = createBrowserSupabase();
      for (const file of Array.from(files).slice(0, 10)) {
        if (!file.type.startsWith("image/")) continue;
        const blob = await shrink(file);
        const path = `${product.id}/${crypto.randomUUID()}.jpg`;
        const { error } = await db.storage.from("inventory").upload(path, blob, { contentType: "image/jpeg" });
        if (error) return { ok: false, message: `Upload failed: ${error.message}` };
        const r = await addPhoto(product.id, path);
        if (!r.ok) return r;
      }
      if (input.current) input.current.value = "";
      return { ok: true };
    });
  };

  return (
    <section className={card} aria-busy={pending}>
      <H2>Photos</H2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {product.photos.map((path, i) => (
          <figure key={path} className="flex flex-col gap-1">
            <div className="aspect-square overflow-hidden rounded-xl bg-surface-2">
              {product.photoUrls[i] && (
                // Signed links to private photos; a plain <img> keeps it simple.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={product.photoUrls[i]} alt={`${product.name}, photo ${i + 1}`} className="h-full w-full object-cover" />
              )}
            </div>
            <figcaption className="flex justify-between gap-2 text-xs">
              {i === 0 ? (
                <span className="font-semibold text-ink-2">Cover</span>
              ) : (
                <button type="button" disabled={pending} onClick={() => run(() => makeCover(product.id, path))} className="text-ink-2 hover:text-ink">
                  Make cover
                </button>
              )}
              <button
                type="button"
                disabled={pending}
                onClick={() => confirm("Delete this photo?") && run(() => removePhoto(product.id, path))}
                className="text-muted hover:text-bad"
              >
                Delete
              </button>
            </figcaption>
          </figure>
        ))}
        <label
          className={clsx(
            "grid aspect-square cursor-pointer place-items-center rounded-xl border-2 border-dashed border-line p-3 text-center text-sm text-ink-2 hover:border-ink-2 hover:text-ink",
            (!canUpload || pending) && "pointer-events-none opacity-50",
          )}
        >
          {pending ? "Uploading…" : "+ Add photos"}
          <input ref={input} type="file" accept="image/*" multiple disabled={!canUpload || pending} onChange={(e) => upload(e.target.files)} className="sr-only" />
        </label>
      </div>
      {!canUpload && <p className="mt-2 text-xs text-muted">Photos can be added on the live site.</p>}
      <Message m={message} />
    </section>
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
  { name: "category", label: "Type", key: "category", placeholder: "e.g. Hoodie, T-shirt, Hat" },
  { name: "fabric", label: "Fabric", key: "fabric", placeholder: "e.g. 50% cotton / 50% polyester" },
  { name: "weight", label: "Weight", key: "weight", placeholder: "e.g. 8 oz or 270 gsm" },
  { name: "fit", label: "Fit", key: "fit", placeholder: "e.g. Classic, Relaxed, Women's" },
  { name: "location", label: "Where it is", key: "location", placeholder: "e.g. Shelf A2" },
  { name: "description", label: "Description", key: "description", long: true },
  { name: "print_notes", label: "Printing notes", key: "printNotes", placeholder: "What prints well on it, press settings…", long: true },
];

function Details({ product }: { product: InventoryProduct }) {
  const { pending, message, run } = useAction();
  return (
    <form action={(fd) => run(() => updateProduct(product.id, fd), "Saved.")} className={clsx(card, "flex flex-col gap-3")}>
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
