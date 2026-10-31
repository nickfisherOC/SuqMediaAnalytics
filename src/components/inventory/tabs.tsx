"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const TABS = [
  { href: "/inventory", label: "In Calgary" },
  { href: "/inventory/suppliers", label: "Dropship & manufacturers" },
];

/** The two halves of Inventory. */
export function InventoryTabs() {
  const pathname = usePathname();
  const active = pathname.startsWith("/inventory/suppliers") ? TABS[1].href : TABS[0].href;
  return (
    <nav aria-label="Inventory" className="flex w-fit rounded-lg bg-surface-2 p-0.5">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={active === t.href ? "page" : undefined}
          className={clsx("rounded-md px-3 py-1.5 text-sm font-medium", active === t.href ? "bg-page text-ink shadow-sm" : "text-ink-2 hover:text-ink")}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
