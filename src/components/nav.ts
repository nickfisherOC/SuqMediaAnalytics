import type { Platform } from "@/config/platforms";

export interface NavItem {
  href: string;
  label: string;
  /** Only shown when a brand in view uses this platform. */
  needs?: Platform;
  adminOnly?: boolean;
}

export const NAV: NavItem[] = [
  { href: "/", label: "Weekly Review" },
  { href: "/platforms", label: "Platforms" },
  { href: "/content", label: "Content Lab" },
  { href: "/search", label: "Search & Site" },
  { href: "/pipeline", label: "Sales Pipeline", needs: "lead_rescue" },
  { href: "/goals", label: "Goals" },
  { href: "/connections", label: "Connections" },
  { href: "/settings", label: "Settings", adminOnly: true },
];

/** Query params that make up the global controls, kept when moving between pages. */
export const CONTROL_PARAMS = ["brand", "period", "compare", "from", "to"] as const;
