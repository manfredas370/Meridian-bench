// Daily-tick engine. Mode-agnostic and store-agnostic: snapshot → decide →
// referee → ledger → mark NAV, with the `decisions` row acting as the
// exactly-once guard. `stepParticipant` is the unit the production fan-out
// invokes per model; `runDailyStep` is the sequential runner used by the
// dev/test path. Re-running a day is a no-op (idempotent).

import { type DecisionContext, runDecision } from "@/lib/decision";
import type { DecisionOutput } from "@/lib/decision-schema";
import { applyExecution, buildPortfolioView, computeNav, type Fill } from "@/lib/ledger";
import { round8 } from "@/lib/money";
import { passiveExecution } from "@/lib/passive";
import { validateOrders } from "@/lib/referee";
import type { ExperimentRow, ParticipantRow, Store } from "@/lib/store/types";
import type { ExecutionReport, MarketSnapshot, PortfolioState, TickerSnapshot } from "@/lib/types";

import type { FundamentalsBundle, FundamentalsProvider } from "@/lib/market/finnhub";

export type SnapshotProvider = (
  tickers: string[],
  tradingDay: string,
) => Promise<TickerSnapshot[]>;

export interface StepDeps {
  store: Store;
  snapshotProvider: SnapshotProvider;
  isMock: boolean;
  snapshotSource?: string;
  /** Fundamentals + news source — attached to the snapshot on the fundamentals tier. */
  fundamentalsProvider?: FundamentalsProvider;
}

export interface StepOutcome {
  participantId: string;
  label: string;
  status: "executed" | "skipped" | "error";
  nav?: number;
  tradeCount?: number;
  error?: string;
}

/** Fetch + persist the shared snapshot once per (experiment, day). Reused on re-run. */
export async function ensureSnapshot(
  deps: StepDeps,
  experiment: ExperimentRow,
  tradingDay: string,
): Promise<MarketSnapshot> {
  const existing = await deps.store.getSnapshot(experiment.id, tradingDay);
  if (existing) return existing;

  const tickers = Array.from(
    new Set([...experiment.universe, ...experiment.benchmarkTickers]),
  );
  let ticks = await deps.snapshotProvider(tickers, tradingDay);

  // Fundamentals tier: attach fundamentals + news (windowed ≤ T-1) to the shared
  // snapshot, so every model on this experiment sees the same extra context.
  if (experiment.dataTier === "fundamentals" && deps.fundamentalsProvider) {
    const extras: Record<string, FundamentalsBundle> = await deps
      .fundamentalsProvider(tickers, tradingDay)
      .catch(() => ({}));
    ticks = ticks.map((t) =>
      extras[t.ticker] ? { ...t, fundamentals: extras[t.ticker].fundamentals, news: extras[t.ticker].news } : t,
    );
  }

  await deps.store.saveSnapshot(experiment.id, tradingDay, ticks, deps.snapshotSource ?? "TwelveData");
  const saved = await deps.store.getSnapshot(experiment.id, tradingDay);
  if (!saved) throw new Error(`Failed to persist snapshot for ${tradingDay}`);
  return saved;
}

/** Run one participant's decision for one day. Idempotent and never double-executes. */
export async function stepParticipant(
  deps: StepDeps,
  experiment: ExperimentRow,
  participant: ParticipantRow,
  snapshot: MarketSnapshot,
  tradingDay: string,
): Promise<StepOutcome> {
  const { store } = deps;
  const label = participant.label;

  if (await store.hasDecision(participant.id, tradingDay)) {
    return { participantId: participant.id, label, status: "skipped" };
  }

  const positions = await store.getPositions(participant.id);
  const state: PortfolioState = { cash: participant.cash, positions };

  let decision: DecisionOutput;
  let report: ExecutionReport | null = null;
  let fills: Fill[];
  let resultPortfolio: PortfolioState;
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;
  let latencyMs: number | null = null;
  let error: string | null = null;

  if (participant.kind === "passive" && participant.benchmarkTicker) {
    const ex = passiveExecution(state, snapshot, participant.benchmarkTicker);
    resultPortfolio = ex.portfolio;
    fills = ex.fills;
    decision = {
      thesis: `Passive buy & hold ${participant.benchmarkTicker}.`,
      confidence: 1,
      marketOutlook: "neutral",
      orders: [],
    };
  } else {
    const view = buildPortfolioView(state, snapshot);
    const recent = (await store.recentDecisions(participant.id, 3))
      .map((d) => d.thesis)
      .filter((t): t is string => !!t);
    const ctx: DecisionContext = {
      modelId: participant.modelId,
      isMock: deps.isMock,
      system: experiment.promptTemplate,
      modelParams: experiment.modelParams,
      rules: experiment.rules,
    };
    const res = await runDecision(ctx, snapshot, view, recent);
    decision = res.decision;
    inputTokens = res.inputTokens;
    outputTokens = res.outputTokens;
    latencyMs = res.latencyMs;
    error = res.error;
    report = validateOrders(decision, state, snapshot, experiment.rules);
    const applied = applyExecution(state, report);
    resultPortfolio = applied.portfolio;
    fills = applied.fills;
  }

  // The decision insert is the exactly-once guard. If we didn't create it,
  // another invocation already executed this day for this participant — bail.
  const { id: decisionId, created } = await store.saveDecision({
    participantId: participant.id,
    experimentId: experiment.id,
    tradingDay,
    thesis: decision.thesis,
    confidence: decision.confidence,
    marketOutlook: decision.marketOutlook,
    ordersRaw: decision.orders,
    inputTokens,
    outputTokens,
    latencyMs,
    modelId: participant.modelId,
    error,
  });
  if (!created) return { participantId: participant.id, label, status: "skipped" };

  if (report) {
    await store.saveValidations(
      report.orders.map((o) => ({
        decisionId,
        participantId: participant.id,
        tradingDay,
        ticker: o.ticker,
        side: o.side,
        requestedNotional: o.requestedNotional,
        finalNotional: o.finalNotional,
        finalShares: o.finalShares,
        fillPrice: o.fillPrice,
        status: o.status,
        reasonCode: o.reasonCode,
        note: o.note,
      })),
    );
  }
  if (fills.length > 0) {
    await store.saveTrades(
      fills.map((f) => ({
        participantId: participant.id,
        experimentId: experiment.id,
        decisionId,
        tradingDay,
        ticker: f.ticker,
        side: f.side,
        shares: f.shares,
        fillPrice: f.fillPrice,
        notional: f.notional,
        realizedPnl: f.realizedPnl,
      })),
    );
  }
  await store.savePositions(participant.id, resultPortfolio.positions);
  await store.setParticipantCash(participant.id, resultPortfolio.cash);

  const nav = computeNav(resultPortfolio, snapshot);
  const prev = await store.latestNav(participant.id);
  const dailyReturn = prev && prev.nav > 0 ? round8((nav.nav - prev.nav) / prev.nav) : null;
  await store.saveNav({
    participantId: participant.id,
    experimentId: experiment.id,
    tradingDay,
    nav: nav.nav,
    cash: nav.cash,
    investedValue: nav.investedValue,
    dailyReturn,
  });

  return {
    participantId: participant.id,
    label,
    status: "executed",
    nav: nav.nav,
    tradeCount: fills.length,
  };
}

/** Sequential runner: snapshot once, then step every participant. Used by the
 *  dev/test path; the production route fans out `stepParticipant` instead. */
export async function runDailyStep(
  deps: StepDeps,
  experimentId: string,
  tradingDay: string,
): Promise<{ tradingDay: string; snapshot: MarketSnapshot; outcomes: StepOutcome[] }> {
  const experiment = await deps.store.getExperiment(experimentId);
  if (!experiment) throw new Error(`Experiment ${experimentId} not found.`);

  const snapshot = await ensureSnapshot(deps, experiment, tradingDay);
  const participants = await deps.store.listParticipants(experimentId);

  const outcomes: StepOutcome[] = [];
  for (const p of participants) {
    try {
      outcomes.push(await stepParticipant(deps, experiment, p, snapshot, tradingDay));
    } catch (e) {
      outcomes.push({
        participantId: p.id,
        label: p.label,
        status: "error",
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return { tradingDay, snapshot, outcomes };
}
