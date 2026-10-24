import "server-only";
import { createHash } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { ASK_PROMPT_VERSION, askSystemPrompt } from "./prompts/ask";
import { runTool, toolDefinitions, type ToolContext } from "./tools";
import { unsupportedNumbers } from "./verify";

/**
 * Ask Pulse: a question in, an answer out, with every number taken from
 * Pulse's read-only lookups. If the answer contains a figure no lookup
 * returned, Claude is asked once to fix it; anything still unsupported is
 * flagged to the reader.
 */

export interface ChatTurn {
  role: "user" | "assistant";
  text: string;
}

export interface AskResult {
  answer: string;
  lookups: { name: string; input: unknown }[];
  /** Numbers in the answer that no lookup supported, after one correction round. */
  unverified: string[];
  costUsd: number;
}

const MAX_STEPS = 10;
// Claude Opus 5.5 list prices per token (input, output, cache write, cache read).
const PRICE = { input: 4e-6, output: 20e-6, cacheWrite: 5e-6, cacheRead: 0.2e-6 };

export const askModel = () => process.env.ANTHROPIC_MODEL?.trim() || "claude-opus-5-5";

export async function ask(ctx: ToolContext, history: ChatTurn[], question: string): Promise<AskResult & { usage: Usage; model: string }> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY?.trim() });
  const model = askModel();
  const tools = toolDefinitions(ctx);
  const system = askSystemPrompt({ today: ctx.today, brands: ctx.brands.map((b) => ({ slug: b.slug, name: b.name, platforms: b.platforms })) });

  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...history.slice(-12).map((t) => ({ role: t.role, content: t.text }) as Anthropic.Beta.BetaMessageParam),
    { role: "user", content: question },
  ];
  const lookups: AskResult["lookups"] = [];
  const results: unknown[] = [];
  const usage: Usage = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 };
  let answer = "";
  let corrected = false;
  let unverified: string[] = [];

  for (let step = 0; step < MAX_STEPS; step++) {
    const response = await client.beta.messages.create({
      model,
      max_tokens: 16000,
      // Stable instructions and tools first, cached; the conversation follows.
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      tools,
      messages,
      output_config: { effort: "medium" },
      // If a safety filter declines, the API retries on another model instead of failing.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
    addUsage(usage, response.usage);

    if (response.stop_reason === "refusal") {
      answer = "I can't help with that one. Try asking about Pulse's numbers, content, ads or pipeline.";
      break;
    }

    const toolUses = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (response.stop_reason === "tool_use" || response.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: response.content });
      if (toolUses.length) {
        // Run every lookup in this turn together and return all results in one message.
        const outputs = await Promise.all(
          toolUses.map(async (t) => {
            lookups.push({ name: t.name, input: t.input });
            const r = await runTool(ctx, t.name, (t.input ?? {}) as Record<string, unknown>);
            if (r.ok) results.push(r.result);
            return {
              type: "tool_result" as const,
              tool_use_id: t.id,
              content: typeof r.result === "string" ? r.result : JSON.stringify(r.result),
              is_error: !r.ok,
            };
          }),
        );
        messages.push({ role: "user", content: outputs });
      }
      continue;
    }

    answer = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    const askedNumbers = [question, ...history.filter((t) => t.role === "user").map((t) => t.text)].join(" ");
    unverified = unsupportedNumbers(answer, results, askedNumbers);
    if (unverified.length && !corrected) {
      corrected = true;
      messages.push({ role: "assistant", content: response.content });
      messages.push({
        role: "user",
        content: `Pulse check: these numbers in your answer don't appear in any lookup result: ${unverified.join(", ")}. Look them up with the tools, or leave them out, then give your full answer again.`,
      });
      continue;
    }
    break;
  }

  if (!answer) answer = "Sorry, I couldn't finish that. Try asking in a simpler way.";
  return { answer, lookups, unverified, costUsd: cost(usage), usage, model };
}

export interface Usage {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
}

function addUsage(u: Usage, r: Anthropic.Beta.BetaUsage) {
  u.input += r.input_tokens ?? 0;
  u.output += r.output_tokens ?? 0;
  u.cacheWrite += r.cache_creation_input_tokens ?? 0;
  u.cacheRead += r.cache_read_input_tokens ?? 0;
}

const cost = (u: Usage) => u.input * PRICE.input + u.output * PRICE.output + u.cacheWrite * PRICE.cacheWrite + u.cacheRead * PRICE.cacheRead;

export function hashInput(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 32);
}

export { ASK_PROMPT_VERSION };
