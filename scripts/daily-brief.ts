// Dumps the data for a daily executive brief of the live arena as JSON:
// latest trading day, per-participant standings + that day's decision, the
// per-ticker market moves, and the SPY return. Read-only.
//   node --env-file-if-exists=.env.local --import tsx scripts/daily-brief.ts

import { benchmarkReturn, buildLeaderboard } from "@/lib/metrics";
import { getStore } from "@/lib/store";

async function main() {
  const store = getStore();
  const exp = await store.getLatestExperiment();
  if (!exp) {
    console.log(JSON.stringify({ error: "no live experiment found" }));
    return;
  }

  const [participants, navs] = await Promise.all([
    store.listParticipants(exp.id),
    store.listNavHistory(exp.id),
  ]);
  const days = Array.from(new Set(navs.map((n) => n.tradingDay))).sort();
  const latest = days.at(-1) ?? null;
  const previous = days.at(-2) ?? null;

  const rows = buildLeaderboard(participants, navs);
  const spy = benchmarkReturn(rows, "SPY");

  const snap = latest ? await store.getSnapshot(exp.id, latest) : null;
  const market = snap
    ? Object.values(snap.tickers)
        .map((t) => ({ ticker: t.ticker, close: t.close, pct1d: t.pctChange1d, pct5d: t.pctChange5d }))
        .sort((a, b) => (b.pct1d ?? 0) - (a.pct1d ?? 0))
    : [];

  const standings = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const decisions = await store.listDecisions(r.participant.id);
    const d = latest ? decisions.find((x) => x.tradingDay === latest) : null;
    const navRec = navs.find((n) => n.participantId === r.participant.id && n.tradingDay === latest);
    standings.push({
      rank: i + 1,
      model: r.participant.label,
      kind: r.participant.kind,
      totalReturnPct: r.totalReturnPct,
      nav: r.latestNav,
      maxDrawdownPct: r.maxDrawdownPct,
      cashPct: r.cashPct,
      vsSpyPct: spy != null && r.participant.kind !== "passive" ? r.totalReturnPct - spy : null,
      dayReturnPct: navRec?.dailyReturn ?? null,
      decision: d
        ? {
            outlook: d.marketOutlook,
            confidence: d.confidence,
            thesis: d.thesis,
            error: d.error,
            orders: (Array.isArray(d.ordersRaw) ? d.ordersRaw : []).map((o) => ({
              side: o.side,
              ticker: o.ticker,
              notionalUsd: o.notionalUsd,
            })),
          }
        : null,
    });
  }

  console.log(
    JSON.stringify(
      {
        experiment: { name: exp.name, window: [exp.startDate, exp.endDate] },
        latestTradingDay: latest,
        previousTradingDay: previous,
        tradingDaysCount: days.length,
        spyReturnPct: spy,
        standings,
        market,
      },
      null,
      2,
    ),
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
