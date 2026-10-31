"use client";

import { useRef, useState } from "react";
import { BRANDING_METHODS, locationSuggestions, type ImprintArea } from "@/lib/branding";

const field = "h-9 rounded-lg border border-line bg-page px-3 text-sm text-ink";

/** Branding methods, logo spots and notes. Lives inside a details form. */
export function BrandingEditor({
  methods: savedMethods,
  areas,
  notes,
  typeSlug,
  productId,
  who,
}: {
  methods: string[];
  areas: ImprintArea[];
  notes: string | null;
  typeSlug: string | null | undefined;
  productId: string;
  /** "we" for Calgary stock, "the supplier" for supplier products. */
  who: string;
}) {
  const [methods, setMethods] = useState(savedMethods);
  const nextKey = useRef(areas.length);
  const [rows, setRows] = useState(() => areas.map((a, i) => ({ ...a, key: i })));
  // Methods saved earlier that aren't in the standard list stay available.
  const allMethods = [...BRANDING_METHODS, ...savedMethods.filter((m) => !(BRANDING_METHODS as readonly string[]).includes(m))];
  const listId = `imprint-spots-${productId}`;

  const set = (i: number, patch: Partial<ImprintArea>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-2 text-sm font-semibold">Branding</legend>

      <div className="flex flex-col gap-1">
        <p className="text-xs text-muted">How {who} can put a logo on it</p>
        <div className="flex flex-wrap gap-2">
          {allMethods.map((m) => (
            <label key={m} className="flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-sm has-[:checked]:border-ink has-[:checked]:bg-surface-2">
              <input
                type="checkbox"
                name="branding_method"
                value={m}
                checked={methods.includes(m)}
                onChange={(e) => setMethods(e.target.checked ? [...methods, m] : methods.filter((x) => x !== m))}
                className="size-4"
              />
              {m}
            </label>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-xs text-muted">Logo spots and the biggest logo that fits</p>
        <datalist id={listId}>
          {locationSuggestions(typeSlug).map((l) => (
            <option key={l} value={l} />
          ))}
        </datalist>
        {rows.map((r, i) => (
          <div key={r.key} className="flex flex-wrap items-center gap-2">
            <input
              name="imprint_location"
              list={listId}
              value={r.location}
              onChange={(e) => set(i, { location: e.target.value })}
              placeholder="Spot, e.g. Left chest"
              aria-label="Logo spot"
              maxLength={60}
              className={`${field} w-40`}
            />
            <input
              name="imprint_size"
              value={r.maxSize}
              onChange={(e) => set(i, { maxSize: e.target.value })}
              placeholder="Max size, e.g. 4 × 4 in"
              aria-label={`Biggest logo for ${r.location || "this spot"}`}
              maxLength={60}
              className={`${field} w-40`}
            />
            <select name="imprint_method" value={r.method} onChange={(e) => set(i, { method: e.target.value })} aria-label={`Method for ${r.location || "this spot"}`} className={field}>
              <option value="">Any method</option>
              {(methods.length ? methods : allMethods).concat(r.method && !methods.includes(r.method) && !allMethods.includes(r.method) ? [r.method] : []).map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <button type="button" onClick={() => setRows(rows.filter((_, j) => j !== i))} className="text-xs text-muted hover:text-bad">
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setRows([...rows, { key: nextKey.current++, location: "", maxSize: "", method: "" }])}
          className="w-fit text-sm font-medium text-ink-2 hover:text-ink"
        >
          + Add a logo spot
        </button>
      </div>

      <label className="flex flex-col gap-1 text-xs text-muted">
        Branding notes
        <textarea
          name="print_notes"
          defaultValue={notes ?? ""}
          placeholder="Press settings, stitch limits, colour limits…"
          rows={3}
          className="rounded-lg border border-line bg-page px-3 py-2 text-sm text-ink"
        />
      </label>
    </fieldset>
  );
}

/** Branding at a glance, for reading. */
export function BrandingSummary({ methods, areas, notes }: { methods: string[]; areas: ImprintArea[]; notes: string | null }) {
  const empty = !methods.length && !areas.length && !notes;
  return (
    <section className="rounded-2xl border border-line bg-surface p-5">
      <h2 className="mb-3 text-sm font-semibold tracking-wide text-muted uppercase">Branding</h2>
      {empty ? (
        <p className="text-sm text-ink-2">No branding details yet. Add methods and logo spots under Details and specs.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {methods.length > 0 && (
            <ul className="flex flex-wrap gap-2" aria-label="Branding methods">
              {methods.map((m) => (
                <li key={m} className="rounded-full bg-surface-2 px-3 py-1 text-sm font-medium">
                  {m}
                </li>
              ))}
            </ul>
          )}
          {areas.length > 0 && (
            <table className="w-full max-w-lg text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="py-1 font-medium">Logo spot</th>
                  <th className="py-1 font-medium">Biggest logo</th>
                  <th className="py-1 font-medium">Method</th>
                </tr>
              </thead>
              <tbody>
                {areas.map((a, i) => (
                  <tr key={`${a.location}-${i}`} className="border-t border-line">
                    <td className="py-1.5 font-medium">{a.location}</td>
                    <td className="py-1.5">{a.maxSize || "—"}</td>
                    <td className="py-1.5 text-ink-2">{a.method || "Any"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {notes && <p className="text-sm whitespace-pre-line text-ink-2">{notes}</p>}
        </div>
      )}
    </section>
  );
}
