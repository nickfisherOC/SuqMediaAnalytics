import type { IconKey } from "@/lib/product-types";

/** Simple line drawings per product type, shown until a real photo is added. 64 × 64 units. */
const PATHS: Record<IconKey, React.ReactNode> = {
  tshirt: <path d="M22 10 12 15 6 26l8 4 4-6v30h28V24l4 6 8-4-6-11-10-5c-1 4-5 7-10 7s-9-3-10-7Z" />,
  hoodie: (
    <>
      <path d="M24 8c-5 2-8 6-8 11v1l-6 5-4 23 7 2 3-14v20h32V36l3 14 7-2-4-23-6-5v-1c0-5-3-9-8-11" />
      <path d="M24 8c2 7 14 7 16 0M24 8c-2 6 0 12 8 14 8-2 10-8 8-14" />
      <path d="M24 44h16l-2 8H26z" />
      <path d="M29 22v8M35 22v8" />
    </>
  ),
  jacket: (
    <>
      <path d="M24 8 12 13 7 24l-1 30h8l1-24v26h34V30l1 24h8l-1-30-5-11-12-5" />
      <path d="M24 8l8 8 8-8M32 16v40" />
      <path d="M20 38h7M37 38h7" />
    </>
  ),
  pants: (
    <>
      <path d="M18 8h28l4 48h-12l-6-32-6 32H14z" />
      <path d="M18 14h28M24 14l-2 8M40 14l2 8" />
    </>
  ),
  vest: (
    <>
      <path d="M22 8 14 14v42h36V14l-8-6-4 10-6 6-6-6z" />
      <path d="M14 34h36M14 42h36M32 24v32" />
    </>
  ),
  boot: (
    <>
      <path d="M18 8h18v24l14 6c4 2 6 5 6 9v5H8V40c0-6 4-10 10-12z" />
      <path d="M8 52v4h48v-4M18 16h18M18 22h18M36 32l-4 6" />
    </>
  ),
  cap: (
    <>
      <path d="M10 38c0-14 10-24 22-24s22 10 22 24z" />
      <path d="M32 14v24M10 38c-4 0-6 2-6 4s4 4 10 4h22c-2-4-8-8-26-8z" />
      <circle cx="32" cy="13" r="2" />
    </>
  ),
  backpack: (
    <>
      <path d="M24 12v-2c0-3 3-5 8-5s8 2 8 5v2" />
      <path d="M14 22c0-6 5-10 11-10h14c6 0 11 4 11 10v32c0 2-2 4-4 4H18c-2 0-4-2-4-4z" />
      <path d="M20 36h24v16H20zM20 42h24M30 28h4" />
    </>
  ),
  mug: (
    <>
      <path d="M18 10h28l-3 46H21z" />
      <path d="M16 10h32M19 22h26" />
    </>
  ),
  pen: (
    <>
      <path d="M44 6l14 14-30 30-14-14z" />
      <path d="M14 36l-6 20 20-6M40 10l14 14M10 52l4 2" />
    </>
  ),
  gift: (
    <>
      <path d="M10 24h44v10H10zM14 34h36v22H14zM32 24v32" />
      <path d="M32 24c-4-8-14-12-14-4 0 4 6 4 14 4zM32 24c4-8 14-12 14-4 0 4-6 4-14 4z" />
    </>
  ),
  box: (
    <>
      <path d="M8 20 32 8l24 12v26L32 58 8 46z" />
      <path d="M8 20l24 12 24-12M32 32v26" />
    </>
  ),
};

export function ProductDrawing({ icon, className }: { icon: IconKey | null | undefined; className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      {PATHS[icon ?? "box"] ?? PATHS.box}
    </svg>
  );
}

/** The grey "no photo yet" tile: the type's drawing with a small note. */
export function NoPhoto({ icon }: { icon: IconKey | null | undefined }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-muted">
      <ProductDrawing icon={icon} className="h-1/2 max-h-28 w-1/2 max-w-28 opacity-70" />
      <span className="text-xs">No photo yet</span>
    </div>
  );
}
