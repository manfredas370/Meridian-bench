// In-memory Store implementation.
//
// Used by unit tests and as a zero-config local demo backend (state lives in
// the Node process, so it survives across route invocations within one
// `next dev` session but not across restarts). Mirrors the Supabase unique
// constraints: saveDecision/saveNav are no-ops when a row already exists.

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

export class MemoryStore implements Store {
  private experiments: ExperimentRow[] = [];
  private participants = new Map<string, ParticipantRow>();
  private snapshots = new Map<string, MarketSnapshot>();
  private positions = new Map<string, Position[]>();
  private decisions: DecisionRecord[] = [];
  private trades: TradeRecord[] = [];
  private validations: ValidationRecord[] = [];
  private navs: NavRecord[] = [];

  private key(experimentId: string, tradingDay: string) {
    return `${experimentId}:${tradingDay}`;
  }

  async createExperiment(input: NewExperiment): Promise<ExperimentRow> {
    const row: ExperimentRow = {
      id: crypto.randomUUID(),
      status: "running",
      startDate: null,
      endDate: null,
      cadence: "daily",
      ...input,
    };
    this.experiments.push(row);
    return row;
  }
  async getExperiment(id: string) {
    return this.experiments.find((e) => e.id === id) ?? null;
  }
  async getLatestExperiment() {
    return this.experiments.at(-1) ?? null;
  }
  async listExperiments() {
    return [...this.experiments];
  }
  async updateExperimentStatus(id: string, status: ExperimentStatus) {
    const e = this.experiments.find((x) => x.id === id);
    if (e) e.status = status;
  }

  async addParticipant(input: NewParticipant): Promise<ParticipantRow> {
    const row: ParticipantRow = {
      id: crypto.randomUUID(),
      experimentId: input.experimentId,
      modelId: input.modelId,
      label: input.label,
      kind: input.kind,
      benchmarkTicker: input.benchmarkTicker ?? null,
      startingCash: input.startingCash,
      cash: input.startingCash,
      status: "active",
    };
    this.participants.set(row.id, row);
    return row;
  }
  async listParticipants(experimentId: string) {
    return [...this.participants.values()].filter((p) => p.experimentId === experimentId);
  }
  async getParticipant(id: string) {
    return this.participants.get(id) ?? null;
  }
  async setParticipantCash(id: string, cash: number) {
    const p = this.participants.get(id);
    if (p) p.cash = cash;
  }

  async hasSnapshot(experimentId: string, tradingDay: string) {
    return this.snapshots.has(this.key(experimentId, tradingDay));
  }
  async saveSnapshot(
    experimentId: string,
    tradingDay: string,
    ticks: TickerSnapshot[],
    _source: string,
  ) {
    const tickers: Record<string, TickerSnapshot> = {};
    for (const t of ticks) tickers[t.ticker] = t;
    this.snapshots.set(this.key(experimentId, tradingDay), { tradingDay, tickers });
  }
  async getSnapshot(experimentId: string, tradingDay: string) {
    return this.snapshots.get(this.key(experimentId, tradingDay)) ?? null;
  }

  async getPositions(participantId: string) {
    return (this.positions.get(participantId) ?? []).map((p) => ({ ...p }));
  }
  async savePositions(participantId: string, positions: Position[]) {
    this.positions.set(
      participantId,
      positions.map((p) => ({ ...p })),
    );
  }

  async hasDecision(participantId: string, tradingDay: string) {
    return this.decisions.some(
      (d) => d.participantId === participantId && d.tradingDay === tradingDay,
    );
  }
  async saveDecision(rec: DecisionRecord): Promise<{ id: string; created: boolean }> {
    const existing = this.decisions.find(
      (d) => d.participantId === rec.participantId && d.tradingDay === rec.tradingDay,
    );
    if (existing) return { id: existing.id!, created: false };
    const id = crypto.randomUUID();
    this.decisions.push({ ...rec, id });
    return { id, created: true };
  }
  async recentDecisions(participantId: string, limit: number) {
    return (await this.listDecisions(participantId)).slice(0, limit);
  }
  async listDecisions(participantId: string) {
    return this.decisions
      .filter((d) => d.participantId === participantId)
      .sort((a, b) => b.tradingDay.localeCompare(a.tradingDay));
  }

  async saveTrades(trades: TradeRecord[]) {
    this.trades.push(...trades);
  }
  async saveValidations(vals: ValidationRecord[]) {
    this.validations.push(...vals);
  }
  async listTrades(participantId: string) {
    return this.trades
      .filter((t) => t.participantId === participantId)
      .sort((a, b) => b.tradingDay.localeCompare(a.tradingDay));
  }

  async hasNav(participantId: string, tradingDay: string) {
    return this.navs.some(
      (n) => n.participantId === participantId && n.tradingDay === tradingDay,
    );
  }
  async saveNav(rec: NavRecord) {
    if (await this.hasNav(rec.participantId, rec.tradingDay)) return;
    this.navs.push(rec);
  }
  async latestNav(participantId: string) {
    return (
      this.navs
        .filter((n) => n.participantId === participantId)
        .sort((a, b) => b.tradingDay.localeCompare(a.tradingDay))[0] ?? null
    );
  }
  async listNavHistory(experimentId: string) {
    return this.navs
      .filter((n) => n.experimentId === experimentId)
      .sort((a, b) => a.tradingDay.localeCompare(b.tradingDay));
  }
}

// Persist a single instance across HMR reloads in dev.
const g = globalThis as unknown as { __meridianMemoryStore?: MemoryStore };
export function getMemoryStore(): MemoryStore {
  if (!g.__meridianMemoryStore) g.__meridianMemoryStore = new MemoryStore();
  return g.__meridianMemoryStore;
}
