import type { Platform } from "@/config/platforms";

export interface NavItem {
  href: string;
  label: string;
  /** Only shown when a brand in view uses this platform. */
  needs?: Platform;
  adminOnly?: boolean;
  /**
   * The page only covers brands that use `needs`: the brand buttons show just
   * those (locked when there's one), with this label, e.g. "B2B sales pipeline".
   */
  brandScope?: string;
}

export const NAV: NavItem[] = [
  { href: "/", label: "Weekly Review" },
  { href: "/platforms", label: "Platforms" },
  { href: "/content", label: "Content Lab" },
  { href: "/ads", label: "Ads", needs: "meta_ads" },
  { href: "/search", label: "Search & Site" },
  { href: "/pipeline", label: "Sales Pipeline", needs: "lead_rescue", brandScope: "B2B sales pipeline" },
  { href: "/production", label: "Production", needs: "lead_rescue", brandScope: "Print queue" },
  { href: "/inventory", label: "Inventory" },
  { href: "/goals", label: "Goals" },
  { href: "/connections", label: "Connections" },
  { href: "/settings", label: "Settings", adminOnly: true },
];

/** Query params that make up the global controls, kept when moving between pages. */
export const CONTROL_PARAMS = ["brand", "period", "compare", "from", "to"] as const;
