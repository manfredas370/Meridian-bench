// Leaderboard / equity-curve metrics, computed purely from nav_history +
// participant cash. Alpha metrics only: total return, max drawdown, cash %,
// and beat-the-benchmark. (Sharpe/win-rate are deferred — see the plan.)

import type { NavRecord, ParticipantRow } from "@/lib/store/types";

export interface NavPoint {
  day: string;
  nav: number;
}

export interface LeaderRow {
  participant: ParticipantRow;
  startNav: number;
  latestNav: number;
  totalReturnPct: number; // fraction (0.05 = +5%)
  maxDrawdownPct: number; // fraction, non-negative
  cashPct: number; // fraction of latest NAV held in cash
  points: NavPoint[];
}

export function buildLeaderboard(
  participants: ParticipantRow[],
  navHistory: NavRecord[],
): LeaderRow[] {
  const byParticipant = new Map<string, NavRecord[]>();
  for (const n of navHistory) {
    const arr = byParticipant.get(n.participantId) ?? [];
    arr.push(n);
    byParticipant.set(n.participantId, arr);
  }

  const rows = participants.map<LeaderRow>((participant) => {
    const points = (byParticipant.get(participant.id) ?? [])
      .slice()
      .sort((a, b) => a.tradingDay.localeCompare(b.tradingDay))
      .map((n) => ({ day: n.tradingDay, nav: n.nav }));

    const startNav = participant.startingCash;
    const latestNav = points.at(-1)?.nav ?? startNav;
    const totalReturnPct = startNav > 0 ? (latestNav - startNav) / startNav : 0;

    let peak = startNav;
    let maxDrawdownPct = 0;
    for (const p of points) {
      if (p.nav > peak) peak = p.nav;
      if (peak > 0) maxDrawdownPct = Math.max(maxDrawdownPct, (peak - p.nav) / peak);
    }

    return {
      participant,
      startNav,
      latestNav,
      totalReturnPct,
      maxDrawdownPct,
      cashPct: latestNav > 0 ? participant.cash / latestNav : 0,
      points,
    };
  });

  return rows.sort((a, b) => b.totalReturnPct - a.totalReturnPct);
}

/** Total return of the passive control holding `ticker`, if present. */
export function benchmarkReturn(rows: LeaderRow[], ticker: string): number | null {
  const r = rows.find(
    (x) => x.participant.kind === "passive" && x.participant.benchmarkTicker === ticker,
  );
  return r ? r.totalReturnPct : null;
}

export function tradingDayCount(rows: LeaderRow[]): number {
  const days = new Set<string>();
  for (const r of rows) for (const p of r.points) days.add(p.day);
  return days.size;
}
