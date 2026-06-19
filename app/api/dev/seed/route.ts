// Seed an experiment into the running server's store. Essential for the
// in-memory demo (the CLI seed script runs in a different process).

import { NextResponse } from "next/server";

import { authorized } from "@/lib/auth";
import { getStore } from "@/lib/store";
import { seedExperiment } from "@/lib/seed";

export const dynamic = "force-dynamic";

async function handler(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { experiment, participants } = await seedExperiment(getStore());
  return NextResponse.json({
    experimentId: experiment.id,
    participants: participants.map((p) => ({ id: p.id, label: p.label, kind: p.kind })),
  });
}

export const GET = handler;
export const POST = handler;
