import Link from "next/link";

import { ParticipantCharts } from "@/components/ParticipantCharts";
import { fmtPct, fmtUsd, signColor } from "@/lib/format";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

// Distinct categorical colors for holdings tickers; Cash gets a neutral gray.
const HOLDING_PALETTE = [
  "#4285f4", "#ea4335", "#fbbc04", "#34a853", "#a142f4", "#00acc1", "#ff6d00",
  "#e52592", "#5e35b1", "#00897b", "#c0ca33", "#8d6e63", "#1e88e5", "#d81b60",
  "#43a047", "#f4511e", "#3949ab", "#6d4c41",
];

const OUTLOOK_COLOR: Record<string, string> = {
  bullish: "text-gain",
  bearish: "text-loss",
  neutral: "text-fg-3",
};

function Delta({ value, dp = 1 }: { value: number; dp?: number }) {
  const up = value >= 0;
  return (
    <span className={`tnum ${up ? "text-gain" : "text-loss"}`}>
      <span className="text-[0.7em]">{up ? "▲" : "▼"}</span> {fmtPct(Math.abs(value), dp)}
    </span>
  );
}

export default async function ParticipantPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const store = getStore();
  const participant = await store.getParticipant(id);
  if (!participant) {
    return (
      <p className="text-sm text-fg-3">
        Participant not found.{" "}
        <Link href="/" className="text-accent hover:underline">
          Back to standings
        </Link>
      </p>
    );
  }

  const [positions, decisions, trades, latest, navHistory] = await Promise.all([
    store.getPositions(id),
    store.listDecisions(id),
    store.listTrades(id),
    store.latestNav(id),
    store.listNavHistory(participant.experimentId),
  ]);

  const open = positions.filter((p) => p.shares > 0);
  const nav = latest?.nav ?? participant.startingCash;
  const ret = participant.startingCash > 0 ? (nav - participant.startingCash) / participant.startingCash : 0;
  const realized = positions.reduce((s, p) => s + p.realizedPnl, 0);

  // This participant's NAV curve, oldest → newest, keyed by label for the chart.
  const navRows = navHistory
    .filter((n) => n.participantId === id)
    .sort((a, b) => a.tradingDay.localeCompare(b.tradingDay));
  const navChart = navRows.map((n) => ({ date: n.tradingDay, [participant.label]: n.nav }));
  const lineColor = participant.kind === "passive" ? "#5f6368" : "#1a73e8";

  // Reconstruct daily holdings allocation from the trade ledger: cumulative
  // shares per ticker through each day, marked at that day's close, plus cash.
  const days = navRows.map((n) => n.tradingDay);
  const snapshots = await Promise.all(days.map((d) => store.getSnapshot(participant.experimentId, d)));
  const tradesAsc = [...trades].sort((a, b) => a.tradingDay.localeCompare(b.tradingDay));
  const heldTickers = Array.from(new Set(trades.map((t) => t.ticker))).sort();
  const holdingsChart = days.map((day, di) => {
    const snap = snapshots[di];
    const row: Record<string, string | number> = { date: day };
    for (const tk of heldTickers) {
      const shares = tradesAsc
        .filter((t) => t.ticker === tk && t.tradingDay <= day)
        .reduce((s, t) => s + (t.side === "buy" ? t.shares : -t.shares), 0);
      const close = snap?.tickers[tk]?.close ?? null;
      if (shares > 1e-9 && close != null) row[tk] = shares * close;
    }
    const cash = navRows[di]?.cash ?? 0;
    if (cash > 0.005) row.Cash = cash;
    return row;
  });
  const holdingsCategories = [...heldTickers, "Cash"];
  const holdingsColors = [...heldTickers.map((_, i) => HOLDING_PALETTE[i % HOLDING_PALETTE.length]), "#cdd2d8"];
  const investedValue = latest?.investedValue ?? Math.max(0, nav - participant.cash);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/" className="text-[13px] text-fg-3 hover:text-accent">
          ← Standings
        </Link>
        <h1 className="mt-2 flex items-center gap-2.5 text-2xl font-medium tracking-tight text-fg">
          {participant.label}
          {participant.kind === "passive" && (
            <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[10px] uppercase tracking-wide text-fg-3">
              index
            </span>
          )}
        </h1>
        <p className="mt-0.5 text-[13px] text-fg-3">
          {participant.kind === "passive" ? `Buy & hold · ${participant.benchmarkTicker ?? ""}` : participant.modelId}
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <span className="text-[34px] font-medium leading-none tnum text-fg">{fmtUsd(nav)}</span>
          <span className="pb-1 text-base">
            <Delta value={ret} />
          </span>
          <span className="pb-1 text-sm text-fg-3">since {fmtUsd(participant.startingCash)} start</span>
        </div>
      </div>

      <div className="flex flex-wrap divide-x divide-border rounded-xl border border-border bg-white">
        <Stat label="Cash" value={fmtUsd(participant.cash)} />
        <Stat label="Realized P&L" value={fmtUsd(realized)} className={signColor(realized)} />
        <Stat label="Open positions" value={String(open.length)} />
        <Stat label="Decisions" value={String(decisions.length)} />
      </div>

      {navChart.length > 1 && (
        <ParticipantCharts
          label={participant.label}
          lineColor={lineColor}
          navData={navChart}
          navValue={fmtUsd(nav)}
          holdingsData={holdingsChart}
          holdingsCategories={holdingsCategories}
          holdingsColors={holdingsColors}
          holdingsValue={fmtUsd(investedValue)}
        />
      )}

      <Panel title="Holdings" count={open.length}>
        {open.length === 0 ? (
          <Empty>Fully in cash.</Empty>
        ) : (
          <Table head={["Ticker", "Shares", "Avg cost", "Realized P&L"]}>
            {open.map((p) => (
              <tr key={p.ticker} className="hover:bg-surface-2">
                <Td className="font-medium text-fg">{p.ticker}</Td>
                <Td right>{p.shares.toFixed(4)}</Td>
                <Td right>{fmtUsd(p.avgCost)}</Td>
                <Td right className={signColor(p.realizedPnl)}>
                  {fmtUsd(p.realizedPnl)}
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>

      <Panel title="Decision journal" count={decisions.length}>
        {decisions.length === 0 ? (
          <Empty>No decisions yet.</Empty>
        ) : (
          <div className="relative px-5 py-4">
            <span className="absolute bottom-5 left-[21px] top-6 w-px bg-border" aria-hidden />
            <ol className="space-y-4">
              {decisions.map((d) => (
                <li key={d.tradingDay} className="relative pl-7">
                  <span
                    className="absolute left-[5px] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-white"
                    style={{ backgroundColor: d.error ? "var(--loss)" : "var(--accent)" }}
                    aria-hidden
                  />
                  <div className="flex flex-wrap items-center gap-2 text-[12px]">
                    <span className="tnum font-medium text-fg-2">{d.tradingDay}</span>
                    {d.marketOutlook && (
                      <span className={`uppercase tracking-wide ${OUTLOOK_COLOR[d.marketOutlook] ?? "text-fg-3"}`}>
                        {d.marketOutlook}
                      </span>
                    )}
                    {d.confidence != null && <span className="text-fg-3">conf {fmtPct(d.confidence, 0)}</span>}
                    {d.error && <span className="rounded bg-loss/10 px-1.5 py-0.5 text-loss">error → held</span>}
                  </div>
                  <p className="mt-1 text-sm leading-relaxed text-fg-2">{d.thesis}</p>
                </li>
              ))}
            </ol>
          </div>
        )}
      </Panel>

      <Panel title="Trades" count={trades.length}>
        {trades.length === 0 ? (
          <Empty>No trades executed.</Empty>
        ) : (
          <Table head={["Day", "Side", "Ticker", "Shares", "Fill", "Notional", "Realized"]}>
            {trades.map((t, i) => (
              <tr key={i} className="hover:bg-surface-2">
                <Td className="tnum text-fg-3">{t.tradingDay}</Td>
                <Td className={`font-medium uppercase ${t.side === "buy" ? "text-gain" : "text-loss"}`}>{t.side}</Td>
                <Td className="font-medium text-fg">{t.ticker}</Td>
                <Td right>{t.shares.toFixed(4)}</Td>
                <Td right>{fmtUsd(t.fillPrice)}</Td>
                <Td right>{fmtUsd(t.notional)}</Td>
                <Td right className={t.realizedPnl != null ? signColor(t.realizedPnl) : "text-fg-muted"}>
                  {t.realizedPnl == null ? "—" : fmtUsd(t.realizedPnl)}
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>
    </div>
  );
}

function Stat({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <div className="flex-1 px-5 py-3.5 first:pl-5">
      <div className="text-xs text-fg-3">{label}</div>
      <div className={`mt-0.5 text-lg tnum text-fg ${className}`}>{value}</div>
    </div>
  );
}

function Panel({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-white">
      <h2 className="flex items-center gap-2 border-b border-border px-5 py-3">
        <span className="text-sm font-medium text-fg">{title}</span>
        {count != null && <span className="text-xs text-fg-3">{count}</span>}
      </h2>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-5 py-7 text-center text-sm text-fg-3">{children}</p>;
}

function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-fg-3">
            {head.map((h, i) => (
              <th key={h} className={`px-4 py-2.5 font-normal first:pl-5 ${i === 0 ? "" : "text-right"}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">{children}</tbody>
      </table>
    </div>
  );
}

function Td({ children, right, className = "" }: { children: React.ReactNode; right?: boolean; className?: string }) {
  return <td className={`px-4 py-2.5 tnum first:pl-5 ${right ? "text-right text-fg-2" : ""} ${className}`}>{children}</td>;
}
