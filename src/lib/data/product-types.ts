import "server-only";
import { ICONS, fieldsFor, parseCustomFields, parseSpecs, type CustomField, type IconKey, type ProductType, type SpecField, type Specs } from "@/lib/product-types";
import { createUserClient } from "@/lib/supabase/server";
import { getViewer } from "./source";

type Db = Awaited<ReturnType<typeof createUserClient>>;

const PILLING = ["5 – No pilling", "4 – Slight pilling", "3 – Some pilling", "2 – Noticeable pilling", "1 – Heavy pilling"];
const FITS = ["Classic", "Relaxed", "Slim", "Women's", "Youth", "Unisex"];

/** A few types for local preview (the live list is in the database). */
const PREVIEW_TYPES: ProductType[] = [
  {
    id: "type-tshirt",
    slug: "tshirt",
    name: "T-shirts",
    icon: "tshirt",
    fields: [
      { key: "fabric", label: "Fabric blend", kind: "text" },
      { key: "gsm", label: "GSM (fabric weight)", kind: "number", unit: "GSM", help: "Grams per square metre. Light tee ~150, heavy tee ~220+" },
      { key: "knit", label: "Knit", kind: "choice", options: ["Jersey", "Pique", "Rib", "Other"] },
      { key: "pilling", label: "Pilling", kind: "choice", options: PILLING, help: "How well it resists little fuzz balls (5 is best)" },
      { key: "fit", label: "Fit", kind: "choice", options: FITS },
      { key: "stretch", label: "Stretch", kind: "yesno" },
    ],
  },
  {
    id: "type-hoodie",
    slug: "hoodie",
    name: "Hoodies & sweaters",
    icon: "hoodie",
    fields: [
      { key: "style", label: "Style", kind: "choice", options: ["Pullover hoodie", "Full-zip hoodie", "Quarter-zip", "Crewneck"] },
      { key: "fabric", label: "Fabric blend", kind: "text" },
      { key: "gsm", label: "GSM (fabric weight)", kind: "number", unit: "GSM", help: "Grams per square metre. Mid hoodie ~270, heavy ~350+" },
      { key: "knit", label: "Inside", kind: "choice", options: ["Brushed fleece", "French terry", "Sherpa lined"] },
      { key: "pilling", label: "Pilling", kind: "choice", options: PILLING, help: "How well it resists little fuzz balls (5 is best)" },
      { key: "fit", label: "Fit", kind: "choice", options: FITS },
    ],
  },
  {
    id: "type-hat",
    slug: "hat",
    name: "Hats & beanies",
    icon: "cap",
    fields: [
      { key: "style", label: "Style", kind: "choice", options: ["Snapback", "Fitted", "Trucker", "Beanie"] },
      { key: "fabric", label: "Fabric", kind: "text" },
      { key: "panels", label: "Panels", kind: "number" },
    ],
  },
  {
    id: "type-bag",
    slug: "bag",
    name: "Backpacks & bags",
    icon: "backpack",
    fields: [
      { key: "capacity_l", label: "Capacity", kind: "number", unit: "L" },
      { key: "fabric", label: "Fabric", kind: "text", help: "The D number (denier) is thread thickness" },
      { key: "water_resistance", label: "Water resistance", kind: "choice", options: ["None", "Water-resistant", "Waterproof"] },
    ],
  },
  { id: "type-gift", slug: "gift", name: "Gifts & other", icon: "gift", fields: [{ key: "material", label: "Material", kind: "text" }, { key: "gift_box", label: "Comes in a gift box", kind: "yesno" }] },
];

/* eslint-disable-next-line @typescript-eslint/no-explicit-any -- a row straight from PostgREST */
const toType = (r: any): ProductType => ({
  id: r.id,
  slug: r.slug,
  name: r.name,
  icon: (ICONS as readonly string[]).includes(r.icon) ? (r.icon as IconKey) : "box",
  fields: Array.isArray(r.fields) ? (r.fields as SpecField[]) : [],
});

/** Every product type, in their set order. */
export async function listProductTypes(): Promise<ProductType[]> {
  const { mode } = await getViewer();
  if (mode === "preview") return PREVIEW_TYPES;
  const db = await createUserClient();
  const { data, error } = await db.from("product_types").select("id, slug, name, icon, fields").is("archived_at", null).order("position").order("name");
  if (error) throw error;
  return data.map(toType);
}

/**
 * The type, specs and custom fields from a product's details form, checked
 * against the chosen type's fields.
 */
export async function readSpecsForm(db: Db, formData: FormData, previous: Specs): Promise<{ type_id: string | null; specs: Specs; custom_fields: CustomField[] }> {
  const typeId = String(formData.get("type_id") ?? "") || null;
  let type: ProductType | null = null;
  if (typeId) {
    const { data } = await db.from("product_types").select("id, slug, name, icon, fields").eq("id", typeId).maybeSingle();
    type = data ? toType(data) : null;
  }
  return {
    type_id: type?.id ?? null,
    specs: parseSpecs(formData.entries(), fieldsFor(type), previous),
    custom_fields: parseCustomFields(formData.getAll("custom_label"), formData.getAll("custom_value")),
  };
}

export { toType };
