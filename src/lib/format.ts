import type { Unit } from "@/config/metrics";

const compact = new Intl.NumberFormat("en-CA", { notation: "compact", maximumFractionDigits: 1 });
const whole = new Intl.NumberFormat("en-CA", { maximumFractionDigits: 0 });
const cad = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", currencyDisplay: "narrowSymbol" });
const cadWhole = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  currencyDisplay: "narrowSymbol",
  maximumFractionDigits: 0,
});

/** Display value for a metric: 1,284 · 12.9K · $24.30 · 3.2% · 2h 30m · #14.2 */
export function formatValue(value: number | null, unit: Unit): string {
  if (value === null) return "—";
  switch (unit) {
    case "count":
      return Math.abs(value) >= 10_000 ? compact.format(value) : whole.format(value);
    case "currency":
      return Math.abs(value) >= 1_000 ? cadWhole.format(value) : cad.format(value);
    case "percent":
      return `${value.toFixed(value >= 10 ? 0 : 1)}%`;
    case "minutes":
      return formatMinutes(value);
    case "position":
      return value.toFixed(1);
  }
}

export function formatMinutes(mins: number): string {
  if (mins < 60) return `${Math.round(mins)} min`;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins - h * 60);
  if (h >= 48) return `${Math.round(h / 24)} days`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** Like formatValue but never abbreviated (12,535 rather than 12.5K), for sentences. */
export function formatExact(value: number | null, unit: Unit): string {
  if (value !== null && unit === "count") return whole.format(value);
  return formatValue(value, unit);
}

/** Signed change in the metric's own unit: "+15", "−$3.20", "+1.2 pts" */
export function formatDelta(delta: number, unit: Unit): string {
  const sign = delta > 0 ? "+" : delta < 0 ? "−" : "";
  const abs = Math.abs(delta);
  if (unit === "percent") return `${sign}${abs.toFixed(1)} pts`;
  return `${sign}${formatValue(abs, unit)}`;
}

/** "+107%" or "−42%". */
export function formatPct(pct: number): string {
  const sign = pct > 0 ? "+" : pct < 0 ? "−" : "";
  const v = Math.abs(pct * 100);
  return `${sign}${v >= 10 ? Math.round(v) : v.toFixed(1)}%`;
}
