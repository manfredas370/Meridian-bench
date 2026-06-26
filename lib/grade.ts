// Thesis-quality grading: an LLM "judge" rates each past decision's reasoning
// (was the thesis sound, and did it play out?) on a 0–1 scale, with a one-line
// note. Runs after the fact (the outcome must be known), grades a few ungraded
// decisions per participant per refresh, and persists onto the decision.
// Mock fallback offline. Best-effort — never breaks the daily step.

import { generateText } from "ai";

import { modelsAreMocked } from "@/lib/decision";
import type { StepDeps } from "@/lib/engine/tick";

const GRADE_MODEL = process.env.SUMMARY_MODEL ?? "anthropic/claude-haiku-4.5";
const PER_RUN = 3; // grade at most N ungraded decisions per participant per refresh

const SYSTEM = `You are a trading desk reviewer grading ONE past decision by a model in a paper-trading benchmark. Judge the REASONING, not luck: was the thesis coherent and risk-aware given the data, and did the move it implied actually play out in the days after? Reply with ONLY a JSON object: {"score": <0.0-1.0>, "note": "<≤120 chars>"}. A high score = sound reasoning that was borne out; low = incoherent or contradicted by what followed.`;

const pct = (x: number | null | undefined) => (x == null ? "n/a" : `${(x * 100).toFixed(1)}%`);

function ordersBlurb(ordersRaw: unknown): string {
  const orders = Array.isArray(ordersRaw) ? (ordersRaw as { side: string; ticker: string }[]) : [];
  return orders.length ? orders.map((o) => `${o.side === "sell" ? "-" : "+"}${o.ticker}`).join(" ") : "held";
}

function parseGrade(text: string): { score: number; note: string } | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const o = JSON.parse(m[0]);
    const score = Math.max(0, Math.min(1, Number(o.score)));
    if (!Number.isFinite(score)) return null;
    return { score, note: String(o.note ?? "").slice(0, 160) };
  } catch {
    return null;
  }
}

export async function refreshGrades(deps: StepDeps, experimentId: string): Promise<number> {
  const { store } = deps;
  const exp = await store.getExperiment(experimentId);
  if (!exp) return 0;

  const [participants, navAll] = await Promise.all([
    store.listParticipants(experimentId),
    store.listNavHistory(experimentId),
  ]);
  const days = Array.from(new Set(navAll.map((n) => n.tradingDay))).sort();
  const latest = days.at(-1);
  if (!latest) return 0;

  const counts = await Promise.all(
    participants
      .filter((p) => p.kind !== "passive")
      .map(async (p) => {
        const decisions = await store.listDecisions(p.id); // newest first
        const retByDay = new Map(navAll.filter((n) => n.participantId === p.id).map((n) => [n.tradingDay, n.dailyReturn]));
        // Gradeable: outcome known (before the latest day), has a thesis, not yet graded.
        const todo = decisions
          .filter((d) => d.id && d.thesis && !d.error && d.tradingDay < latest && d.reasoningScore == null)
          .slice(0, PER_RUN);

        let n = 0;
        for (const d of todo) {
          try {
            const after = days
              .filter((x) => x > d.tradingDay)
              .slice(0, 3)
              .map((x) => pct(retByDay.get(x)))
              .join(", ");
            let score: number;
            let note: string;
            if (deps.isMock || modelsAreMocked()) {
              score = 0.5;
              note = "Offline mock — reasoning not judged.";
            } else {
              const prompt =
                `Decision on ${d.tradingDay} — outlook ${d.marketOutlook ?? "?"}, confidence ${pct(d.confidence)}.\n` +
                `Orders: ${ordersBlurb(d.ordersRaw)}\n` +
                `Thesis: ${d.thesis}\n` +
                `Its portfolio's daily returns over the following days: ${after || "n/a"}\n\n` +
                `Grade the reasoning now.`;
              const res = await generateText({
                model: GRADE_MODEL,
                system: SYSTEM,
                prompt,
                maxOutputTokens: 200,
                maxRetries: 1,
                abortSignal: AbortSignal.timeout(45_000),
              });
              const parsed = parseGrade(res.text);
              if (!parsed) continue;
              ({ score, note } = parsed);
            }
            await store.setDecisionGrade(d.id as string, score, note, latest);
            n++;
          } catch {
            // skip on failure
          }
        }
        return n;
      }),
  );
  return counts.reduce((a, b) => a + b, 0);
}
