// Read-only Store over the bundled archive of a concluded arena.
//
// data/archive.json is a full dump of the production record (written by
// scripts/export-archive.ts), bundled into the build via a static JSON import
// so the deployed site serves the finished experiment with no live database —
// a paused/deleted Supabase project can never take the pages down again.
//
// To run a NEW live experiment, empty data/archive.json (an empty {} disables
// this store) and configure Supabase as before.

import archiveJson from "@/data/archive.json";

import type { MarketSnapshot, Position } from "@/lib/types";
import type {
  DecisionRecord,
  ExperimentRow,
  NavRecord,
  ParticipantRow,
  Store,
  TradeRecord,
  ValidationRecord,
} from "@/lib/store/types";

interface ArchiveState {
  experiments: ExperimentRow[];
  participants: ParticipantRow[];
  snapshots: Record<string, MarketSnapshot>;
  positions: Record<string, Position[]>;
  decisions: DecisionRecord[];
  trades: TradeRecord[];
  validations: ValidationRecord[];
  navs: NavRecord[];
}

const state = archiveJson as unknown as Partial<ArchiveState>;

export function archiveHasData(): boolean {
  return (state.experiments?.length ?? 0) > 0;
}

function readOnly(): never {
  throw new Error(
    "The archive store is read-only (serving data/archive.json). To run a new experiment, empty data/archive.json and use the Supabase/file store.",
  );
}

export class ArchiveStore implements Store {
  private s = {
    experiments: state.experiments ?? [],
    participants: state.participants ?? [],
    snapshots: state.snapshots ?? {},
    positions: state.positions ?? {},
    decisions: state.decisions ?? [],
    trades: state.trades ?? [],
    navs: state.navs ?? [],
  };

  // -- experiments (exported in created_at DESC order) --
  async getExperiment(id: string) {
    return this.s.experiments.find((e) => e.id === id) ?? null;
  }
  async getLatestExperiment() {
    // Only live runs — scenarios must never hijack the home page or the cron.
    return this.s.experiments.find((e) => e.kind === "live") ?? null;
  }
  async listExperiments() {
    return [...this.s.experiments];
  }

  // -- participants --
  async listParticipants(experimentId: string) {
    return this.s.participants.filter((p) => p.experimentId === experimentId);
  }
  async getParticipant(id: string) {
    return this.s.participants.find((p) => p.id === id) ?? null;
  }

  // -- shared price snapshots --
  async hasSnapshot(experimentId: string, tradingDay: string) {
    return `${experimentId}:${tradingDay}` in this.s.snapshots;
  }
  async getSnapshot(experimentId: string, tradingDay: string) {
    return this.s.snapshots[`${experimentId}:${tradingDay}`] ?? null;
  }

  // -- positions --
  async getPositions(participantId: string) {
    return this.s.positions[participantId] ?? [];
  }

  // -- decisions --
  async hasDecision(participantId: string, tradingDay: string) {
    return this.s.decisions.some((d) => d.participantId === participantId && d.tradingDay === tradingDay);
  }
  async listDecisions(participantId: string) {
    return this.s.decisions
      .filter((d) => d.participantId === participantId)
      .sort((a, b) => b.tradingDay.localeCompare(a.tradingDay));
  }
  async recentDecisions(participantId: string, limit: number) {
    return (await this.listDecisions(participantId)).slice(0, limit);
  }

  // -- trades --
  async listTrades(participantId: string) {
    return this.s.trades
      .filter((t) => t.participantId === participantId)
      .sort((a, b) => b.tradingDay.localeCompare(a.tradingDay));
  }

  // -- NAV / equity curve --
  async hasNav(participantId: string, tradingDay: string) {
    return this.s.navs.some((n) => n.participantId === participantId && n.tradingDay === tradingDay);
  }
  async latestNav(participantId: string) {
    return (
      this.s.navs
        .filter((n) => n.participantId === participantId)
        .sort((a, b) => b.tradingDay.localeCompare(a.tradingDay))[0] ?? null
    );
  }
  async listNavHistory(experimentId: string) {
    return this.s.navs
      .filter((n) => n.experimentId === experimentId)
      .sort((a, b) => a.tradingDay.localeCompare(b.tradingDay));
  }

  // -- writes: the arena is concluded; nothing may mutate the archive --
  async createExperiment(): Promise<ExperimentRow> {
    return readOnly();
  }
  async updateExperimentStatus() {
    return readOnly();
  }
  async addParticipant(): Promise<ParticipantRow> {
    return readOnly();
  }
  async setParticipantCash() {
    return readOnly();
  }
  async setParticipantSummary() {
    return readOnly();
  }
  async saveSnapshot() {
    return readOnly();
  }
  async savePositions() {
    return readOnly();
  }
  async saveDecision(): Promise<{ id: string; created: boolean }> {
    return readOnly();
  }
  async setDecisionGrade() {
    return readOnly();
  }
  async saveTrades() {
    return readOnly();
  }
  async saveValidations() {
    return readOnly();
  }
  async saveNav() {
    return readOnly();
  }
}

const g = globalThis as unknown as { __meridianArchiveStore?: ArchiveStore };
export function getArchiveStore(): ArchiveStore {
  if (!g.__meridianArchiveStore) g.__meridianArchiveStore = new ArchiveStore();
  return g.__meridianArchiveStore;
}
