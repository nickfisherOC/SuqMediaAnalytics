"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const TABS = [
  { href: "/inventory", label: "In Calgary" },
  { href: "/inventory/suppliers", label: "Dropship & manufacturers" },
  { href: "/inventory/types", label: "Product types" },
];

/** The parts of Inventory. */
export function InventoryTabs() {
  const pathname = usePathname();
  const active = TABS.slice(1).find((t) => pathname.startsWith(t.href))?.href ?? TABS[0].href;
  return (
    <nav aria-label="Inventory" className="flex w-fit max-w-full overflow-x-auto rounded-lg bg-surface-2 p-0.5">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={active === t.href ? "page" : undefined}
          className={clsx("shrink-0 rounded-md px-3 py-1.5 text-sm font-medium", active === t.href ? "bg-page text-ink shadow-sm" : "text-ink-2 hover:text-ink")}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
