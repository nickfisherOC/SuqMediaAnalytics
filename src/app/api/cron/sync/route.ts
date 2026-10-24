import { NextResponse, type NextRequest } from "next/server";
import { checkOutcomes, generateForBrand, type GenerateOutcome } from "@/lib/ai/weekly";
import { parseControls } from "@/lib/controls";
import { queryBrands } from "@/lib/data/queries";
import { todayInEdmonton } from "@/lib/dates";
import { createServiceClient } from "@/lib/supabase/service";
import { syncAll } from "@/lib/sync/run-all";

export const maxDuration = 300;

/**
 * Nightly job, called by Vercel Cron (see vercel.json): sync every account,
 * score action items that have had two weeks, then write each brand's AI
 * summary for the default view (last 7 days). Vercel sends
 * `Authorization: Bearer $CRON_SECRET`; anything else is refused.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not set" }, { status: 500 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = await syncAll("daily");
  const failed = results.filter((r) => !r.ok);

  // The AI steps never fail the sync.
  const db = createServiceClient();
  const today = todayInEdmonton();
  let outcomesScored: number | string = 0;
  let summaries: GenerateOutcome[] | string = [];
  try {
    const brands = await queryBrands(db);
    outcomesScored = await checkOutcomes(db, brands, today).catch((e) => `error: ${e instanceof Error ? e.message : e}`);
    if (process.env.ANTHROPIC_API_KEY?.trim()) {
      const controls = parseControls({ brand: "all" }, brands, today);
      summaries = await Promise.all(
        brands.map((b) =>
          generateForBrand(db, brands, controls, b, today, "nightly").catch((e) => ({ brand: b.slug, ok: false, message: e instanceof Error ? e.message : String(e) })),
        ),
      );
    }
  } catch (e) {
    summaries = `error: ${e instanceof Error ? e.message : e}`;
  }

  return NextResponse.json({ ok: failed.length === 0, results, outcomesScored, summaries }, { status: failed.length ? 207 : 200 });
}
