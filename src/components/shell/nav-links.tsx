"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import clsx from "clsx";
import { CONTROL_PARAMS, type NavItem } from "@/components/nav";

/** Sidebar / bottom-bar links that keep the brand, period and comparison. */
export function NavLinks({ items, orientation }: { items: NavItem[]; orientation: "vertical" | "horizontal" }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const keep = new URLSearchParams();
  for (const k of CONTROL_PARAMS) {
    const v = params.get(k);
    if (v) keep.set(k, v);
  }
  const qs = keep.toString();

  return (
    <ul className={clsx(orientation === "vertical" ? "flex flex-col gap-0.5" : "flex gap-1 overflow-x-auto px-4")}>
      {items.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <li key={item.href} className="shrink-0">
            <Link
              href={qs ? `${item.href}?${qs}` : item.href}
              aria-current={active ? "page" : undefined}
              className={clsx(
                "block rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active ? "bg-surface-2 text-ink" : "text-ink-2 hover:bg-surface-2/60 hover:text-ink",
              )}
            >
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
