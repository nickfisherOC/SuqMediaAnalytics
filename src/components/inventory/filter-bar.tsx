"use client";

import { useState } from "react";
import clsx from "clsx";
import { BRANDING_METHODS } from "@/lib/branding";
import { NO_FILTERS, activeCount, filterableFields, type Filters, type SpecFilter } from "@/lib/filters";
import type { ProductType, SpecField } from "@/lib/product-types";

const select = "h-9 rounded-lg border border-line bg-page px-2 text-sm text-ink";
const number = "h-9 w-24 rounded-lg border border-line bg-page px-3 text-sm text-ink";

const toNumber = (v: string): number | null => {
  const n = Number(v.replace(/[$,\s]/g, ""));
  return v.trim() && Number.isFinite(n) && n >= 0 ? n : null;
};

/**
 * Filters for an inventory list. "calgary" adds stock filters and filters on
 * cost; "suppliers" adds an order quantity (prices use its break, minimums must fit).
 */
export function FilterBar({
  types,
  methodsInUse,
  filters,
  onChange,
  kind,
  shown,
  total,
}: {
  types: ProductType[];
  methodsInUse: string[];
  filters: Filters;
  onChange: (f: Filters) => void;
  kind: "calgary" | "suppliers";
  shown: number;
  total: number;
}) {
  const [open, setOpen] = useState(false);
  const count = activeCount(filters);
  const type = types.find((t) => t.id === filters.typeId);
  const methods = [...new Set([...BRANDING_METHODS, ...methodsInUse])];
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch });
  const setSpec = (key: string, patch: SpecFilter) => {
    const next = { ...filters.specs[key], ...patch };
    set({ specs: { ...filters.specs, [key]: next } });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className={clsx("h-9 rounded-lg border px-3 text-sm font-medium", count ? "border-ink bg-surface-2" : "border-line")}
        >
          Filters{count ? ` (${count})` : ""} {open ? "▴" : "▾"}
        </button>
        {count > 0 && (
          <>
            <p className="text-sm text-ink-2">
              Showing <span className="font-semibold text-ink">{shown}</span> of {total}
            </p>
            <button type="button" onClick={() => onChange(NO_FILTERS)} className="text-sm text-ink-2 underline hover:text-ink">
              Clear filters
            </button>
          </>
        )}
      </div>

      {open && (
        <div className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs text-muted">
              Type
              <select value={filters.typeId} onChange={(e) => set({ typeId: e.target.value, specs: {} })} className={select}>
                <option value="">All types</option>
                {types.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Season
              <select value={filters.season} onChange={(e) => set({ season: e.target.value })} className={select}>
                <option value="">Any season</option>
                <option value="Summer">Summer</option>
                <option value="Winter">Winter</option>
                <option value="All-season">All-season only</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Branding
              <select value={filters.method} onChange={(e) => set({ method: e.target.value })} className={select}>
                <option value="">Any method</option>
                {methods.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
            {kind === "suppliers" && (
              <label className="flex flex-col gap-1 text-xs text-muted">
                Ordering how many?
                <input
                  inputMode="numeric"
                  defaultValue={filters.qty ?? ""}
                  key={`qty-${filters.qty === null}`}
                  onChange={(e) => set({ qty: toNumber(e.target.value) })}
                  placeholder="e.g. 50"
                  className={number}
                />
              </label>
            )}
            <label className="flex flex-col gap-1 text-xs text-muted">
              {kind === "suppliers" ? "Max price each ($)" : "Max cost each ($)"}
              <input
                inputMode="decimal"
                defaultValue={filters.maxPrice ?? ""}
                key={`price-${filters.maxPrice === null}`}
                onChange={(e) => set({ maxPrice: toNumber(e.target.value) })}
                placeholder="e.g. 20"
                className={number}
              />
            </label>
            {kind === "calgary" && (
              <div className="flex flex-col gap-1.5 pb-1 text-sm">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={filters.inStock} onChange={(e) => set({ inStock: e.target.checked })} className="size-4" /> In stock
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={filters.lowOnly} onChange={(e) => set({ lowOnly: e.target.checked })} className="size-4" /> Running low
                </label>
              </div>
            )}
          </div>
          {kind === "suppliers" && filters.qty !== null && (
            <p className="-mt-2 text-xs text-muted">
              Showing only what can be ordered in {filters.qty.toLocaleString("en-CA")}, with prices at that quantity.
            </p>
          )}

          {type ? (
            <div className="flex flex-col gap-2 border-t border-line pt-3">
              <p className="text-sm font-semibold">{type.name} specs</p>
              <div className="flex flex-wrap items-end gap-3">
                {filterableFields(type).map((field) => (
                  <SpecFilterInput key={`${type.id}-${field.key}`} field={field} value={filters.specs[field.key] ?? {}} onChange={(p) => setSpec(field.key, p)} />
                ))}
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted">Pick a type to filter on its specs, like GSM or waterproof rating.</p>
          )}
        </div>
      )}
    </div>
  );
}

function SpecFilterInput({ field, value, onChange }: { field: SpecField; value: SpecFilter; onChange: (p: SpecFilter) => void }) {
  const label = field.label.replace(/ \(fabric weight\)$/, "");
  if (field.kind === "number") {
    return (
      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1 text-xs text-muted">
          {label}
          {field.unit && field.unit !== label ? ` (${field.unit})` : ""}
        </legend>
        <div className="flex items-center gap-1.5 text-sm text-ink-2">
          <input inputMode="decimal" defaultValue={value.min ?? ""} onChange={(e) => onChange({ min: toNumber(e.target.value) ?? undefined })} placeholder="Min" aria-label={`${label} at least`} className={number} />
          to
          <input inputMode="decimal" defaultValue={value.max ?? ""} onChange={(e) => onChange({ max: toNumber(e.target.value) ?? undefined })} placeholder="Max" aria-label={`${label} at most`} className={number} />
        </div>
      </fieldset>
    );
  }
  if (field.kind === "yesno") {
    return (
      <label className="flex h-9 items-center gap-2 text-sm">
        <input type="checkbox" checked={Boolean(value.yes)} onChange={(e) => onChange({ yes: e.target.checked })} className="size-4" />
        {label}
      </label>
    );
  }
  return (
    <label className="flex flex-col gap-1 text-xs text-muted">
      {label}
      <select value={value.equals ?? ""} onChange={(e) => onChange({ equals: e.target.value || undefined })} className={select}>
        <option value="">Any</option>
        {(field.options ?? []).map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}
