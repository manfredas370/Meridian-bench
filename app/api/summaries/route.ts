// On-demand regeneration of every participant's "analyst take" for the latest
// (or given) experiment. CRON_SECRET-gated (it spends model credits). The daily
// cron also refreshes these automatically; this is for manual/backfill runs.

import { NextResponse } from "next/server";

import { authorized } from "@/lib/auth";
import { buildStepDeps } from "@/lib/engine/deps";
import { refreshSummaries } from "@/lib/summary";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

async function handler(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const deps = buildStepDeps();
  const url = new URL(req.url);
  const experimentId =
    url.searchParams.get("experimentId") ?? (await deps.store.getLatestExperiment())?.id;
  if (!experimentId) {
    return NextResponse.json({ error: "no experiment found" }, { status: 400 });
  }

  const summaries = await refreshSummaries(deps, experimentId);
  return NextResponse.json({ experimentId, summaries });
}

export const GET = handler;
export const POST = handler;
