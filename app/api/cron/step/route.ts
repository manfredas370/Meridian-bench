// Daily orchestrator (Vercel Cron target). Runs the whole field in ONE
// invocation: write the shared snapshot once, then step every participant
// CONCURRENTLY (model calls are I/O-bound, so wall-clock ≈ the slowest model,
// not the sum). No self-fetch fan-out, no `after()` — both proved unreliable on
// serverless. Every step is idempotent, so a re-fire just fills any gaps.

import { NextResponse } from "next/server";

import { authorized } from "@/lib/auth";
import { buildStepDeps } from "@/lib/engine/deps";
import { ensureSnapshot, type SnapshotProvider, stepParticipant, type StepDeps, type StepOutcome } from "@/lib/engine/tick";
import { refreshGrades } from "@/lib/grade";
import { latestTradingDayISO } from "@/lib/market/calendar";
import { refreshSummaries } from "@/lib/summary";
import type { TickerSnapshot } from "@/lib/types";

export const maxDuration = 300; // Hobby max; snapshot (~2 min) + concurrent models
export const dynamic = "force-dynamic";

const nullTick = (ticker: string): TickerSnapshot => ({
  ticker, open: null, close: null, prevClose: null,
  pctChange1d: null, pctChange5d: null, sma20: null, sma50: null, pctFrom20dHigh: null,
});

async function handler(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const deps = buildStepDeps();
  const url = new URL(req.url);
  const onlyId = url.searchParams.get("experimentId");

  // Step a specific experiment, else every running live experiment (so parallel
  // runs — e.g. price-only vs. fundamentals — both advance under one cron).
  const all = await deps.store.listExperiments();
  const running = onlyId
    ? all.filter((e) => e.id === onlyId)
    : all.filter((e) => e.kind === "live" && e.status === "running");
  if (running.length === 0) {
    return NextResponse.json({ error: "no running live experiment found" }, { status: 400 });
  }

  const tradingDay = url.searchParams.get("day") ?? latestTradingDayISO();

  // Retire any run whose window has fully elapsed. The guard is STRICTLY past
  // endDate (`>`), so the endDate day itself is still stepped below and captured
  // before the run closes. A run that closes drops out of every future cron.
  const closed: string[] = [];
  for (const e of running) {
    if (e.endDate && tradingDay > e.endDate) {
      await deps.store.updateExperimentStatus(e.id, "completed");
      closed.push(e.id);
    }
  }
  const experiments = running.filter((e) => !(e.endDate && tradingDay > e.endDate));
  if (experiments.length === 0) {
    return NextResponse.json({ tradingDay, experiments: 0, closed });
  }

  // Fetch the (slow, rate-limited) price snapshot ONCE for the union universe,
  // then fan it to each experiment — no double fetch. Fundamentals are fetched
  // per-experiment inside ensureSnapshot (only the fundamentals tier, and fast).
  const universe = Array.from(new Set(experiments.flatMap((e) => [...e.universe, ...e.benchmarkTickers])));
  const sharedTicks = await deps.snapshotProvider(universe, tradingDay);
  const priceByTicker = new Map(sharedTicks.map((t) => [t.ticker, t]));
  const sharedPriceProvider: SnapshotProvider = async (tickers) =>
    tickers.map((t) => priceByTicker.get(t) ?? nullTick(t));

  const runs = [];
  for (const experiment of experiments) {
    const expDeps: StepDeps = { ...deps, snapshotProvider: sharedPriceProvider };
    const snapshot = await ensureSnapshot(expDeps, experiment, tradingDay);
    const participants = await deps.store.listParticipants(experiment.id);
    const outcomes = await Promise.all(
      participants.map((p) =>
        stepParticipant(expDeps, experiment, p, snapshot, tradingDay).catch(
          (e): StepOutcome => ({
            participantId: p.id,
            label: p.label,
            status: "error",
            error: e instanceof Error ? e.message : String(e),
          }),
        ),
      ),
    );
    const summaries = await refreshSummaries(expDeps, experiment.id).catch(() => 0);
    const grades = await refreshGrades(expDeps, experiment.id).catch(() => 0);
    // Final scheduled day just captured — close the run so it stops advancing.
    const completed = experiment.endDate != null && tradingDay >= experiment.endDate;
    if (completed) {
      await deps.store.updateExperimentStatus(experiment.id, "completed");
      closed.push(experiment.id);
    }
    runs.push({ experimentId: experiment.id, tier: experiment.dataTier, tradingDay, summaries, grades, completed, outcomes });
  }

  return NextResponse.json({ tradingDay, experiments: runs.length, closed, runs });
}

export const GET = handler;
export const POST = handler;
