import Link from "next/link";

import { fmtPct, fmtPctSigned, fmtUsd, signColor } from "@/lib/format";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function ParticipantPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const store = getStore();
  const participant = await store.getParticipant(id);
  if (!participant) {
    return (
      <p className="text-sm text-zinc-500">
        Participant not found.{" "}
        <Link href="/" className="underline">
          Back to leaderboard
        </Link>
      </p>
    );
  }

  const [positions, decisions, trades, latest] = await Promise.all([
    store.getPositions(id),
    store.listDecisions(id),
    store.listTrades(id),
    store.latestNav(id),
  ]);

  const open = positions.filter((p) => p.shares > 0);
  const nav = latest?.nav ?? participant.startingCash;
  const ret = participant.startingCash > 0 ? (nav - participant.startingCash) / participant.startingCash : 0;
  const realized = positions.reduce((s, p) => s + p.realizedPnl, 0);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/" className="text-sm text-zinc-500 hover:underline">
          ← Leaderboard
        </Link>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight">
          {participant.label}
          {participant.kind === "passive" && (
            <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] uppercase text-zinc-500 dark:bg-zinc-800">
              control
            </span>
          )}
        </h1>
        <p className="font-mono text-xs text-zinc-500">{participant.modelId}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="NAV" value={fmtUsd(nav)} />
        <Stat label="Total return" value={fmtPctSigned(ret)} className={signColor(ret)} />
        <Stat label="Cash" value={fmtUsd(participant.cash)} />
        <Stat label="Realized P&L" value={fmtUsd(realized)} className={signColor(realized)} />
      </div>

      <Panel title={`Holdings (${open.length})`}>
        {open.length === 0 ? (
          <Empty>Fully in cash.</Empty>
        ) : (
          <Table head={["Ticker", "Shares", "Avg cost", "Realized P&L"]}>
            {open.map((p) => (
              <tr key={p.ticker}>
                <Td className="font-medium">{p.ticker}</Td>
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

      <Panel title={`Decision journal (${decisions.length})`}>
        {decisions.length === 0 ? (
          <Empty>No decisions yet.</Empty>
        ) : (
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-900">
            {decisions.map((d) => (
              <li key={`${d.tradingDay}`} className="px-4 py-3">
                <div className="flex items-center gap-2 text-xs text-zinc-500">
                  <span className="font-mono">{d.tradingDay}</span>
                  {d.marketOutlook && <span className="rounded bg-zinc-100 px-1.5 py-0.5 dark:bg-zinc-800">{d.marketOutlook}</span>}
                  {d.confidence != null && <span>conf {fmtPct(d.confidence, 0)}</span>}
                  {d.error && <span className="rounded bg-rose-100 px-1.5 py-0.5 text-rose-700 dark:bg-rose-950 dark:text-rose-300">error → held</span>}
                </div>
                <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">{d.thesis}</p>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title={`Trades (${trades.length})`}>
        {trades.length === 0 ? (
          <Empty>No trades executed.</Empty>
        ) : (
          <Table head={["Day", "Side", "Ticker", "Shares", "Fill", "Notional", "Realized"]}>
            {trades.map((t, i) => (
              <tr key={i}>
                <Td className="font-mono text-xs">{t.tradingDay}</Td>
                <Td className={t.side === "buy" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}>
                  {t.side}
                </Td>
                <Td className="font-medium">{t.ticker}</Td>
                <Td right>{t.shares.toFixed(4)}</Td>
                <Td right>{fmtUsd(t.fillPrice)}</Td>
                <Td right>{fmtUsd(t.notional)}</Td>
                <Td right className={t.realizedPnl != null ? signColor(t.realizedPnl) : ""}>
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
    <div className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className={`mt-1 text-lg font-semibold tabular-nums ${className}`}>{value}</div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
      <h2 className="border-b border-zinc-200 bg-zinc-50 px-4 py-2 text-sm font-medium dark:border-zinc-800 dark:bg-zinc-900">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-6 text-center text-sm text-zinc-500">{children}</p>;
}

function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-wide text-zinc-500">
          <tr>
            {head.map((h, i) => (
              <th key={h} className={`px-4 py-2 font-medium ${i === 0 ? "" : "text-right"}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">{children}</tbody>
      </table>
    </div>
  );
}

function Td({
  children,
  right,
  className = "",
}: {
  children: React.ReactNode;
  right?: boolean;
  className?: string;
}) {
  return <td className={`px-4 py-2 tabular-nums ${right ? "text-right" : ""} ${className}`}>{children}</td>;
}
