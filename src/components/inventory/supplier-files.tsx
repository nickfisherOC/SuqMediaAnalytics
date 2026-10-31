"use client";

import { useRef, useState, useTransition } from "react";
import clsx from "clsx";
import { setSupplierFile } from "@/app/inventory/suppliers/actions";
import type { Supplier } from "@/lib/suppliers";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { shrink } from "./photos";

/** A supplier's logo and business card: one image each, uploaded straight to the private bucket. */
export function SupplierFiles({ supplier, canUpload }: { supplier: Supplier; canUpload: boolean }) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-5">
      <h2 className="mb-3 text-sm font-semibold tracking-wide text-muted uppercase">Logo and business card</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <Slot supplier={supplier} slot="logo" label="Logo" path={supplier.logo} url={supplier.logoUrl} canUpload={canUpload} />
        <Slot supplier={supplier} slot="card" label="Business card" path={supplier.businessCard} url={supplier.businessCardUrl} canUpload={canUpload} />
      </div>
      {!canUpload && <p className="mt-2 text-xs text-muted">These can be added on the live site.</p>}
    </section>
  );
}

function Slot({
  supplier,
  slot,
  label,
  path,
  url,
  canUpload,
}: {
  supplier: Supplier;
  slot: "logo" | "card";
  label: string;
  path: string | null;
  url: string | null;
  canUpload: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const run = (fn: () => Promise<{ ok: boolean; message?: string }>) =>
    start(async () => {
      const r = await fn();
      setError(r.ok ? null : (r.message ?? "That didn't save."));
      if (input.current) input.current.value = "";
    });

  const upload = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return setError("Use a photo or image file (JPG or PNG). PDFs can't be added here yet.");
    run(async () => {
      // Logos keep a see-through background as PNG; card photos go to JPEG.
      const png = slot === "logo" && file.type === "image/png";
      const type = png ? "image/png" : "image/jpeg";
      const newPath = `supplier-files/${supplier.id}/${slot}-${crypto.randomUUID()}.${png ? "png" : "jpg"}`;
      const db = createBrowserSupabase();
      const { error } = await db.storage.from("inventory").upload(newPath, await shrink(file, type), { contentType: type });
      if (error) return { ok: false, message: `Upload failed: ${error.message}` };
      return setSupplierFile(supplier.id, slot, newPath);
    });
  };

  return (
    <figure className="flex flex-col gap-2" aria-busy={pending}>
      <figcaption className="text-xs font-medium text-ink-2">{label}</figcaption>
      <label
        className={clsx(
          "grid cursor-pointer place-items-center overflow-hidden rounded-xl text-center text-sm text-ink-2",
          slot === "logo" ? "aspect-square max-w-48" : "aspect-[7/4]",
          url ? "bg-surface-2" : "border-2 border-dashed border-line p-3 hover:border-ink-2 hover:text-ink",
          (!canUpload || pending) && "pointer-events-none",
          !url && (!canUpload || pending) && "opacity-50",
        )}
      >
        {url ? (
          // A signed link to a private image; a plain <img> keeps it simple.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={`${supplier.name} ${label.toLowerCase()}`} className={clsx("h-full w-full", slot === "logo" ? "object-contain p-3" : "object-cover")} />
        ) : pending ? (
          "Uploading…"
        ) : (
          `+ Add ${label.toLowerCase()}`
        )}
        <input ref={input} type="file" accept="image/*" disabled={!canUpload || pending} onChange={(e) => upload(e.target.files?.[0])} className="sr-only" />
      </label>
      {path && (
        <div className="flex gap-3 text-xs">
          {url && (
            <a href={url} target="_blank" rel="noreferrer" className="text-ink-2 hover:text-ink">
              Open full size
            </a>
          )}
          <button type="button" disabled={pending || !canUpload} onClick={() => input.current?.click()} className="text-ink-2 hover:text-ink">
            {pending ? "Uploading…" : "Replace"}
          </button>
          <button
            type="button"
            disabled={pending || !canUpload}
            onClick={() => confirm(`Delete the ${label.toLowerCase()}?`) && run(() => setSupplierFile(supplier.id, slot, null))}
            className="text-muted hover:text-bad"
          >
            Delete
          </button>
        </div>
      )}
      {error && (
        <p className="text-sm text-bad" role="alert">
          {error}
        </p>
      )}
    </figure>
  );
}
