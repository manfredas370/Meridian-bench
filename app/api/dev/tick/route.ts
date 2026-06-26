// On-demand, in-process daily step — runs the whole field sequentially and
// returns the outcomes. This is the local/test path (no HTTP fan-out): hit it
// repeatedly to advance the simulation and watch the leaderboard move without
// waiting for cron. Re-running the same day is a no-op.

import { NextResponse } from "next/server";

import { authorized } from "@/lib/auth";
import { buildStepDeps } from "@/lib/engine/deps";
import { runDailyStep } from "@/lib/engine/tick";
import { latestTradingDayISO } from "@/lib/market/calendar";
import { seedExperiment } from "@/lib/seed";
import { refreshGrades } from "@/lib/grade";
import { refreshSummaries } from "@/lib/summary";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

async function handler(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const deps = buildStepDeps();
  const url = new URL(req.url);
  let experimentId =
    url.searchParams.get("experimentId") ?? (await deps.store.getLatestExperiment())?.id;
  // Zero-config demo: auto-seed if no experiment exists yet.
  if (!experimentId) {
    const { experiment } = await seedExperiment(deps.store);
    experimentId = experiment.id;
  }
  const tradingDay = url.searchParams.get("day") ?? latestTradingDayISO();

  const result = await runDailyStep(deps, experimentId, tradingDay);
  const summaries = await refreshSummaries(deps, experimentId).catch(() => 0);
  const grades = await refreshGrades(deps, experimentId).catch(() => 0);
  return NextResponse.json({
    experimentId,
    tradingDay: result.tradingDay,
    snapshotSource: deps.snapshotSource,
    mockedModels: deps.isMock,
    outcomes: result.outcomes,
    summaries,
    grades,
  });
}

export const GET = handler;
export const POST = handler;
