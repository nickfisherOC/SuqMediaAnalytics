"use client";

import { useRef, useState, useTransition } from "react";
import { makeFieldStandard } from "@/app/inventory/types/actions";
import { fieldsFor, formatSpec, gsmToOz, specHighlights, type CustomField, type ProductType, type SpecField, type Specs } from "@/lib/product-types";

const field = "h-9 w-full rounded-lg border border-line bg-page px-3 text-sm text-ink";

/** Pick a type (it decides the spec fields), fill in its specs, and add custom fields. Lives inside a details form. */
export function SpecsEditor({
  types,
  typeId: savedTypeId,
  specs,
  customFields,
  table,
  productId,
}: {
  types: ProductType[];
  typeId: string | null;
  specs: Specs;
  customFields: CustomField[];
  table: "inventory" | "supplier";
  productId: string;
}) {
  const [typeId, setTypeId] = useState(savedTypeId ?? "");
  const type = types.find((t) => t.id === typeId) ?? null;
  const savedType = types.find((t) => t.id === savedTypeId) ?? null;

  return (
    <>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Type
        <select name="type_id" value={typeId} onChange={(e) => setTypeId(e.target.value)} className="h-9 rounded-lg border border-line bg-page px-2 text-sm text-ink">
          <option value="">No type yet</option>
          {types.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        {typeId !== (savedTypeId ?? "") && <span className="text-ink-2">Specs change to suit the new type when you save. Fields both types share are kept.</span>}
      </label>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-sm font-semibold">{type ? `${type.name} specs` : "Specs"}</legend>
        {fieldsFor(type).map((f) => (
          <SpecInput key={`${typeId}-${f.key}`} field={f} value={specs[f.key]} />
        ))}
      </fieldset>

      {/* Remounts when the saved list changes (e.g. a field became standard), so it shows what's saved. */}
      <CustomFields key={JSON.stringify(customFields)} initial={customFields} table={table} productId={productId} typeName={typeId === (savedTypeId ?? "") ? savedType?.name : undefined} />
    </>
  );
}

function SpecInput({ field: f, value }: { field: SpecField; value: string | number | undefined }) {
  const [gsm, setGsm] = useState(f.key === "gsm" && typeof value === "number" ? value : null);
  const name = `spec:${f.key}`;
  const current = value === undefined ? "" : String(value);
  let input: React.ReactNode;
  if (f.kind === "choice" || f.kind === "yesno") {
    const options = f.kind === "yesno" ? ["Yes", "No"] : (f.options ?? []);
    input = (
      <select name={name} defaultValue={current} className="h-9 rounded-lg border border-line bg-page px-2 text-sm text-ink">
        <option value="">—</option>
        {current && !options.includes(current) && <option value={current}>{current}</option>}
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  } else {
    input = (
      <div className="flex items-center gap-2">
        <input
          name={name}
          defaultValue={current}
          inputMode={f.kind === "number" ? "decimal" : undefined}
          placeholder={f.placeholder}
          onChange={f.key === "gsm" ? (e) => setGsm(Number(e.target.value) || null) : undefined}
          className={field}
        />
        {f.unit && <span className="shrink-0 text-sm text-ink-2">{f.unit}</span>}
      </div>
    );
  }
  return (
    <label className="flex flex-col gap-1 text-xs text-muted">
      {f.label}
      {input}
      {f.key === "gsm" && gsm ? <span className="text-ink-2">≈ {gsmToOz(gsm)} oz per square yard</span> : null}
      {f.help && <span>{f.help}</span>}
    </label>
  );
}

function CustomFields({ initial, table, productId, typeName }: { initial: CustomField[]; table: "inventory" | "supplier"; productId: string; typeName?: string }) {
  const nextKey = useRef(initial.length);
  const [rows, setRows] = useState(() => initial.map((c, i) => ({ ...c, key: i })));
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const saved = new Map(initial.map((c) => [c.label, c.value]));

  const standardize = (label: string) =>
    start(async () => {
      const r = await makeFieldStandard(table, productId, label);
      setMessage(r.ok ? { ok: true, text: `"${label}" now shows on every product of this type.` } : { ok: false, text: r.message ?? "That didn't work." });
    });

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-semibold">Custom fields</legend>
      <p className="text-xs text-muted">Anything the type doesn&apos;t cover, e.g. &ldquo;Zipper brand: YKK&rdquo;.</p>
      {rows.map((r, i) => {
        const isSaved = saved.get(r.label) === r.value && r.label !== "";
        return (
          <div key={r.key} className="flex flex-wrap items-center gap-2">
            <input
              name="custom_label"
              value={r.label}
              onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
              placeholder="Field name"
              aria-label="Custom field name"
              maxLength={60}
              className="h-9 w-36 rounded-lg border border-line bg-page px-3 text-sm"
            />
            <input
              name="custom_value"
              value={r.value}
              onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
              placeholder="Value"
              aria-label={`Value for ${r.label || "custom field"}`}
              maxLength={300}
              className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-page px-3 text-sm"
            />
            <button type="button" onClick={() => setRows(rows.filter((_, j) => j !== i))} className="text-xs text-muted hover:text-bad">
              Remove
            </button>
            {isSaved && typeName && (
              <button
                type="button"
                disabled={pending}
                onClick={() => confirm(`Add "${r.label}" as a field on every product in ${typeName}?`) && standardize(r.label)}
                className="w-full text-left text-xs font-medium text-ink-2 hover:text-ink sm:w-auto"
              >
                Use for all {typeName}
              </button>
            )}
          </div>
        );
      })}
      <button type="button" onClick={() => setRows([...rows, { key: nextKey.current++, label: "", value: "" }])} className="w-fit text-sm font-medium text-ink-2 hover:text-ink">
        + Add a field
      </button>
      {message && (
        <p className={`text-sm ${message.ok ? "text-good" : "text-bad"}`} role={message.ok ? "status" : "alert"}>
          {message.text}
        </p>
      )}
    </fieldset>
  );
}

/** The filled-in specs and custom fields, for reading. */
export function SpecsSummary({ type, specs, customFields }: { type: ProductType | null; specs: Specs; customFields: CustomField[] }) {
  const rows = [
    ...fieldsFor(type).flatMap((f) => {
      const v = formatSpec(f, specs[f.key]);
      return v ? [{ label: f.label.replace(/ \(fabric weight\)$/, ""), value: v }] : [];
    }),
    ...customFields.filter((c) => c.value),
  ];
  return (
    <section className="rounded-2xl border border-line bg-surface p-5">
      <h2 className="mb-3 text-sm font-semibold tracking-wide text-muted uppercase">{type ? `${type.name} specs` : "Specs"}</h2>
      {rows.length ? (
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          {rows.map((r) => (
            <div key={r.label} className="flex flex-col gap-0.5">
              <dt className="text-xs font-medium text-muted">{r.label}</dt>
              <dd className="text-sm">{r.value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-sm text-ink-2">{type ? "No specs filled in yet. Add them under Details and specs." : "Pick a type under Details and specs to see the right fields."}</p>
      )}
    </section>
  );
}

/** The type picker on "Add a product" forms. */
export function TypeSelect({ types }: { types: ProductType[] }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted">
      Type
      <select name="type_id" defaultValue="" className="h-9 rounded-lg border border-line bg-page px-2 text-sm text-ink">
        <option value="">Choose later</option>
        {types.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
    </label>
  );
}

/** What a product card shows under its name: type, then a few key specs. */
export function cardSpecs(type: ProductType | null, specs: Specs): string {
  return [type?.name, ...specHighlights(type, specs, 2)].filter(Boolean).join(" · ");
}
