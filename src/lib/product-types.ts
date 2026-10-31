/**
 * Product types decide which spec fields a product shows: a hoodie has GSM
 * and pilling, a backpack has capacity, a pen has ink. Types and their fields
 * live in the database (product_types) so they can be changed in Pulse;
 * anything else goes in a product's own custom fields.
 */

export type SpecKind = "text" | "number" | "choice" | "yesno";

export interface SpecField {
  /** Key in a product's specs, e.g. "gsm". */
  key: string;
  label: string;
  kind: SpecKind;
  /** Shown after numbers, e.g. "mm", "L". */
  unit?: string;
  options?: string[];
  placeholder?: string;
  help?: string;
}

/** The drawings available for products without a photo. */
export const ICONS = ["tshirt", "hoodie", "jacket", "pants", "vest", "boot", "cap", "backpack", "mug", "pen", "gift", "box"] as const;
export type IconKey = (typeof ICONS)[number];

export interface ProductType {
  id: string;
  slug: string;
  name: string;
  icon: IconKey;
  fields: SpecField[];
}

export type SpecValue = string | number;
export type Specs = Record<string, SpecValue>;

export interface CustomField {
  label: string;
  value: string;
}

/** Fields every type has, after its own. */
export const COMMON_FIELDS: SpecField[] = [
  { key: "season", label: "Season", kind: "choice", options: ["Summer", "All-season", "Winter"], help: "When it's best worn or used" },
];

export function fieldsFor(type: ProductType | null | undefined): SpecField[] {
  const own = type?.fields ?? [];
  return [...own, ...COMMON_FIELDS.filter((c) => !own.some((f) => f.key === c.key))];
}

/** GSM to ounces per square yard (1 oz/yd² ≈ 33.906 g/m²), to one decimal. */
export function gsmToOz(gsm: number): number {
  return Math.round((gsm / 33.906) * 10) / 10;
}

/** A label turned into a spec key: "Zipper brand" → "zipper_brand". */
export function keyFor(label: string): string {
  return (
    label
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "field"
  );
}

/**
 * Specs from a submitted form: inputs named "spec:<key>". Numbers are parsed,
 * yes/no kept as "Yes"/"No", choices only from their options (or the value
 * already saved), and empty values dropped.
 */
export function parseSpecs(entries: Iterable<[string, FormDataEntryValue]>, fields: SpecField[], previous: Specs = {}): Specs {
  const byKey = new Map(fields.map((f) => [f.key, f]));
  const out: Specs = {};
  for (const [name, raw] of entries) {
    if (!name.startsWith("spec:")) continue;
    const field = byKey.get(name.slice(5));
    const value = String(raw).trim().slice(0, 300);
    if (!field || !value) continue;
    if (field.kind === "number") {
      const n = Number(value.replace(/[,\s]/g, ""));
      if (Number.isFinite(n)) out[field.key] = n;
    } else if (field.kind === "yesno") {
      if (value === "Yes" || value === "No") out[field.key] = value;
    } else if (field.kind === "choice") {
      if (field.options?.includes(value) || previous[field.key] === value) out[field.key] = value;
    } else {
      out[field.key] = value;
    }
  }
  return out;
}

/** Custom fields from "custom_label"/"custom_value" pairs; rows without a label are dropped. */
export function parseCustomFields(labels: FormDataEntryValue[], values: FormDataEntryValue[]): CustomField[] {
  return labels
    .map((l, i) => ({ label: String(l).trim().slice(0, 60), value: String(values[i] ?? "").trim().slice(0, 300) }))
    .filter((c) => c.label)
    .slice(0, 40);
}

/** "320 GSM (9.4 oz)", "Yes", "25 L". */
export function formatSpec(field: SpecField, value: SpecValue | undefined): string | null {
  if (value === undefined || value === "") return null;
  if (field.kind === "number" && typeof value === "number") {
    if (field.key === "gsm") return `${value} GSM (${gsmToOz(value)} oz)`;
    return `${value.toLocaleString("en-CA")}${field.unit ? ` ${field.unit}` : ""}`;
  }
  return String(value);
}

/** The first few filled-in specs, short, for product cards: "320 GSM · Winter". */
export function specHighlights(type: ProductType | null | undefined, specs: Specs, max = 3): string[] {
  const out: string[] = [];
  for (const f of fieldsFor(type)) {
    const v = specs[f.key];
    if (v === undefined || v === "") continue;
    if (f.kind === "yesno") {
      if (v === "Yes") out.push(f.label);
    } else if (f.kind === "number") {
      out.push(f.key === "gsm" ? `${v} GSM` : `${f.label} ${v}${f.unit ? ` ${f.unit}` : ""}`);
    } else if (f.kind === "choice") {
      out.push(String(v));
    }
    if (out.length >= max) break;
  }
  return out;
}

/** "Small, Medium , ,Large" → ["Small", "Medium", "Large"] for pick-list choices. */
export function splitOptions(text: string): string[] {
  return [...new Set(text.split(",").map((s) => s.trim().slice(0, 60)).filter(Boolean))].slice(0, 30);
}
