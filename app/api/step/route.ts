// Single-participant worker — runs the step SYNCHRONOUSLY within this
// invocation (no `after()`, which Vercel doesn't reliably keep alive for a
// ~90s model call) and returns the outcome. The cron no longer fans out to
// this route (it runs participants concurrently in-process); kept for manual /
// single-participant debugging.

import { NextResponse } from "next/server";

import { authorized } from "@/lib/auth";
import { buildStepDeps } from "@/lib/engine/deps";
import { ensureSnapshot, stepParticipant } from "@/lib/engine/tick";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    experimentId?: string;
    participantId?: string;
    tradingDay?: string;
  } | null;
  if (!body?.experimentId || !body.participantId || !body.tradingDay) {
    return NextResponse.json({ error: "experimentId, participantId, tradingDay required" }, { status: 400 });
  }

  const deps = buildStepDeps();
  const experiment = await deps.store.getExperiment(body.experimentId);
  const participant = await deps.store.getParticipant(body.participantId);
  if (!experiment || !participant) {
    return NextResponse.json({ error: "experiment or participant not found" }, { status: 404 });
  }

  const snapshot = await ensureSnapshot(deps, experiment, body.tradingDay);
  const outcome = await stepParticipant(deps, experiment, participant, snapshot, body.tradingDay);
  return NextResponse.json(outcome);
}
