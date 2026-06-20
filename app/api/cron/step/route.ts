// Daily orchestrator (Vercel Cron target). Runs the whole field in ONE
// invocation: write the shared snapshot once, then step every participant
// CONCURRENTLY (model calls are I/O-bound, so wall-clock ≈ the slowest model,
// not the sum). No self-fetch fan-out, no `after()` — both proved unreliable on
// serverless. Every step is idempotent, so a re-fire just fills any gaps.

import { NextResponse } from "next/server";

import { authorized } from "@/lib/auth";
import { buildStepDeps } from "@/lib/engine/deps";
import { ensureSnapshot, stepParticipant, type StepOutcome } from "@/lib/engine/tick";
import { latestTradingDayISO } from "@/lib/market/calendar";

export const maxDuration = 300; // Hobby max; snapshot (~2 min) + concurrent models
export const dynamic = "force-dynamic";

async function handler(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const deps = buildStepDeps();
  const url = new URL(req.url);
  const experimentId = url.searchParams.get("experimentId");
  const experiment = experimentId
    ? await deps.store.getExperiment(experimentId)
    : await deps.store.getLatestExperiment();

  if (!experiment) {
    return NextResponse.json({ error: "no experiment found — run `npm run seed` or POST /api/dev/seed" }, { status: 400 });
  }
  if (experiment.status !== "running") {
    return NextResponse.json({ skipped: `experiment status is '${experiment.status}'` });
  }

  const tradingDay = url.searchParams.get("day") ?? latestTradingDayISO();
  const snapshot = await ensureSnapshot(deps, experiment, tradingDay);
  const participants = await deps.store.listParticipants(experiment.id);

  const outcomes = await Promise.all(
    participants.map((p) =>
      stepParticipant(deps, experiment, p, snapshot, tradingDay).catch(
        (e): StepOutcome => ({
          participantId: p.id,
          label: p.label,
          status: "error",
          error: e instanceof Error ? e.message : String(e),
        }),
      ),
    ),
  );

  return NextResponse.json({ experimentId: experiment.id, tradingDay, outcomes });
}

export const GET = handler;
export const POST = handler;
