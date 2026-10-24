import Anthropic from "@anthropic-ai/sdk";
import { unstable_rethrow } from "next/navigation";
import { NextResponse, type NextRequest } from "next/server";
import { ask, ASK_PROMPT_VERSION, hashInput, type ChatTurn } from "@/lib/ai/ask";
import { getAppContext } from "@/lib/data/source";
import { createServiceClient } from "@/lib/supabase/service";

export const maxDuration = 120;

/** Ask Pulse. Signed-in team members only; every call is logged in ai_calls. */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getAppContext();
    if (ctx.mode !== "live") return NextResponse.json({ error: "Ask Pulse works on the live site, not preview mode." }, { status: 400 });
    if (!process.env.ANTHROPIC_API_KEY?.trim()) return NextResponse.json({ error: "Ask Pulse isn't set up yet (missing API key)." }, { status: 503 });

    const body = (await request.json().catch(() => null)) as { question?: unknown; history?: unknown } | null;
    const question = typeof body?.question === "string" ? body.question.trim().slice(0, 2000) : "";
    if (!question) return NextResponse.json({ error: "Ask a question first." }, { status: 400 });
    const history: ChatTurn[] = Array.isArray(body?.history)
      ? (body.history as ChatTurn[])
          .filter((t) => (t?.role === "user" || t?.role === "assistant") && typeof t.text === "string")
          .map((t) => ({ role: t.role, text: t.text.slice(0, 4000) }))
      : [];

    const db = createServiceClient();
    const started = Date.now();
    try {
      const r = await ask({ db, brands: ctx.brands, today: ctx.today }, history, question);
      await db.from("ai_calls").insert({
        feature: "ask",
        prompt_version: ASK_PROMPT_VERSION,
        model: r.model,
        input_hash: hashInput({ question, history }),
        input: { question, history_turns: history.length, asked_by: ctx.viewer.email },
        output: { answer: r.answer, lookups: r.lookups, unverified: r.unverified, ms: Date.now() - started },
        input_tokens: r.usage.input + r.usage.cacheRead + r.usage.cacheWrite,
        output_tokens: r.usage.output,
        cost_usd: Math.round(r.costUsd * 10000) / 10000,
        status: r.unverified.length ? "rejected" : "ok",
      });
      return NextResponse.json({ answer: r.answer, lookups: r.lookups, unverified: r.unverified });
    } catch (e) {
      const message =
        e instanceof Anthropic.RateLimitError
          ? "Ask Pulse is busy right now. Try again in a minute."
          : e instanceof Anthropic.AuthenticationError
            ? "Ask Pulse's API key was refused. Check ANTHROPIC_API_KEY."
            : e instanceof Anthropic.APIError
              ? `Claude API error (${e.status}). Try again.`
              : "Something went wrong answering that.";
      await db.from("ai_calls").insert({
        feature: "ask",
        prompt_version: ASK_PROMPT_VERSION,
        model: process.env.ANTHROPIC_MODEL?.trim() || "claude-opus-5-5",
        input_hash: hashInput({ question, history }),
        input: { question, asked_by: ctx.viewer.email },
        status: "error",
        error: e instanceof Error ? e.message.slice(0, 1000) : String(e),
      });
      return NextResponse.json({ error: message }, { status: 502 });
    }
  } catch (e) {
    unstable_rethrow(e);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
