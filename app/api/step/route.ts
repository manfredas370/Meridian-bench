// Per-participant worker. The orchestrator fans out one POST per participant.
// We acknowledge fast (202) and run the (slow) decision + execution inside
// `after()` so the request returns immediately while the model call finishes
// within this invocation's budget. Idempotent via the engine's decision guard.

import { after, NextResponse } from "next/server";

import { authorized } from "@/lib/auth";
import { buildStepDeps } from "@/lib/engine/deps";
import { ensureSnapshot, stepParticipant } from "@/lib/engine/tick";

export const maxDuration = 300; // Hobby max; raise toward 800 on Pro for slow models
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

  after(async () => {
    try {
      const deps = buildStepDeps();
      const experiment = await deps.store.getExperiment(body.experimentId!);
      const participant = await deps.store.getParticipant(body.participantId!);
      if (!experiment || !participant) return;
      const snapshot = await ensureSnapshot(deps, experiment, body.tradingDay!);
      await stepParticipant(deps, experiment, participant, snapshot, body.tradingDay!);
    } catch (err) {
      console.error("[step] worker error", err);
    }
  });

  return NextResponse.json({ accepted: true }, { status: 202 });
}
