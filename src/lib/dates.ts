/**
 * Calendar-date helpers. Every date in Pulse is a plain `YYYY-MM-DD` string
 * that means a calendar day in America/Edmonton. Connectors are responsible
 * for bucketing source timestamps into Edmonton days before storing them;
 * after that, arithmetic happens on calendar dates only (no clocks, no DST).
 */

export const TIMEZONE = "America/Edmonton";

export type ISODate = string;

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isISODate(value: string): value is ISODate {
  if (!ISO_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function toUTC(date: ISODate): Date {
  return new Date(`${date}T00:00:00Z`);
}

function fromUTC(d: Date): ISODate {
  return d.toISOString().slice(0, 10);
}

/** Today's calendar date in Edmonton. */
export function todayInEdmonton(now: Date = new Date()): ISODate {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Converts an instant to the Edmonton calendar day it falls on. */
export function edmontonDateOf(instant: Date | string): ISODate {
  return todayInEdmonton(typeof instant === "string" ? new Date(instant) : instant);
}

export function addDays(date: ISODate, days: number): ISODate {
  const d = toUTC(date);
  d.setUTCDate(d.getUTCDate() + days);
  return fromUTC(d);
}

/** Whole days from `a` to `b` (b - a). */
export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((toUTC(b).getTime() - toUTC(a).getTime()) / 86_400_000);
}

/** ISO weekday: Monday = 1 … Sunday = 7. */
export function isoWeekday(date: ISODate): number {
  const dow = toUTC(date).getUTCDay();
  return dow === 0 ? 7 : dow;
}

/** The Monday on or before `date`. Weeks run Monday to Sunday. */
export function startOfWeek(date: ISODate): ISODate {
  return addDays(date, 1 - isoWeekday(date));
}

/**
 * Same calendar day `months` months away, clamped to the end of the target
 * month (Mar 31 − 1 month = Feb 28/29).
 */
export function addMonths(date: ISODate, months: number): ISODate {
  const [y, m, d] = date.split("-").map(Number);
  const targetMonthIndex = m - 1 + months;
  const ty = y + Math.floor(targetMonthIndex / 12);
  const tm = ((targetMonthIndex % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  return fromUTC(new Date(Date.UTC(ty, tm, Math.min(d, lastDay))));
}

/** Inclusive list of days from `from` to `to`. */
export function eachDay(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export function minDate(a: ISODate, b: ISODate): ISODate {
  return a < b ? a : b;
}

export function maxDate(a: ISODate, b: ISODate): ISODate {
  return a > b ? a : b;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Oct 12" */
export function formatShort(date: ISODate): string {
  const [, m, d] = date.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}

/** "Oct 12 – 18" or "Sep 28 – Oct 4" */
export function formatRange(from: ISODate, to: ISODate): string {
  if (from === to) return formatShort(from);
  const sameMonth = from.slice(0, 7) === to.slice(0, 7);
  const end = sameMonth ? String(Number(to.slice(8))) : formatShort(to);
  return `${formatShort(from)} – ${end}`;
}
