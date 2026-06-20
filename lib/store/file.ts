// File-backed Store for local/demo use. Reads+writes a JSON file on every
// operation, so state is shared across Next's separate server-component and
// route-handler module graphs (a process-global singleton is NOT, under
// Turbopack dev). Tiny data volumes → sync fs is fine. Production uses Supabase.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

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

interface State {
  experiments: ExperimentRow[];
  participants: ParticipantRow[];
  snapshots: Record<string, MarketSnapshot>;
  positions: Record<string, Position[]>;
  decisions: DecisionRecord[];
  trades: TradeRecord[];
  validations: ValidationRecord[];
  navs: NavRecord[];
}

function blank(): State {
  return {
    experiments: [],
    participants: [],
    snapshots: {},
    positions: {},
    decisions: [],
    trades: [],
    validations: [],
    navs: [],
  };
}

export class FileStore implements Store {
  private path: string;
  constructor(path?: string) {
    this.path = resolve(path ?? process.env.DATA_FILE ?? ".data/meridian.json");
  }
  private load(): State {
    try {
      return { ...blank(), ...JSON.parse(readFileSync(this.path, "utf8")) };
    } catch {
      return blank();
    }
  }
  private save(s: State) {
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path, JSON.stringify(s));
  }
  private key(e: string, d: string) {
    return `${e}:${d}`;
  }

  async createExperiment(input: NewExperiment): Promise<ExperimentRow> {
    const s = this.load();
    const row: ExperimentRow = {
      id: crypto.randomUUID(),
      status: "running",
      startDate: null,
      endDate: null,
      cadence: "daily",
      kind: "live",
      parentExperimentId: null,
      scenario: null,
      ...input,
    };
    s.experiments.push(row);
    this.save(s);
    return row;
  }
  async getExperiment(id: string) {
    return this.load().experiments.find((e) => e.id === id) ?? null;
  }
  async getLatestExperiment() {
    // Only live runs — scenarios must never hijack the home page or the cron.
    return this.load().experiments.filter((e) => e.kind !== "scenario").at(-1) ?? null;
  }
  async listExperiments() {
    return this.load().experiments;
  }
  async updateExperimentStatus(id: string, status: ExperimentStatus) {
    const s = this.load();
    const e = s.experiments.find((x) => x.id === id);
    if (e) {
      e.status = status;
      this.save(s);
    }
  }

  async addParticipant(input: NewParticipant): Promise<ParticipantRow> {
    const s = this.load();
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
    s.participants.push(row);
    this.save(s);
    return row;
  }
  async listParticipants(experimentId: string) {
    return this.load().participants.filter((p) => p.experimentId === experimentId);
  }
  async getParticipant(id: string) {
    return this.load().participants.find((p) => p.id === id) ?? null;
  }
  async setParticipantCash(id: string, cash: number) {
    const s = this.load();
    const p = s.participants.find((x) => x.id === id);
    if (p) {
      p.cash = cash;
      this.save(s);
    }
  }

  async hasSnapshot(experimentId: string, tradingDay: string) {
    return this.key(experimentId, tradingDay) in this.load().snapshots;
  }
  async saveSnapshot(experimentId: string, tradingDay: string, ticks: TickerSnapshot[], _source: string) {
    const s = this.load();
    const tickers: Record<string, TickerSnapshot> = {};
    for (const t of ticks) tickers[t.ticker] = t;
    s.snapshots[this.key(experimentId, tradingDay)] = { tradingDay, tickers };
    this.save(s);
  }
  async getSnapshot(experimentId: string, tradingDay: string) {
    return this.load().snapshots[this.key(experimentId, tradingDay)] ?? null;
  }

  async getPositions(participantId: string) {
    return this.load().positions[participantId] ?? [];
  }
  async savePositions(participantId: string, positions: Position[]) {
    const s = this.load();
    s.positions[participantId] = positions;
    this.save(s);
  }

  async hasDecision(participantId: string, tradingDay: string) {
    return this.load().decisions.some(
      (d) => d.participantId === participantId && d.tradingDay === tradingDay,
    );
  }
  async saveDecision(rec: DecisionRecord): Promise<{ id: string; created: boolean }> {
    const s = this.load();
    const existing = s.decisions.find(
      (d) => d.participantId === rec.participantId && d.tradingDay === rec.tradingDay,
    );
    if (existing) return { id: existing.id!, created: false };
    const id = crypto.randomUUID();
    s.decisions.push({ ...rec, id });
    this.save(s);
    return { id, created: true };
  }
  async recentDecisions(participantId: string, limit: number) {
    return (await this.listDecisions(participantId)).slice(0, limit);
  }
  async listDecisions(participantId: string) {
    return this.load()
      .decisions.filter((d) => d.participantId === participantId)
      .sort((a, b) => b.tradingDay.localeCompare(a.tradingDay));
  }

  async saveTrades(trades: TradeRecord[]) {
    if (trades.length === 0) return;
    const s = this.load();
    s.trades.push(...trades);
    this.save(s);
  }
  async saveValidations(vals: ValidationRecord[]) {
    if (vals.length === 0) return;
    const s = this.load();
    s.validations.push(...vals);
    this.save(s);
  }
  async listTrades(participantId: string) {
    return this.load()
      .trades.filter((t) => t.participantId === participantId)
      .sort((a, b) => b.tradingDay.localeCompare(a.tradingDay));
  }

  async hasNav(participantId: string, tradingDay: string) {
    return this.load().navs.some(
      (n) => n.participantId === participantId && n.tradingDay === tradingDay,
    );
  }
  async saveNav(rec: NavRecord) {
    const s = this.load();
    if (s.navs.some((n) => n.participantId === rec.participantId && n.tradingDay === rec.tradingDay)) return;
    s.navs.push(rec);
    this.save(s);
  }
  async latestNav(participantId: string) {
    return (
      this.load()
        .navs.filter((n) => n.participantId === participantId)
        .sort((a, b) => b.tradingDay.localeCompare(a.tradingDay))[0] ?? null
    );
  }
  async listNavHistory(experimentId: string) {
    return this.load()
      .navs.filter((n) => n.experimentId === experimentId)
      .sort((a, b) => a.tradingDay.localeCompare(b.tradingDay));
  }
}

export function getFileStore(): FileStore {
  return new FileStore();
}
