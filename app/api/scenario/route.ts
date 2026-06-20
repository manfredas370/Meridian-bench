// On-demand "stress test": fork the live run into a sandbox and apply a
// synthetic market shock. CRON_SECRET-gated (owner-only) because it spends real
// model credits. Returns the new scenario experiment id for the UI to navigate to.

import { NextResponse } from "next/server";

import { authorized } from "@/lib/auth";
import { buildStepDeps } from "@/lib/engine/deps";
import { runScenario } from "@/lib/engine/scenario";
import { getScenarioPreset } from "@/lib/scenarios";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as
    | { sourceExperimentId?: string; presetId?: string }
    | null;
  if (!body?.presetId || !getScenarioPreset(body.presetId)) {
    return NextResponse.json({ error: "valid presetId required" }, { status: 400 });
  }

  const deps = buildStepDeps();
  const sourceExperimentId =
    body.sourceExperimentId ?? (await deps.store.getLatestExperiment())?.id;
  if (!sourceExperimentId) {
    return NextResponse.json({ error: "no live experiment to fork" }, { status: 400 });
  }

  try {
    const result = await runScenario(deps, sourceExperimentId, body.presetId);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
