// Persistence abstraction. The engine depends on this interface, not on
// Supabase, so it can run against an in-memory store in tests and local demos
// and against Supabase in production. Idempotency contract: `hasDecision` and
// `hasNav` let the engine make the daily step exactly-once per participant.

import type { DecisionOutput } from "@/lib/decision-schema";
import type {
  MarketOutlook,
  MarketSnapshot,
  ModelParams,
  ParticipantKind,
  Position,
  Rules,
  Side,
  TickerSnapshot,
  OrderReasonCode,
  OrderStatus,
} from "@/lib/types";

export type ExperimentStatus = "draft" | "running" | "completed" | "aborted";

/** 'live' = a real cron-driven run; 'scenario' = a synthetic-shock sandbox. */
export type ExperimentKind = "live" | "scenario";

/** Metadata for a scenario experiment, used to render its banner. */
export interface ScenarioMeta {
  presetId: string;
  presetLabel: string;
  description: string;
  anchorDay: string; // the live-run day the fork was taken from
}

export interface ExperimentRow {
  id: string;
  name: string;
  status: ExperimentStatus;
  startDate: string | null;
  endDate: string | null;
  cadence: string;
  startingCash: number;
  universe: string[];
  benchmarkTickers: string[];
  rules: Rules;
  modelParams: ModelParams;
  promptTemplate: string;
  promptTemplateHash: string;
  kind: ExperimentKind;
  parentExperimentId: string | null;
  scenario: ScenarioMeta | null;
}

export interface NewExperiment {
  name: string;
  status?: ExperimentStatus;
  startDate?: string | null;
  endDate?: string | null;
  cadence?: string;
  startingCash: number;
  universe: string[];
  benchmarkTickers: string[];
  rules: Rules;
  modelParams: ModelParams;
  promptTemplate: string;
  promptTemplateHash: string;
  kind?: ExperimentKind;
  parentExperimentId?: string | null;
  scenario?: ScenarioMeta | null;
}

export interface ParticipantRow {
  id: string;
  experimentId: string;
  modelId: string;
  label: string;
  kind: ParticipantKind;
  benchmarkTicker: string | null;
  startingCash: number;
  cash: number;
  status: string;
  summary: string | null;
  summaryDay: string | null;
}

export interface NewParticipant {
  experimentId: string;
  modelId: string;
  label: string;
  kind: ParticipantKind;
  benchmarkTicker?: string | null;
  startingCash: number;
}

export interface DecisionRecord {
  id?: string;
  participantId: string;
  experimentId: string;
  tradingDay: string;
  thesis: string | null;
  confidence: number | null;
  marketOutlook: MarketOutlook | null;
  ordersRaw: DecisionOutput["orders"];
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number | null;
  modelId: string | null;
  error: string | null;
}

export interface TradeRecord {
  participantId: string;
  experimentId: string;
  decisionId: string;
  tradingDay: string;
  ticker: string;
  side: Side;
  shares: number;
  fillPrice: number;
  notional: number;
  realizedPnl: number | null;
}

export interface ValidationRecord {
  decisionId: string;
  participantId: string;
  tradingDay: string;
  ticker: string;
  side: Side;
  requestedNotional: number;
  finalNotional: number;
  finalShares: number;
  fillPrice: number | null;
  status: OrderStatus;
  reasonCode: OrderReasonCode | null;
  note: string;
}

export interface NavRecord {
  participantId: string;
  experimentId: string;
  tradingDay: string;
  nav: number;
  cash: number;
  investedValue: number;
  dailyReturn: number | null;
}

export interface Store {
  // experiments
  createExperiment(input: NewExperiment): Promise<ExperimentRow>;
  getExperiment(id: string): Promise<ExperimentRow | null>;
  getLatestExperiment(): Promise<ExperimentRow | null>;
  listExperiments(): Promise<ExperimentRow[]>;
  updateExperimentStatus(id: string, status: ExperimentStatus): Promise<void>;

  // participants
  addParticipant(input: NewParticipant): Promise<ParticipantRow>;
  listParticipants(experimentId: string): Promise<ParticipantRow[]>;
  getParticipant(id: string): Promise<ParticipantRow | null>;
  setParticipantCash(id: string, cash: number): Promise<void>;
  setParticipantSummary(id: string, summary: string, summaryDay: string): Promise<void>;

  // shared price snapshot (one per experiment-day)
  hasSnapshot(experimentId: string, tradingDay: string): Promise<boolean>;
  saveSnapshot(
    experimentId: string,
    tradingDay: string,
    ticks: TickerSnapshot[],
    source: string,
  ): Promise<void>;
  getSnapshot(experimentId: string, tradingDay: string): Promise<MarketSnapshot | null>;

  // positions
  getPositions(participantId: string): Promise<Position[]>;
  savePositions(participantId: string, positions: Position[]): Promise<void>;

  // decisions / idempotency
  hasDecision(participantId: string, tradingDay: string): Promise<boolean>;
  /** Insert the decision iff none exists for (participant, day). `created`
   *  reports whether THIS call inserted it — the exactly-once execute guard. */
  saveDecision(rec: DecisionRecord): Promise<{ id: string; created: boolean }>;
  recentDecisions(participantId: string, limit: number): Promise<DecisionRecord[]>;
  listDecisions(participantId: string): Promise<DecisionRecord[]>;

  // trades + referee results
  saveTrades(trades: TradeRecord[]): Promise<void>;
  saveValidations(vals: ValidationRecord[]): Promise<void>;
  listTrades(participantId: string): Promise<TradeRecord[]>;

  // NAV / equity curve
  hasNav(participantId: string, tradingDay: string): Promise<boolean>;
  saveNav(rec: NavRecord): Promise<void>;
  latestNav(participantId: string): Promise<NavRecord | null>;
  listNavHistory(experimentId: string): Promise<NavRecord[]>;
}
