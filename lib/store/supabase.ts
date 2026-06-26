// Supabase-backed Store (production). Uses the service-role key in server-only
// code. NOTE: PostgREST serializes `numeric` columns as strings to preserve
// precision, so every money/share field is coerced with Number() on read.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { MarketSnapshot, Position, TickerSnapshot } from "@/lib/types";
import type {
  DecisionRecord,
  ExperimentRow,
  ExperimentStatus,
  NavRecord,
  NewExperiment,
  NewParticipant,
  ParticipantRow,
  Store,
  TradeRecord,
  ValidationRecord,
} from "@/lib/store/types";

const n = (x: unknown): number => Number(x);
const nn = (x: unknown): number | null => (x == null ? null : Number(x));

function client(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for the Supabase store.");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapExperiment(r: any): ExperimentRow {
  return {
    id: r.id,
    name: r.name,
    status: r.status,
    startDate: r.start_date,
    endDate: r.end_date,
    cadence: r.cadence,
    startingCash: n(r.starting_cash),
    universe: r.universe ?? [],
    benchmarkTickers: r.benchmark_tickers ?? [],
    rules: r.rules,
    modelParams: r.model_params,
    promptTemplate: r.prompt_template,
    promptTemplateHash: r.prompt_template_hash,
    kind: r.kind ?? "live",
    parentExperimentId: r.parent_experiment_id ?? null,
    scenario: r.scenario ?? null,
    dataTier: r.data_tier ?? "price",
  };
}

function mapParticipant(r: any): ParticipantRow {
  return {
    id: r.id,
    experimentId: r.experiment_id,
    modelId: r.model_id,
    label: r.label,
    kind: r.kind,
    benchmarkTicker: r.benchmark_ticker,
    startingCash: n(r.starting_cash),
    cash: n(r.cash),
    status: r.status,
    summary: r.summary ?? null,
    summaryDay: r.summary_day ?? null,
  };
}

function mapTick(r: any): TickerSnapshot {
  return {
    ticker: r.ticker,
    open: nn(r.open),
    close: nn(r.close),
    prevClose: nn(r.prev_close),
    pctChange1d: nn(r.pct_change_1d),
    pctChange5d: nn(r.pct_change_5d),
    sma20: nn(r.sma20),
    sma50: nn(r.sma50),
    pctFrom20dHigh: nn(r.pct_from_20d_high),
    fundamentals: r.fundamentals ?? null,
    news: r.news ?? undefined,
  };
}

function mapDecision(r: any): DecisionRecord {
  return {
    id: r.id,
    participantId: r.participant_id,
    experimentId: r.experiment_id,
    tradingDay: r.trading_day,
    thesis: r.thesis,
    confidence: nn(r.confidence),
    marketOutlook: r.market_outlook,
    ordersRaw: r.orders_raw ?? [],
    inputTokens: r.input_tokens,
    outputTokens: r.output_tokens,
    latencyMs: r.latency_ms,
    modelId: r.model_id,
    error: r.error,
    reasoningScore: nn(r.reasoning_score),
    gradeNote: r.grade_note ?? null,
    gradedDay: r.graded_day ?? null,
  };
}

function mapTrade(r: any): TradeRecord {
  return {
    participantId: r.participant_id,
    experimentId: r.experiment_id,
    decisionId: r.decision_id,
    tradingDay: r.trading_day,
    ticker: r.ticker,
    side: r.side,
    shares: n(r.shares),
    fillPrice: n(r.fill_price),
    notional: n(r.notional),
    realizedPnl: nn(r.realized_pnl),
  };
}

function mapNav(r: any): NavRecord {
  return {
    participantId: r.participant_id,
    experimentId: r.experiment_id,
    tradingDay: r.trading_day,
    nav: n(r.nav),
    cash: n(r.cash),
    investedValue: n(r.invested_value),
    dailyReturn: nn(r.daily_return),
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export class SupabaseStore implements Store {
  private db = client();

  async createExperiment(input: NewExperiment): Promise<ExperimentRow> {
    const { data, error } = await this.db
      .from("experiments")
      .insert({
        name: input.name,
        status: input.status ?? "running",
        start_date: input.startDate ?? null,
        end_date: input.endDate ?? null,
        cadence: input.cadence ?? "daily",
        starting_cash: input.startingCash,
        universe: input.universe,
        benchmark_tickers: input.benchmarkTickers,
        rules: input.rules,
        model_params: input.modelParams,
        prompt_template: input.promptTemplate,
        prompt_template_hash: input.promptTemplateHash,
        kind: input.kind ?? "live",
        parent_experiment_id: input.parentExperimentId ?? null,
        scenario: input.scenario ?? null,
        data_tier: input.dataTier ?? "price",
      })
      .select("*")
      .single();
    if (error) throw error;
    return mapExperiment(data);
  }
  async getExperiment(id: string) {
    const { data, error } = await this.db.from("experiments").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return data ? mapExperiment(data) : null;
  }
  async getLatestExperiment() {
    // Only live runs — scenarios must never hijack the home page or the cron.
    const res = await this.db
      .from("experiments")
      .select("*")
      .eq("kind", "live")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (res.error) {
      // Pre-migration fallback: the `kind` column may not exist yet on deploy.
      // Don't break the home page / cron — fall back to the latest row.
      if (/\bkind\b/.test(res.error.message ?? "")) {
        const fb = await this.db
          .from("experiments")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (fb.error) throw fb.error;
        return fb.data ? mapExperiment(fb.data) : null;
      }
      throw res.error;
    }
    return res.data ? mapExperiment(res.data) : null;
  }
  async listExperiments() {
    const { data, error } = await this.db.from("experiments").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapExperiment);
  }
  async updateExperimentStatus(id: string, status: ExperimentStatus) {
    const { error } = await this.db.from("experiments").update({ status }).eq("id", id);
    if (error) throw error;
  }

  async addParticipant(input: NewParticipant): Promise<ParticipantRow> {
    const { data, error } = await this.db
      .from("participants")
      .insert({
        experiment_id: input.experimentId,
        model_id: input.modelId,
        label: input.label,
        kind: input.kind,
        benchmark_ticker: input.benchmarkTicker ?? null,
        starting_cash: input.startingCash,
        cash: input.startingCash,
      })
      .select("*")
      .single();
    if (error) throw error;
    return mapParticipant(data);
  }
  async listParticipants(experimentId: string) {
    const { data, error } = await this.db
      .from("participants")
      .select("*")
      .eq("experiment_id", experimentId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(mapParticipant);
  }
  async getParticipant(id: string) {
    const { data, error } = await this.db.from("participants").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return data ? mapParticipant(data) : null;
  }
  async setParticipantCash(id: string, cash: number) {
    const { error } = await this.db.from("participants").update({ cash }).eq("id", id);
    if (error) throw error;
  }
  async setParticipantSummary(id: string, summary: string, summaryDay: string) {
    const { error } = await this.db
      .from("participants")
      .update({ summary, summary_day: summaryDay })
      .eq("id", id);
    if (error) throw error;
  }

  async hasSnapshot(experimentId: string, tradingDay: string) {
    const { count, error } = await this.db
      .from("price_snapshots")
      .select("id", { count: "exact", head: true })
      .eq("experiment_id", experimentId)
      .eq("trading_day", tradingDay);
    if (error) throw error;
    return (count ?? 0) > 0;
  }
  async saveSnapshot(experimentId: string, tradingDay: string, ticks: TickerSnapshot[], source: string) {
    const rows = ticks.map((t) => ({
      experiment_id: experimentId,
      trading_day: tradingDay,
      ticker: t.ticker,
      open: t.open,
      close: t.close,
      prev_close: t.prevClose,
      pct_change_1d: t.pctChange1d,
      pct_change_5d: t.pctChange5d,
      sma20: t.sma20,
      sma50: t.sma50,
      pct_from_20d_high: t.pctFrom20dHigh,
      // Only the fundamentals tier writes these; omitting the keys keeps the
      // insert compatible with a pre-migration schema (price-only runs).
      ...(t.fundamentals != null ? { fundamentals: t.fundamentals } : {}),
      ...(t.news != null ? { news: t.news } : {}),
      source,
    }));
    const { error } = await this.db
      .from("price_snapshots")
      .upsert(rows, { onConflict: "experiment_id,trading_day,ticker", ignoreDuplicates: true });
    if (error) throw error;
  }
  async getSnapshot(experimentId: string, tradingDay: string): Promise<MarketSnapshot | null> {
    const { data, error } = await this.db
      .from("price_snapshots")
      .select("*")
      .eq("experiment_id", experimentId)
      .eq("trading_day", tradingDay);
    if (error) throw error;
    if (!data || data.length === 0) return null;
    const tickers: Record<string, TickerSnapshot> = {};
    for (const r of data) tickers[r.ticker] = mapTick(r);
    return { tradingDay, tickers };
  }

  async getPositions(participantId: string): Promise<Position[]> {
    const { data, error } = await this.db.from("positions").select("*").eq("participant_id", participantId);
    if (error) throw error;
    return (data ?? []).map((r) => ({
      ticker: r.ticker,
      shares: n(r.shares),
      avgCost: n(r.avg_cost),
      realizedPnl: n(r.realized_pnl),
    }));
  }
  async savePositions(participantId: string, positions: Position[]) {
    if (positions.length === 0) return;
    const rows = positions.map((p) => ({
      participant_id: participantId,
      ticker: p.ticker,
      shares: p.shares,
      avg_cost: p.avgCost,
      realized_pnl: p.realizedPnl,
      updated_at: new Date().toISOString(),
    }));
    const { error } = await this.db.from("positions").upsert(rows, { onConflict: "participant_id,ticker" });
    if (error) throw error;
  }

  async hasDecision(participantId: string, tradingDay: string) {
    const { count, error } = await this.db
      .from("decisions")
      .select("id", { count: "exact", head: true })
      .eq("participant_id", participantId)
      .eq("trading_day", tradingDay);
    if (error) throw error;
    return (count ?? 0) > 0;
  }
  async saveDecision(rec: DecisionRecord): Promise<{ id: string; created: boolean }> {
    const payload = {
      participant_id: rec.participantId,
      experiment_id: rec.experimentId,
      trading_day: rec.tradingDay,
      thesis: rec.thesis,
      confidence: rec.confidence,
      market_outlook: rec.marketOutlook,
      orders_raw: rec.ordersRaw,
      input_tokens: rec.inputTokens,
      output_tokens: rec.outputTokens,
      latency_ms: rec.latencyMs,
      model_id: rec.modelId,
      error: rec.error,
    };
    const { data, error } = await this.db
      .from("decisions")
      .upsert(payload, { onConflict: "participant_id,trading_day", ignoreDuplicates: true })
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (data?.id) return { id: data.id, created: true };
    // Conflict (row already existed): fetch the existing id; we did not insert.
    const existing = await this.db
      .from("decisions")
      .select("id")
      .eq("participant_id", rec.participantId)
      .eq("trading_day", rec.tradingDay)
      .single();
    if (existing.error) throw existing.error;
    return { id: existing.data.id, created: false };
  }
  async recentDecisions(participantId: string, limit: number): Promise<DecisionRecord[]> {
    const { data, error } = await this.db
      .from("decisions")
      .select("*")
      .eq("participant_id", participantId)
      .order("trading_day", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []).map(mapDecision);
  }
  async listDecisions(participantId: string): Promise<DecisionRecord[]> {
    const { data, error } = await this.db
      .from("decisions")
      .select("*")
      .eq("participant_id", participantId)
      .order("trading_day", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapDecision);
  }
  async setDecisionGrade(decisionId: string, score: number, note: string, gradedDay: string) {
    const { error } = await this.db
      .from("decisions")
      .update({ reasoning_score: score, grade_note: note, graded_day: gradedDay })
      .eq("id", decisionId);
    if (error) throw error;
  }

  async saveTrades(trades: TradeRecord[]) {
    if (trades.length === 0) return;
    const rows = trades.map((t) => ({
      participant_id: t.participantId,
      experiment_id: t.experimentId,
      decision_id: t.decisionId,
      trading_day: t.tradingDay,
      ticker: t.ticker,
      side: t.side,
      shares: t.shares,
      fill_price: t.fillPrice,
      notional: t.notional,
      realized_pnl: t.realizedPnl,
    }));
    const { error } = await this.db.from("trades").insert(rows);
    if (error) throw error;
  }
  async saveValidations(vals: ValidationRecord[]) {
    if (vals.length === 0) return;
    const rows = vals.map((v) => ({
      decision_id: v.decisionId,
      participant_id: v.participantId,
      trading_day: v.tradingDay,
      ticker: v.ticker,
      side: v.side,
      requested_notional: v.requestedNotional,
      final_notional: v.finalNotional,
      final_shares: v.finalShares,
      fill_price: v.fillPrice,
      status: v.status,
      reason_code: v.reasonCode,
      note: v.note,
    }));
    const { error } = await this.db.from("order_validations").insert(rows);
    if (error) throw error;
  }
  async listTrades(participantId: string): Promise<TradeRecord[]> {
    const { data, error } = await this.db
      .from("trades")
      .select("*")
      .eq("participant_id", participantId)
      .order("trading_day", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapTrade);
  }

  async hasNav(participantId: string, tradingDay: string) {
    const { count, error } = await this.db
      .from("nav_history")
      .select("id", { count: "exact", head: true })
      .eq("participant_id", participantId)
      .eq("trading_day", tradingDay);
    if (error) throw error;
    return (count ?? 0) > 0;
  }
  async saveNav(rec: NavRecord) {
    const { error } = await this.db.from("nav_history").upsert(
      {
        participant_id: rec.participantId,
        experiment_id: rec.experimentId,
        trading_day: rec.tradingDay,
        nav: rec.nav,
        cash: rec.cash,
        invested_value: rec.investedValue,
        daily_return: rec.dailyReturn,
      },
      { onConflict: "participant_id,trading_day", ignoreDuplicates: true },
    );
    if (error) throw error;
  }
  async latestNav(participantId: string): Promise<NavRecord | null> {
    const { data, error } = await this.db
      .from("nav_history")
      .select("*")
      .eq("participant_id", participantId)
      .order("trading_day", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data ? mapNav(data) : null;
  }
  async listNavHistory(experimentId: string): Promise<NavRecord[]> {
    const { data, error } = await this.db
      .from("nav_history")
      .select("*")
      .eq("experiment_id", experimentId)
      .order("trading_day", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(mapNav);
  }
}

const g = globalThis as unknown as { __meridianSupabaseStore?: SupabaseStore };
export function getSupabaseStore(): SupabaseStore {
  if (!g.__meridianSupabaseStore) g.__meridianSupabaseStore = new SupabaseStore();
  return g.__meridianSupabaseStore;
}
