// Orchestrator (Vercel Cron target). Thin and fast: resolve the running
// experiment + trading day, write the ONE shared price snapshot, then fan out
// a worker invocation per participant. Never awaits the models — dispatch is
// kept alive with `after()`. Re-firing is safe (every step is idempotent).

import { after, NextResponse } from "next/server";

import { authorized } from "@/lib/auth";
import { buildStepDeps } from "@/lib/engine/deps";
import { ensureSnapshot } from "@/lib/engine/tick";
import { latestTradingDayISO } from "@/lib/market/calendar";

// Hobby max. The shared snapshot fetch is rate-limited by the market-data free
// tier (Twelve Data: ~8 calls/min), so a ~20-symbol universe takes a couple of
// minutes to pull before fan-out. Workers reuse the persisted snapshot.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

function baseUrl(): string {
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

async function handler(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const deps = buildStepDeps();
  const url = new URL(req.url);
  const experimentId = url.searchParams.get("experimentId");
  const experiment = experimentId
    ? await deps.store.getExperiment(experimentId)
    : await deps.store.getLatestExperiment();

  if (!experiment) {
    return NextResponse.json({ error: "no experiment found — run `npm run seed`" }, { status: 400 });
  }
  if (experiment.status !== "running") {
    return NextResponse.json({ skipped: `experiment status is '${experiment.status}'` });
  }

  const tradingDay = url.searchParams.get("day") ?? latestTradingDayISO();

  // 1. One shared snapshot for the whole field.
  await ensureSnapshot(deps, experiment, tradingDay);

  // 2. Fan out one worker per participant (fire-and-forget; kept alive by after()).
  const participants = await deps.store.listParticipants(experiment.id);
  const secret = process.env.CRON_SECRET;
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (secret) headers.authorization = `Bearer ${secret}`;

  for (const p of participants) {
    after(
      fetch(`${baseUrl()}/api/step`, {
        method: "POST",
        headers,
        body: JSON.stringify({ experimentId: experiment.id, tradingDay, participantId: p.id }),
      })
        .then(() => undefined)
        .catch((e) => console.error("[cron] dispatch failed", p.label, e)),
    );
  }

  return NextResponse.json({ experimentId: experiment.id, tradingDay, dispatched: participants.length });
}

export const GET = handler;
export const POST = handler;
