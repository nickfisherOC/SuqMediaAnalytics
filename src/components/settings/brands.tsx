"use client";

import { useState, useTransition } from "react";
import { addBrand, saveBrand, setBrandActive } from "@/app/(app)/settings/actions";
import type { BrandSettings, TileSpec } from "@/config/brands";
import { METRICS } from "@/config/metrics";
import { PLATFORM_INFO, PLATFORMS, type Platform } from "@/config/platforms";

type Brand = BrandSettings & { active: boolean };
const card = "rounded-2xl border border-line bg-surface p-5";
const input = "h-9 rounded-lg border border-line bg-page px-3 text-sm text-ink";

function useAction() {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; message?: string }>) =>
    start(async () => {
      const r = await fn();
      setMessage(r.message ? { ok: r.ok, text: r.message } : r.ok ? null : { ok: false, text: "Something went wrong." });
    });
  return { pending, message, run };
}

/** A filled button in each colour on a light and a dark page, as the brand picker shows it. */
function ColourPreview({ light, dark, name }: { light: string; dark: string; name: string }) {
  return (
    <div className="flex flex-wrap gap-2 text-sm">
      <span className="rounded-lg bg-[#f6f5f2] p-2">
        <span className="rounded-md px-3 py-1.5 font-semibold text-white" style={{ background: light }}>
          ✓ {name || "Brand"}
        </span>
      </span>
      <span className="rounded-lg bg-[#0a0a0f] p-2">
        <span className="rounded-md px-3 py-1.5 font-semibold text-[#0a0a0f]" style={{ background: dark }}>
          ✓ {name || "Brand"}
        </span>
      </span>
    </div>
  );
}

function Basics({ brand, onName }: { brand?: Brand; onName?: (n: string) => void }) {
  const [light, setLight] = useState(brand?.accent.light ?? "#2563eb");
  const [dark, setDark] = useState(brand?.accent.dark ?? "#60a5fa");
  const [name, setName] = useState(brand?.name ?? "");
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex flex-col gap-1 text-xs text-muted">
          Name
          <input
            name="name"
            required
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              onName?.(e.target.value);
            }}
            className={input}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Short name
          <input name="short_name" defaultValue={brand?.shortName ?? ""} placeholder="Same as name" className={input} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Website
          <input name="website" defaultValue={brand?.website ?? ""} placeholder="https://example.com" className={input} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Posts per week, per platform
          <input name="cadence" type="number" min={0} max={50} step="0.5" defaultValue={brand?.cadence.postsPerWeek ?? 0} className={input} />
        </label>
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1 text-xs text-muted">
          Colour (light mode)
          <input name="accent_light" type="color" value={light} onChange={(e) => setLight(e.target.value)} className="h-9 w-16 rounded-lg border border-line bg-page" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Colour (dark mode, usually brighter)
          <input name="accent_dark" type="color" value={dark} onChange={(e) => setDark(e.target.value)} className="h-9 w-16 rounded-lg border border-line bg-page" />
        </label>
        <ColourPreview light={light} dark={dark} name={name} />
      </div>
    </div>
  );
}

function PlatformPicker({ value, onChange }: { value: Platform[]; onChange: (v: Platform[]) => void }) {
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="mb-1 text-xs text-muted">Platforms this brand uses</legend>
      <div className="flex flex-wrap gap-2">
        {PLATFORMS.map((p) => (
          <label key={p} className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-sm has-[:checked]:border-ink has-[:checked]:bg-surface-2">
            <input type="checkbox" name="platforms" value={p} checked={value.includes(p)} onChange={(e) => onChange(e.target.checked ? [...value, p] : value.filter((x) => x !== p))} />
            {PLATFORM_INFO[p].label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Choices for a tile: each metric the brand has a source for, combined ("all") or per platform. */
function tileChoices(platforms: Platform[]) {
  return METRICS.filter((m) => !m.key.endsWith("_weighted") && m.platforms.some((p) => platforms.includes(p))).flatMap((m) => {
    const sources = m.platforms.filter((p) => platforms.includes(p));
    const all = { value: `${m.key}|all`, label: sources.length > 1 || m.aggregation === "ratio" ? `${m.label} (all)` : `${m.label}` };
    const per = m.aggregation === "ratio" || sources.length < 2 ? [] : sources.map((p) => ({ value: `${m.key}|${p}`, label: `${m.label} · ${PLATFORM_INFO[p].label}` }));
    return sources.length === 1 && m.aggregation !== "ratio" ? [{ value: `${m.key}|${sources[0]}`, label: m.label }] : [all, ...per];
  });
}

/** Name for a saved tile that isn't one of the standard choices (e.g. a ratio pinned to its platform). */
function tileName(t: TileSpec, platforms: Platform[]): string {
  const def = METRICS.find((m) => m.key === t.metric);
  if (!def) return `${t.metric} (unknown)`;
  if (t.platform !== "all" && !platforms.includes(t.platform)) return `${def.label} (platform not ticked)`;
  return t.platform === "all" ? def.label : `${def.label} · ${PLATFORM_INFO[t.platform].label}`;
}

/** An ordered list of tiles: pick, rename, move up/down, remove. Serialised into a hidden field. */
function TileList({ name, label, initial, platforms, max }: { name: string; label: string; initial: TileSpec[]; platforms: Platform[]; max: number }) {
  const [tiles, setTiles] = useState(initial);
  const choices = tileChoices(platforms);
  const move = (i: number, d: number) => setTiles((t) => {
    const n = [...t];
    [n[i], n[i + d]] = [n[i + d], n[i]];
    return n;
  });
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted">{label}</p>
      <input type="hidden" name={name} value={JSON.stringify(tiles)} />
      <ol className="flex flex-col gap-1.5">
        {tiles.map((t, i) => (
          <li key={`${t.metric}-${t.platform}-${i}`} className="flex flex-wrap items-center gap-2">
            <span className="w-5 text-right text-xs text-muted">{i + 1}</span>
            <select
              value={`${t.metric}|${t.platform}`}
              onChange={(e) => {
                const [metric, platform] = e.target.value.split("|");
                setTiles((all) => all.map((x, j) => (j === i ? { metric, platform: platform as TileSpec["platform"] } : x)));
              }}
              className={`${input} min-w-56 px-2`}
            >
              {!choices.some((c) => c.value === `${t.metric}|${t.platform}`) && <option value={`${t.metric}|${t.platform}`}>{tileName(t, platforms)}</option>}
              {choices.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            <input
              value={t.label ?? ""}
              onChange={(e) => setTiles((all) => all.map((x, j) => (j === i ? { ...x, label: e.target.value || undefined } : x)))}
              placeholder="Label (optional)"
              className={`${input} w-44`}
            />
            <button type="button" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up" className="rounded px-1.5 text-ink-2 hover:bg-surface-2 disabled:opacity-30">
              ↑
            </button>
            <button type="button" disabled={i === tiles.length - 1} onClick={() => move(i, 1)} aria-label="Move down" className="rounded px-1.5 text-ink-2 hover:bg-surface-2 disabled:opacity-30">
              ↓
            </button>
            <button type="button" onClick={() => setTiles((all) => all.filter((_, j) => j !== i))} aria-label="Remove" className="rounded px-1.5 text-muted hover:bg-surface-2 hover:text-bad">
              ×
            </button>
          </li>
        ))}
      </ol>
      {tiles.length < max && choices.length > 0 && (
        <button
          type="button"
          onClick={() => {
            const [metric, platform] = choices[0].value.split("|");
            setTiles((all) => [...all, { metric, platform: platform as TileSpec["platform"] }]);
          }}
          className="self-start rounded-lg border border-line px-3 py-1 text-sm text-ink-2 hover:bg-surface-2 hover:text-ink"
        >
          + Add
        </button>
      )}
    </div>
  );
}

function BrandEditor({ brand, canArchive }: { brand: Brand; canArchive: boolean }) {
  const { pending, message, run } = useAction();
  const [platforms, setPlatforms] = useState<Platform[]>(brand.platforms);
  return (
    <details className={`${card} ${brand.active ? "" : "opacity-70"}`}>
      <summary className="flex cursor-pointer flex-wrap items-center gap-3">
        <span aria-hidden className="size-4 rounded-full" style={{ background: brand.accent.light }} />
        <span className="font-display text-xl font-extrabold">{brand.name}</span>
        {!brand.active && <span className="rounded-md bg-surface-2 px-2 py-0.5 text-xs text-muted">Archived</span>}
        <span className="text-sm text-muted">{brand.platforms.map((p) => PLATFORM_INFO[p as Platform]?.label ?? p).join(" · ")}</span>
      </summary>
      <form action={(fd) => run(() => saveBrand(fd))} className={`mt-5 flex flex-col gap-5 ${pending ? "opacity-60" : ""}`}>
        <input type="hidden" name="id" value={brand.id} />
        <Basics brand={brand} />
        <PlatformPicker value={platforms} onChange={setPlatforms} />
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <TileList name="scoreboard" label="Weekly Review scoreboard tiles (in order)" initial={brand.scoreboard} platforms={platforms} max={8} />
          <TileList name="funnel" label="Weekly Review funnel steps (top to bottom)" initial={brand.funnel} platforms={platforms} max={8} />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={pending} className="h-9 rounded-lg bg-ink px-4 text-sm font-semibold text-page disabled:opacity-60">
            {pending ? "Saving…" : "Save changes"}
          </button>
          {(canArchive || !brand.active) && (
            <button
              type="button"
              disabled={pending}
              onClick={() => (brand.active ? confirm(`Archive ${brand.name}? It disappears from Pulse but its history is kept.`) : true) && run(() => setBrandActive(brand.id!, !brand.active))}
              className="h-9 rounded-lg px-3 text-sm text-ink-2 hover:bg-surface-2 hover:text-ink"
            >
              {brand.active ? "Archive brand" : "Restore brand"}
            </button>
          )}
          {message && <span className={`text-sm ${message.ok ? "text-good" : "text-bad"}`}>{message.text}</span>}
        </div>
      </form>
    </details>
  );
}

function AddBrand() {
  const { pending, message, run } = useAction();
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [key, setKey] = useState(0);
  return (
    <details className={`${card} border-dashed`}>
      <summary className="cursor-pointer font-semibold">+ Add a brand</summary>
      <form
        key={key}
        action={(fd) =>
          run(async () => {
            const r = await addBrand(fd);
            if (r.ok) {
              setPlatforms([]);
              setKey((k) => k + 1);
            }
            return r;
          })
        }
        className={`mt-5 flex flex-col gap-5 ${pending ? "opacity-60" : ""}`}
      >
        <Basics />
        <PlatformPicker value={platforms} onChange={setPlatforms} />
        <p className="text-xs text-muted">Pulse picks starting scoreboard tiles from the platforms; change them afterwards here.</p>
        <button type="submit" disabled={pending} className="h-9 self-start rounded-lg bg-ink px-4 text-sm font-semibold text-page disabled:opacity-60">
          {pending ? "Adding…" : "Add brand"}
        </button>
      </form>
      {message && <p className={`mt-3 text-sm ${message.ok ? "text-good" : "text-bad"}`}>{message.text}</p>}
    </details>
  );
}

/** Every brand (archived ones last), each opening into an editor, plus "Add a brand". */
export function Brands({ brands }: { brands: Brand[] }) {
  const active = brands.filter((b) => b.active);
  return (
    <div className="flex flex-col gap-3">
      {[...active, ...brands.filter((b) => !b.active)].map((b) => (
        <BrandEditor key={b.id} brand={b} canArchive={active.length > 1} />
      ))}
      <AddBrand />
    </div>
  );
}
