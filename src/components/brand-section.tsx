import type { BrandSettings } from "@/config/brands";

/** Wraps a brand's part of a page so its accent colour applies inside it. */
export function BrandSection({
  brand,
  children,
  title,
}: {
  brand: BrandSettings;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="brand-scope flex flex-col gap-6"
      style={{ "--brand-light": brand.accent.light, "--brand-dark": brand.accent.dark } as React.CSSProperties}
      aria-labelledby={`brand-${brand.slug}`}
    >
      <h2 id={`brand-${brand.slug}`} className="flex items-center gap-3 font-display text-3xl font-extrabold tracking-tight">
        <span aria-hidden className="h-7 w-1.5 rounded-full bg-accent" />
        {title ?? brand.name}
      </h2>
      {children}
    </section>
  );
}
