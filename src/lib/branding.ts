/**
 * How a product can carry a customer's logo: the methods that work on it,
 * and where the logo can go (and how big). For corporate orders this is
 * often the deciding detail.
 */

export const BRANDING_METHODS = [
  "DTF transfer",
  "Screen print",
  "Embroidery",
  "DTG (direct to garment)",
  "Heat transfer vinyl",
  "Sublimation",
  "Laser engraving",
  "Pad print",
  "UV print",
  "Deboss / emboss",
  "Patch (woven, leather, PVC)",
] as const;

export interface ImprintArea {
  /** e.g. "Left chest" */
  location: string;
  /** e.g. "4 × 4 in", free text so any unit works. */
  maxSize: string;
  /** The method used there, if it's specific to this spot. */
  method: string;
}

export interface Branding {
  methods: string[];
  areas: ImprintArea[];
}

/** Usual logo spots by product type, offered as suggestions. */
const LOCATIONS: Record<string, string[]> = {
  tshirt: ["Full front", "Full back", "Left chest", "Right chest", "Upper back", "Left sleeve", "Right sleeve", "Back of neck"],
  hoodie: ["Full front", "Full back", "Left chest", "Upper back", "Left sleeve", "Right sleeve", "Hood", "Pouch pocket"],
  jacket: ["Left chest", "Right chest", "Full back", "Upper back", "Left sleeve", "Right sleeve"],
  pants: ["Left thigh", "Right thigh", "Back pocket", "Left leg (down the side)"],
  workwear: ["Left chest", "Right chest", "Full back", "Upper back", "Left sleeve"],
  footwear: ["Tongue", "Heel", "Side"],
  hat: ["Front", "Left side", "Right side", "Back", "Under the brim"],
  bag: ["Front pocket", "Main panel", "Strap", "Top flap"],
  drinkware: ["One side", "Both sides", "Wrap-around", "Lid", "Bottom"],
  pen: ["Barrel", "Clip", "Cap"],
  gift: ["Lid", "Front", "Box"],
};
const GENERAL = ["Front", "Back", "Side", "Top"];

export function locationSuggestions(typeSlug: string | null | undefined): string[] {
  return (typeSlug && LOCATIONS[typeSlug]) || GENERAL;
}

/** Branding from a details form: "branding_method" checkboxes and "imprint_*" rows (rows without a location are dropped). */
export function parseBranding(formData: FormData): Branding {
  const methods = [...new Set(formData.getAll("branding_method").map((m) => String(m).trim()).filter(Boolean))].slice(0, 20).map((m) => m.slice(0, 60));
  const locations = formData.getAll("imprint_location");
  const sizes = formData.getAll("imprint_size");
  const areaMethods = formData.getAll("imprint_method");
  const areas = locations
    .map((l, i) => ({
      location: String(l).trim().slice(0, 60),
      maxSize: String(sizes[i] ?? "").trim().slice(0, 60),
      method: String(areaMethods[i] ?? "").trim().slice(0, 60),
    }))
    .filter((a) => a.location)
    .slice(0, 20);
  return { methods, areas };
}

/** Database shape → app shape (tolerates missing or odd rows). */
export function readAreas(raw: unknown): ImprintArea[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((a) =>
    a && typeof a === "object" && typeof (a as { location?: unknown }).location === "string"
      ? [{ location: String((a as ImprintArea).location), maxSize: String((a as ImprintArea).maxSize ?? ""), method: String((a as ImprintArea).method ?? "") }]
      : [],
  );
}

/** "Embroidery, Laser engraving" → short card text: the first two, then "+N more". */
export function methodsLabel(methods: string[]): string | null {
  if (!methods.length) return null;
  const short = methods.map((m) => m.replace(/ \(.*\)$/, ""));
  return short.length > 2 ? `${short.slice(0, 2).join(", ")} +${short.length - 2} more` : short.join(", ");
}
