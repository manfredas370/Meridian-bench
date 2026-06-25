// Per-participant "analyst take": a short, AI-generated executive summary of one
// model's strategy + standing, refreshed daily and shown on its drill-down page.
// Generated server-side and persisted (never per page view). Falls back to a
// deterministic templated summary when models are mocked (offline/local).

import { generateText } from "ai";

import { modelsAreMocked } from "@/lib/decision";
import type { StepDeps } from "@/lib/engine/tick";
import { benchmarkReturn, buildLeaderboard, type LeaderRow } from "@/lib/metrics";

const SUMMARY_MODEL = process.env.SUMMARY_MODEL ?? "anthropic/claude-haiku-4.5";

const SYSTEM = `You are a sharp, concise markets analyst writing a short "analyst take" on ONE model competing in a paper-trading benchmark. The model manages a virtual $1000 US-equity portfolio under fixed rules, measured against passive SPY/QQQ buy-and-hold controls. Write 2-4 plain sentences: its standing and return versus the SPY benchmark, its risk posture (cash level, drawdown), the strategy visible in its recent decisions, and its current stance. Be specific and evaluative — name tickers and cite the numbers. No markdown, no preamble, no bullet lists, no financial advice.`;

const pct = (x: number | null | undefined) => (x == null ? "n/a" : `${(x * 100).toFixed(1)}%`);

function ordersBlurb(ordersRaw: unknown): string {
  const orders = Array.isArray(ordersRaw) ? (ordersRaw as { side: string; ticker: string }[]) : [];
  if (orders.length === 0) return "held";
  return orders.map((o) => `${o.side === "sell" ? "-" : "+"}${o.ticker}`).join(" ");
}

function buildPrompt(row: LeaderRow, rank: number, field: number, spy: number | null, recent: string[]): string {
  const p = row.participant;
  const vsSpy = spy != null ? pct(row.totalReturnPct - spy) : "n/a";
  return [
    `Model: ${p.label} (rank ${rank} of ${field})`,
    `Total return: ${pct(row.totalReturnPct)} | vs SPY: ${vsSpy} | NAV: $${row.latestNav.toFixed(2)}`,
    `Max drawdown: ${pct(row.maxDrawdownPct)} | Cash: ${pct(row.cashPct)} of NAV`,
    "",
    "Recent decisions (newest first):",
    ...(recent.length ? recent : ["(none yet)"]),
    "",
    "Write the analyst take now.",
  ].join("\n");
}

function mockSummary(row: LeaderRow, rank: number, field: number, spy: number | null): string {
  const p = row.participant;
  const vs = spy != null ? `${pct(row.totalReturnPct - spy)} vs SPY` : "no benchmark";
  return `${p.label} sits #${rank} of ${field} at ${pct(row.totalReturnPct)} (${vs}), holding ${pct(
    row.cashPct,
  )} cash with a ${pct(row.maxDrawdownPct)} max drawdown. (Offline mock — no live analysis.)`;
}

/** Regenerate + persist each participant's analyst take for the latest day. */
export async function refreshSummaries(deps: StepDeps, experimentId: string): Promise<number> {
  const { store } = deps;
  const experiment = await store.getExperiment(experimentId);
  if (!experiment) return 0;

  const [participants, navHistory] = await Promise.all([
    store.listParticipants(experimentId),
    store.listNavHistory(experimentId),
  ]);
  const rows = buildLeaderboard(participants, navHistory);
  const spy = benchmarkReturn(rows, "SPY");
  const field = rows.length;
  const day = Array.from(new Set(navHistory.map((n) => n.tradingDay))).sort().at(-1);
  if (!day) return 0;

  const results = await Promise.all(
    rows.map(async (row, i) => {
      const rank = i + 1;
      const p = row.participant;
      try {
        // Passive controls get a fixed line — they need no analysis.
        if (p.kind === "passive") {
          const text = `${p.label} is a passive buy-and-hold control on ${p.benchmarkTicker ?? "its index"} — the benchmark every model is measured against, currently ${pct(
            row.totalReturnPct,
          )} on the run.`;
          await store.setParticipantSummary(p.id, text, day);
          return true;
        }

        let text: string;
        if (deps.isMock || modelsAreMocked()) {
          text = mockSummary(row, rank, field, spy);
        } else {
          const recent = (await store.recentDecisions(p.id, 5)).map(
            (d) =>
              `${d.tradingDay} [${d.marketOutlook ?? "?"}, conf ${pct(d.confidence)}] ${ordersBlurb(
                d.ordersRaw,
              )}: ${d.thesis ?? "(no thesis)"}`,
          );
          const res = await generateText({
            model: SUMMARY_MODEL,
            system: SYSTEM,
            prompt: buildPrompt(row, rank, field, spy, recent),
            maxOutputTokens: 300,
            maxRetries: 1,
            abortSignal: AbortSignal.timeout(60_000),
          });
          text = res.text.trim();
          if (!text) return false;
        }
        await store.setParticipantSummary(p.id, text, day);
        return true;
      } catch {
        return false; // never let a summary failure break the run
      }
    }),
  );
  return results.filter(Boolean).length;
}
