/**
 * The "never invent a number" check. Every figure in an answer must match a
 * number in the tool results (allowing for rounding and percent/currency
 * formatting), or come from the question itself, or be part of a date.
 */

const NUM = /(?<![\w.])[-−]?\$?\d[\d,]*(?:\.\d+)?%?(?![\w])/g;

function parse(token: string): { value: number; decimals: number } | null {
  const clean = token.replace(/[−]/g, "-").replace(/[$,%]/g, "");
  const value = Number(clean);
  if (!Number.isFinite(value)) return null;
  const decimals = clean.includes(".") ? clean.split(".")[1].length : 0;
  return { value, decimals };
}

/** All numbers inside a JSON value (including numeric strings). */
export function numbersIn(value: unknown, out: number[] = []): number[] {
  if (typeof value === "number" && Number.isFinite(value)) out.push(value);
  else if (typeof value === "string") {
    for (const m of value.match(NUM) ?? []) {
      const p = parse(m);
      if (p) out.push(p.value);
    }
  } else if (Array.isArray(value)) value.forEach((v) => numbersIn(v, out));
  else if (value && typeof value === "object") Object.values(value).forEach((v) => numbersIn(v, out));
  return out;
}

/** Strips dates and series labels ("Oct 17", "2026-10-17", "Day 17", "7 days") before checking. */
function withoutDates(text: string): string {
  return text
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, " ")
    .replace(/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2}(?:\s*[–-]\s*\d{1,2})?(?:,\s*\d{4})?/gi, " ")
    .replace(/\b(?:Day|Days|Episode|Week)\s+\d+(?:\s*[–-]\s*\d+)?/gi, " ")
    .replace(/\b\d+\s*(?:days?|weeks?|months?|hours?|minutes?|mins?|years?)\b/gi, " ")
    .replace(/\b(?:19|20)\d{2}\b/g, " ")
    .replace(/\b(?:top|last|past|first|next)\s+\d+\b/gi, " ");
}

function matches(n: { value: number; decimals: number }, known: number[]): boolean {
  const tol = 0.5 * 10 ** -n.decimals + 1e-9;
  return known.some((k) => {
    for (const cand of [k, k * 100, Math.abs(k), Math.abs(k) * 100]) {
      if (Math.abs(cand - Math.abs(n.value)) <= tol) return true;
    }
    return false;
  });
}

/** Numbers in the answer that no tool result (or the question) supports. */
export function unsupportedNumbers(answer: string, toolResults: unknown[], question: string): string[] {
  const known = [...numbersIn(toolResults), ...numbersIn(question)];
  const bad: string[] = [];
  for (const token of withoutDates(answer).match(NUM) ?? []) {
    const p = parse(token);
    if (!p) continue;
    // Small counting words ("2 platforms", "3 reasons") are fine when the integer is tiny.
    if (p.decimals === 0 && Math.abs(p.value) <= 10 && !token.includes("%") && !token.includes("$")) continue;
    if (!matches(p, known)) bad.push(token);
  }
  return [...new Set(bad)];
}
