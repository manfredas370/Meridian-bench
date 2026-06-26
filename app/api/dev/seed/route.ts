// Seed an experiment into the running server's store. Essential for the
// in-memory demo (the CLI seed script runs in a different process).

import { NextResponse } from "next/server";

import { authorized } from "@/lib/auth";
import { getStore } from "@/lib/store";
import { seedExperiment } from "@/lib/seed";
import type { DataTier } from "@/lib/store/types";

export const dynamic = "force-dynamic";

async function handler(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const tier: DataTier = url.searchParams.get("tier") === "fundamentals" ? "fundamentals" : "price";
  const name = url.searchParams.get("name") ?? (tier === "fundamentals" ? "Meridian Bench — Fundamentals + News" : "Meridian Bench");
  const { experiment, participants } = await seedExperiment(getStore(), name, tier);
  return NextResponse.json({
    experimentId: experiment.id,
    dataTier: experiment.dataTier,
    participants: participants.map((p) => ({ id: p.id, label: p.label, kind: p.kind })),
  });
}

export const GET = handler;
export const POST = handler;
