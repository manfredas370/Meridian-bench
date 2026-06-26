import Link from "next/link";

import { ParticipantCharts } from "@/components/ParticipantCharts";
import { TickerBadge } from "@/components/TickerBadge";
import { assignColors } from "@/lib/chart-colors";
import { fmtPct, fmtUsd, signColor } from "@/lib/format";
import { benchmarkReturn, buildLeaderboard } from "@/lib/metrics";
import { confidenceCalibration } from "@/lib/scoring";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

// Clean, medium-saturation categorical palette for the holdings stack — modern
// data-viz tones (AntV/Tableau spirit) that harmonize with the blue accent and
// read crisp on the light canvas. No muddy brown/gray hues. Cash recedes in gray.
const HOLDING_PALETTE = [
  "#5b8ff9", // blue
  "#f59e4e", // orange
  "#e6c14a", // gold
  "#3fc488", // emerald
  "#9a7bd8", // violet
  "#46b8d0", // cyan
  "#ef7aa6", // pink
  "#6f7fe0", // indigo
  "#34b6a8", // teal
  "#c07fd0", // purple
  "#8fc457", // lime
  "#56a9ea", // sky
  "#ee8268", // coral
  "#d98fb8", // rose
  "#5cc47e", // green
  "#d9a93f", // amber
  "#7d88ea", // periwinkle
  "#4bbac0", // turquoise
];

const OUTLOOK: Record<string, { label: string; glyph: string; cls: string; soft: string; dot: string }> = {
  bullish: { label: "Bullish", glyph: "▲", cls: "text-gain", soft: "bg-gain/10", dot: "var(--gain)" },
  bearish: { label: "Bearish", glyph: "▼", cls: "text-loss", soft: "bg-loss/10", dot: "var(--loss)" },
  neutral: { label: "Neutral", glyph: "—", cls: "text-fg-3", soft: "bg-surface-3", dot: "var(--fg-muted)" },
};

/** A compact confidence bar + percentage. */
function ConfMeter({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-1.5" title={`Model confidence ${fmtPct(value, 0)}`}>
      <span className="relative h-1 w-9 overflow-hidden rounded-full bg-surface-3">
        <span className="absolute inset-y-0 left-0 rounded-full bg-fg-3" style={{ width: `${Math.round(value * 100)}%` }} />
      </span>
      <span className="tnum text-[11px] text-fg-3">{fmtPct(value, 0)}</span>
    </span>
  );
}

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

  const [positions, decisions, trades, latest, navHistory, allParticipants] = await Promise.all([
    store.getPositions(id),
    store.listDecisions(id),
    store.listTrades(id),
    store.latestNav(id),
    store.listNavHistory(participant.experimentId),
    store.listParticipants(participant.experimentId),
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

  // Match the color this participant gets on the standings leaderboard/chart
  // (same buildLeaderboard ordering + assignColors mapping).
  const leaderboard = buildLeaderboard(allParticipants, navHistory);
  const leaderColors = assignColors(leaderboard);
  const myIdx = leaderboard.findIndex((r) => r.participant.id === id);
  const lineColor =
    myIdx >= 0 ? leaderColors[myIdx] : participant.kind === "passive" ? "#5f6368" : "#1a73e8";

  // Supporting figures for the analyst-take block.
  const myRow = myIdx >= 0 ? leaderboard[myIdx] : null;
  const spy = benchmarkReturn(leaderboard, "SPY");
  const vsSpy = participant.kind !== "passive" && spy != null && myRow ? myRow.totalReturnPct - spy : null;
  const cashPct = myRow ? myRow.cashPct : nav > 0 ? participant.cash / nav : 0;
  const latestOutlook = decisions[0]?.marketOutlook ?? null;
  const calibration = confidenceCalibration(decisions, navRows);

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
  const holdingsColors = [...heldTickers.map((_, i) => HOLDING_PALETTE[i % HOLDING_PALETTE.length]), "#d6dadf"];
  const investedValue = latest?.investedValue ?? Math.max(0, nav - participant.cash);

  return (
    <div className="space-y-6">
      {/* Color spine ties this page to the model's line on the standings chart. */}
      <div className="flex gap-3.5">
        <span className="mt-1.5 w-1 shrink-0 self-stretch rounded-full" style={{ backgroundColor: lineColor }} />
        <div>
          <h1 className="flex items-center gap-2.5 text-2xl font-medium tracking-tight text-fg">
            {participant.label}
            {participant.kind === "passive" && (
              <span className="rounded bg-surface-3 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-fg-3">
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
      </div>

      <div className="flex flex-wrap divide-x divide-border rounded-xl border border-border-strong bg-white">
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
          <Table
            columns={[
              { label: "Ticker" },
              { label: "Shares", right: true },
              { label: "Avg cost", right: true },
              { label: "Realized P&L", right: true },
            ]}
          >
            {open.map((p) => (
              <tr key={p.ticker} className="hover:bg-surface-2">
                <Td>
                  <TickerBadge ticker={p.ticker} />
                </Td>
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

      {participant.summary && (
        <section className="overflow-hidden rounded-xl border border-border-strong bg-white">
          <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3 sm:px-6">
            <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: lineColor }}>
              Analyst take
            </span>
            {participant.summaryDay && (
              <span className="tnum text-xs text-fg-muted">as of {participant.summaryDay}</span>
            )}
          </div>

          <div className="px-5 py-5 sm:px-6 sm:py-6">
            <p
              className="border-l-2 pl-4 text-[17px] leading-8 text-fg sm:text-[19px] sm:leading-9"
              style={{ borderColor: lineColor }}
            >
              {participant.summary}
            </p>

            {participant.kind !== "passive" && (
              <div className="mt-6 flex flex-wrap items-end gap-x-10 gap-y-4 border-t border-border pt-5">
                <PositioningGauge cashPct={cashPct} outlook={latestOutlook} />
                <Figure label="Return">
                  <Delta value={ret} />
                </Figure>
                {vsSpy != null && (
                  <Figure label="vs SPY">
                    <Delta value={vsSpy} />
                  </Figure>
                )}
                <Figure label="Cash">
                  <span className="text-fg">{fmtPct(cashPct)}</span>
                </Figure>
                {calibration.value != null && (
                  <Figure label="Calibration">
                    <span
                      className="text-fg"
                      title={`Confidence vs. realized daily return (Pearson r, n=${calibration.n})`}
                    >
                      {calibration.label}{" "}
                      <span className="tnum text-fg-3">
                        ({calibration.value >= 0 ? "+" : ""}
                        {calibration.value.toFixed(2)})
                      </span>
                    </span>
                  </Figure>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      <Panel title="Decision journal" count={decisions.length}>
        {decisions.length === 0 ? (
          <Empty>No decisions yet.</Empty>
        ) : (
          <div className="relative px-5 py-5">
            <span className="absolute bottom-6 left-[22px] top-7 w-px bg-border" aria-hidden />
            <ol className="space-y-5">
              {decisions.map((d, i) => {
                const orders = Array.isArray(d.ordersRaw) ? d.ordersRaw : [];
                const acted = orders.length > 0;
                const older = decisions[i + 1];
                const shifted =
                  !!older && !!d.marketOutlook && !!older.marketOutlook && d.marketOutlook !== older.marketOutlook;
                const o = OUTLOOK[d.marketOutlook ?? "neutral"] ?? OUTLOOK.neutral;
                return (
                  <li key={d.tradingDay} className="relative pl-7">
                    <span
                      className="absolute left-[3px] top-1 h-3 w-3 rounded-full ring-4 ring-white"
                      style={{ backgroundColor: d.error ? "var(--loss)" : o.dot }}
                      aria-hidden
                    />
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                      <time className="tnum text-[13px] font-medium text-fg">{d.tradingDay}</time>
                      {d.error ? (
                        <span className="rounded bg-loss/10 px-1.5 py-0.5 text-[11px] font-medium text-loss">
                          Error → held
                        </span>
                      ) : (
                        <span
                          className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium ${o.soft} ${o.cls}`}
                        >
                          <span className="text-[8px] leading-none">{o.glyph}</span>
                          {o.label}
                        </span>
                      )}
                      {shifted && !d.error && (
                        <span className="text-[10px] font-medium uppercase tracking-wider text-accent">shift</span>
                      )}
                      {d.confidence != null && <ConfMeter value={d.confidence} />}
                    </div>

                    {d.thesis && (
                      <p className={`mt-1.5 text-sm leading-relaxed ${acted ? "text-fg-2" : "text-fg-3"}`}>{d.thesis}</p>
                    )}

                    {acted ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {orders.map((ord, j) => (
                          <span
                            key={`${ord.ticker}-${j}`}
                            title={`${ord.side} ${ord.ticker}${ord.notionalUsd ? ` · ${fmtUsd(ord.notionalUsd)}` : ""}`}
                            className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[11px] font-medium ${
                              ord.side === "sell" ? "bg-loss/10 text-loss" : "bg-gain/10 text-gain"
                            }`}
                          >
                            <span className="leading-none">{ord.side === "sell" ? "−" : "+"}</span>
                            {ord.ticker}
                          </span>
                        ))}
                      </div>
                    ) : (
                      !d.error && <div className="mt-1.5 text-[11px] text-fg-muted">Held · no trades</div>
                    )}

                    {d.reasoningScore != null && (
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                        <span
                          className={`rounded bg-surface-3 px-1.5 py-0.5 font-medium tnum ${
                            d.reasoningScore >= 0.7 ? "text-gain" : d.reasoningScore < 0.4 ? "text-loss" : "text-fg-3"
                          }`}
                          title="LLM judge — reasoning quality vs. what actually happened"
                        >
                          reasoning {Math.round(d.reasoningScore * 10)}/10
                        </span>
                        {d.gradeNote && <span className="text-fg-muted">{d.gradeNote}</span>}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>
        )}
      </Panel>

      <Panel title="Trades" count={trades.length}>
        {trades.length === 0 ? (
          <Empty>No trades executed.</Empty>
        ) : (
          <Table
            columns={[
              { label: "Day" },
              { label: "Side" },
              { label: "Ticker" },
              { label: "Shares", right: true },
              { label: "Fill", right: true },
              { label: "Notional", right: true },
              { label: "Realized", right: true },
            ]}
          >
            {trades.map((t, i) => (
              <tr key={i} className="hover:bg-surface-2">
                <Td className="tnum text-fg-3">{t.tradingDay}</Td>
                <Td className={`font-medium uppercase ${t.side === "buy" ? "text-gain" : "text-loss"}`}>{t.side}</Td>
                <Td>
                  <TickerBadge ticker={t.ticker} />
                </Td>
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
    <div className="flex-1 px-5 py-3 first:pl-5">
      <div className="text-[10px] font-medium uppercase tracking-wider text-fg-3">{label}</div>
      <div className={`mt-1 text-[17px] tnum text-fg ${className}`}>{value}</div>
    </div>
  );
}

function Figure({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] font-medium uppercase tracking-wider text-fg-3">{label}</div>
      <div className="mt-1 text-[15px] tnum">{children}</div>
    </div>
  );
}

/** Map a model's cash deployment + outlook to a Fear↔Greed score (cool→warm). */
function positioning(cashPct: number, outlook: string | null | undefined) {
  const invested = Math.max(0, Math.min(1, 1 - cashPct));
  const adj = outlook === "bullish" ? 12 : outlook === "bearish" ? -12 : 0;
  const score = Math.max(3, Math.min(97, Math.round(invested * 100 + adj)));
  const z =
    score < 25
      ? { label: "Extreme fear", color: "#4f7bd6" }
      : score < 45
        ? { label: "Fear", color: "#5f97c9" }
        : score <= 55
          ? { label: "Neutral", color: "#9aa0a6" }
          : score <= 75
            ? { label: "Greed", color: "#dca33f" }
            : { label: "Extreme greed", color: "#e07d3a" };
  return { score, ...z };
}

function PositioningGauge({ cashPct, outlook }: { cashPct: number; outlook: string | null | undefined }) {
  const { score, label, color } = positioning(cashPct, outlook);
  return (
    <div className="min-w-[200px]">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[11px] font-medium uppercase tracking-wider text-fg-3">Sentiment</span>
        <span className="text-[12px] font-semibold uppercase tracking-wide" style={{ color }}>
          {label}
        </span>
      </div>
      {/* Gradient fill: faint → solid in the sentiment color; width = intensity. */}
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-surface-3">
        <div
          className="h-full rounded-full"
          style={{ width: `${score}%`, backgroundImage: `linear-gradient(to right, ${color}0a, ${color})` }}
          aria-hidden
        />
      </div>
    </div>
  );
}

function Panel({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border border-border-strong bg-white">
      <h2 className="flex items-center gap-2 border-b border-border px-5 py-3">
        <span className="text-[10px] font-medium uppercase tracking-wider text-fg-3">{title}</span>
        {count != null && <span className="tnum text-xs text-fg-muted">{count}</span>}
      </h2>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-5 py-7 text-center text-sm text-fg-3">{children}</p>;
}

type Column = { label: string; right?: boolean };

function Table({ columns, children }: { columns: Column[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-fg-3">
            {columns.map((c) => (
              <th key={c.label} className={`px-4 py-2.5 font-medium first:pl-5 ${c.right ? "text-right" : ""}`}>
                {c.label}
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
