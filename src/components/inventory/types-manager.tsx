"use client";

import { useState, useTransition } from "react";
import clsx from "clsx";
import { addField, archiveType, createType, moveField, removeField, updateType, type ActionResult } from "@/app/inventory/types/actions";
import { COMMON_FIELDS, ICONS, type IconKey, type ProductType, type SpecField, type SpecKind } from "@/lib/product-types";
import { ProductDrawing } from "./drawings";

const card = "rounded-2xl border border-line bg-surface p-5";
const field = "h-9 rounded-lg border border-line bg-page px-3 text-sm text-ink";
const button = "h-9 rounded-lg bg-ink px-4 text-sm font-semibold text-page disabled:opacity-60";

const KIND_LABEL: Record<SpecKind, string> = { text: "Text", number: "Number", choice: "Pick from a list", yesno: "Yes / No" };
const ICON_LABEL: Record<IconKey, string> = {
  tshirt: "T-shirt",
  hoodie: "Hoodie",
  jacket: "Jacket",
  pants: "Pants",
  vest: "Vest",
  boot: "Boot",
  cap: "Cap",
  backpack: "Backpack",
  mug: "Mug",
  pen: "Pen",
  gift: "Gift",
  box: "Box",
};

function useAction() {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const run = (fn: () => Promise<ActionResult>, okText?: string) =>
    start(async () => {
      const r = await fn();
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

function IconSelect({ value }: { value?: IconKey }) {
  return (
    <select name="icon" defaultValue={value ?? "box"} aria-label="Drawing" className={field}>
      {ICONS.map((i) => (
        <option key={i} value={i}>
          {ICON_LABEL[i]}
        </option>
      ))}
    </select>
  );
}

const describe = (f: SpecField) =>
  f.kind === "choice" ? `Pick from: ${(f.options ?? []).join(", ")}` : f.kind === "number" && f.unit ? `Number (${f.unit})` : KIND_LABEL[f.kind];

/** Every product type with its spec fields, and forms to add or change them. */
export function TypesManager({ types, canEdit }: { types: ProductType[]; canEdit: boolean }) {
  const add = useAction();
  return (
    <div className="flex flex-col gap-6">
      <p className="max-w-2xl text-ink-2">
        Each type decides which spec fields its products show. Every type also gets{" "}
        {COMMON_FIELDS.map((f) => f.label.toLowerCase()).join(", ")}. Changes here apply to every product of that type, on both tabs.
      </p>

      {canEdit && (
        <form
          action={(fd) => add.run(() => createType(fd), "Type added. Add its fields below.")}
          className="flex flex-wrap items-end gap-2"
        >
          <label className="flex flex-col gap-1 text-xs text-muted">
            Add a type
            <input name="name" required maxLength={60} placeholder="e.g. Blankets" className={clsx(field, "w-56")} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Drawing
            <IconSelect />
          </label>
          <button type="submit" disabled={add.pending} className={button}>
            {add.pending ? "Adding…" : "Add"}
          </button>
          <div className="w-full">
            <Message m={add.message} />
          </div>
        </form>
      )}

      <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {types.map((t) => (
          <li key={t.id}>
            <TypeCard type={t} canEdit={canEdit} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function TypeCard({ type, canEdit }: { type: ProductType; canEdit: boolean }) {
  const details = useAction();
  const fields = useAction();
  const [kind, setKind] = useState<SpecKind>("text");

  return (
    <section className={clsx(card, "flex flex-col gap-4")}>
      <div className="flex items-start gap-4">
        <ProductDrawing icon={type.icon} className="size-14 shrink-0 text-ink-2" />
        {canEdit ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              details.run(() => updateType(type.id, fd), "Saved.");
            }}
            className="flex flex-1 flex-wrap items-end gap-2"
          >
            <label className="flex flex-1 flex-col gap-1 text-xs text-muted">
              Name
              <input name="name" defaultValue={type.name} required maxLength={60} className={clsx(field, "w-full min-w-40")} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Drawing
              <IconSelect value={type.icon} />
            </label>
            <button type="submit" disabled={details.pending} className="h-9 rounded-lg border border-line px-3 text-sm font-medium">
              Save
            </button>
          </form>
        ) : (
          <h2 className="text-xl font-bold">{type.name}</h2>
        )}
      </div>
      <Message m={details.message} />

      <ol className="flex flex-col divide-y divide-line border-y border-line">
        {type.fields.length === 0 && <li className="py-2 text-sm text-ink-2">No fields yet.</li>}
        {type.fields.map((f, i) => (
          <li key={f.key} className="flex items-center justify-between gap-2 py-2">
            <div className="min-w-0">
              <p className="text-sm font-medium">{f.label}</p>
              <p className="truncate text-xs text-muted">{describe(f)}</p>
            </div>
            {canEdit && (
              <div className="flex shrink-0 items-center gap-1 text-xs">
                <button type="button" disabled={fields.pending || i === 0} onClick={() => fields.run(() => moveField(type.id, f.key, -1))} aria-label={`Move ${f.label} up`} className="grid size-7 place-items-center rounded-md bg-surface-2 text-ink-2 disabled:opacity-30">
                  ▲
                </button>
                <button
                  type="button"
                  disabled={fields.pending || i === type.fields.length - 1}
                  onClick={() => fields.run(() => moveField(type.id, f.key, 1))}
                  aria-label={`Move ${f.label} down`}
                  className="grid size-7 place-items-center rounded-md bg-surface-2 text-ink-2 disabled:opacity-30"
                >
                  ▼
                </button>
                <button
                  type="button"
                  disabled={fields.pending}
                  onClick={() => confirm(`Remove "${f.label}" from ${type.name}? Values already filled in are kept but hidden.`) && fields.run(() => removeField(type.id, f.key))}
                  className="ml-1 text-muted hover:text-bad"
                >
                  Remove
                </button>
              </div>
            )}
          </li>
        ))}
      </ol>

      {canEdit && (
        <form
          action={(fd) => fields.run(() => addField(type.id, fd), "Field added.")}
          className="flex flex-wrap items-end gap-2"
        >
          <label className="flex flex-col gap-1 text-xs text-muted">
            Add a field
            <input name="label" required maxLength={60} placeholder="e.g. Zipper brand" className={clsx(field, "w-44")} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Kind
            <select name="kind" value={kind} onChange={(e) => setKind(e.target.value as SpecKind)} className={field}>
              {(Object.keys(KIND_LABEL) as SpecKind[]).map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </label>
          {kind === "choice" && (
            <label className="flex flex-col gap-1 text-xs text-muted">
              Choices, separated by commas
              <input name="options" required placeholder="e.g. Light, Medium, Heavy" className={clsx(field, "w-56")} />
            </label>
          )}
          {kind === "number" && (
            <label className="flex flex-col gap-1 text-xs text-muted">
              Unit (optional)
              <input name="unit" maxLength={20} placeholder="e.g. cm, L, oz" className={clsx(field, "w-24")} />
            </label>
          )}
          <button type="submit" disabled={fields.pending} className={button}>
            Add
          </button>
        </form>
      )}
      <Message m={fields.message} />

      {canEdit && (
        <button
          type="button"
          disabled={details.pending}
          onClick={() => confirm(`Remove the ${type.name} type? Its products keep their details but show as "No type".`) && details.run(() => archiveType(type.id))}
          className="self-start text-xs text-muted hover:text-bad"
        >
          Remove this type
        </button>
      )}
    </section>
  );
}
