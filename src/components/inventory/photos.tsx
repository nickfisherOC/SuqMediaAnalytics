"use client";

import { useRef, useState, useTransition } from "react";
import clsx from "clsx";
import { createBrowserSupabase } from "@/lib/supabase/browser";

interface Result {
  ok: boolean;
  message?: string;
}

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

/**
 * A product's photos: upload from a phone or computer (straight to the private
 * "inventory" bucket under `folder`), pick the cover, delete.
 */
export function Photos({
  name,
  photos,
  photoUrls,
  folder,
  canUpload,
  onAdd,
  onRemove,
  onCover,
}: {
  name: string;
  photos: string[];
  photoUrls: string[];
  /** Storage folder for new photos, e.g. "<product id>" or "suppliers/<product id>". */
  folder: string;
  canUpload: boolean;
  onAdd: (path: string) => Promise<Result>;
  onRemove: (path: string) => Promise<Result>;
  onCover: (path: string) => Promise<Result>;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const run = (fn: () => Promise<Result>) =>
    start(async () => {
      const r = await fn();
      setError(r.ok ? null : (r.message ?? "That didn't save."));
    });

  const upload = (files: FileList | null) => {
    if (!files?.length) return;
    run(async () => {
      const db = createBrowserSupabase();
      for (const file of Array.from(files).slice(0, 10)) {
        if (!file.type.startsWith("image/")) continue;
        const path = `${folder}/${crypto.randomUUID()}.jpg`;
        const { error } = await db.storage.from("inventory").upload(path, await shrink(file), { contentType: "image/jpeg" });
        if (error) return { ok: false, message: `Upload failed: ${error.message}` };
        const r = await onAdd(path);
        if (!r.ok) return r;
      }
      if (input.current) input.current.value = "";
      return { ok: true };
    });
  };

  return (
    <section className="rounded-2xl border border-line bg-surface p-5" aria-busy={pending}>
      <h2 className="mb-3 text-sm font-semibold tracking-wide text-muted uppercase">Photos</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {photos.map((path, i) => (
          <figure key={path} className="flex flex-col gap-1">
            <div className="aspect-square overflow-hidden rounded-xl bg-surface-2">
              {photoUrls[i] && (
                // Signed links to private photos; a plain <img> keeps it simple.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photoUrls[i]} alt={`${name}, photo ${i + 1}`} className="h-full w-full object-cover" />
              )}
            </div>
            <figcaption className="flex justify-between gap-2 text-xs">
              {i === 0 ? (
                <span className="font-semibold text-ink-2">Cover</span>
              ) : (
                <button type="button" disabled={pending} onClick={() => run(() => onCover(path))} className="text-ink-2 hover:text-ink">
                  Make cover
                </button>
              )}
              <button type="button" disabled={pending} onClick={() => confirm("Delete this photo?") && run(() => onRemove(path))} className="text-muted hover:text-bad">
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
      {error && (
        <p className="mt-2 text-sm text-bad" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
