"use client";

import { useState } from "react";
import type { Unit } from "@/config/metrics";
import { formatRange } from "@/lib/dates";
import { formatValue } from "@/lib/format";

interface Point {
  from: string;
  to: string;
  value: number | null;
}

const W = 160;
const H = 40;
const PAD = 4;

/**
 * The metric over the trailing periods. De-emphasised line, the current
 * period marked in the brand accent, a tooltip per point on hover or focus.
 */
export function Sparkline({ points: all, unit, label }: { points: Point[]; unit: Unit; label: string }) {
  const [active, setActive] = useState<number | null>(null);
  // Start at the first period with data, so a new account's line uses the full width.
  const firstWithData = all.findIndex((p) => p.value !== null);
  const points = firstWithData > 0 ? all.slice(firstWithData) : all;
  const values = points.map((p) => p.value).filter((v): v is number => v !== null);
  if (values.length < 2) return <div className="h-10" aria-hidden />;

  const min = Math.min(...values, 0);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = (W - PAD * 2) / (points.length - 1);
  const x = (i: number) => PAD + i * step;
  const y = (v: number) => H - PAD - ((v - min) / span) * (H - PAD * 2);

  // Break the line at gaps rather than drawing through missing periods.
  const segments: string[] = [];
  let current = "";
  points.forEach((p, i) => {
    if (p.value === null) {
      if (current) segments.push(current);
      current = "";
    } else {
      current += `${current ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`;
    }
  });
  if (current) segments.push(current);

  const last = points.length - 1;
  const shown = active ?? null;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-10 w-full overflow-visible"
        preserveAspectRatio="none"
        role="img"
        aria-label={`${label}, last ${points.length} periods`}
        onMouseLeave={() => setActive(null)}
      >
        {segments.map((d, i) => (
          <path
            key={i}
            d={d}
            fill="none"
            stroke="var(--series-muted)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {points[last].value !== null && (
          <circle cx={x(last)} cy={y(points[last].value!)} r={3.5} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} />
        )}
        {shown !== null && points[shown].value !== null && shown !== last && (
          <circle cx={x(shown)} cy={y(points[shown].value!)} r={3} fill="var(--ink-2)" stroke="var(--surface)" strokeWidth={2} />
        )}
        {/* Hit targets wider than the marks. */}
        {points.map((p, i) => (
          <rect
            key={i}
            x={x(i) - step / 2}
            y={0}
            width={step}
            height={H}
            fill="transparent"
            onMouseEnter={() => setActive(i)}
          />
        ))}
      </svg>
      {shown !== null && (
        <div className="pointer-events-none absolute -top-9 left-1/2 z-10 -translate-x-1/2 rounded-md border border-line bg-surface px-2 py-1 text-xs whitespace-nowrap text-ink shadow">
          <span className="text-muted">{formatRange(points[shown].from, points[shown].to)}: </span>
          <span className="font-semibold">{formatValue(points[shown].value, unit)}</span>
        </div>
      )}
    </div>
  );
}
