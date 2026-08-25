// One-off exporter: dumps the entire Supabase production record into
// data/archive.json (FileStore `State` shape, camelCase) so the site can serve
// the concluded experiment without a live database. Read-only against Supabase.
//   node --env-file-if-exists=.env.local --import tsx scripts/export-archive.ts

import { mkdirSync, writeFileSync } from "node:fs";

import { createClient } from "@supabase/supabase-js";

import { getSupabaseStore } from "@/lib/store/supabase";
import type { ValidationRecord } from "@/lib/store/types";

async function main() {
  const store = getSupabaseStore();
  const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  const experiments = await store.listExperiments(); // created_at DESC — archive keeps this order
  const participants = [];
  const decisions = [];
  const trades = [];
  const navs = [];
  const snapshots: Record<string, unknown> = {};
  const positions: Record<string, unknown> = {};

  for (const exp of experiments) {
    const parts = await store.listParticipants(exp.id);
    participants.push(...parts);
    navs.push(...(await store.listNavHistory(exp.id)));

    // Snapshot days can exceed NAV days (a snapshot is written before stepping),
    // so enumerate them from the table itself.
    const { data: dayRows, error } = await db
      .from("price_snapshots")
      .select("trading_day")
      .eq("experiment_id", exp.id);
    if (error) throw error;
    const days = [...new Set((dayRows ?? []).map((r) => r.trading_day as string))].sort();
    for (const day of days) {
      const snap = await store.getSnapshot(exp.id, day);
      if (snap) snapshots[`${exp.id}:${day}`] = snap;
    }

    for (const p of parts) {
      decisions.push(...(await store.listDecisions(p.id)));
      trades.push(...(await store.listTrades(p.id)));
      positions[p.id] = await store.getPositions(p.id);
    }
    console.log(`exported ${exp.name} (${exp.dataTier}, ${exp.status}): ${parts.length} participants, ${days.length} snapshot days`);
  }

  // Nothing in the UI reads order_validations, but archive them for completeness.
  const validations: ValidationRecord[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("order_validations").select("*").range(from, from + 999);
    if (error) throw error;
    if (!data || data.length === 0) break;
    validations.push(
      ...data.map((v) => ({
        decisionId: v.decision_id,
        participantId: v.participant_id,
        tradingDay: v.trading_day,
        ticker: v.ticker,
        side: v.side,
        requestedNotional: Number(v.requested_notional),
        finalNotional: Number(v.final_notional),
        finalShares: Number(v.final_shares),
        fillPrice: v.fill_price == null ? null : Number(v.fill_price),
        status: v.status,
        reasonCode: v.reason_code,
        note: v.note,
      })),
    );
    if (data.length < 1000) break;
  }

  const state = { experiments, participants, snapshots, positions, decisions, trades, validations, navs };
  mkdirSync("data", { recursive: true });
  writeFileSync("data/archive.json", JSON.stringify(state));
  console.log(
    `wrote data/archive.json — ${experiments.length} experiments, ${participants.length} participants, ` +
      `${decisions.length} decisions, ${trades.length} trades, ${navs.length} navs, ` +
      `${Object.keys(snapshots).length} snapshots, ${validations.length} validations`,
  );
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
