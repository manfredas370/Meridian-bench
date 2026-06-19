// Assembles the engine's runtime dependencies from the environment:
//   • store        — Supabase when configured, else in-memory
//   • prices        — FMP when FMP_API_KEY is set, else deterministic mock
//   • isMock        — mock models when there is no AI Gateway key

import { modelsAreMocked } from "@/lib/decision";
import type { StepDeps } from "@/lib/engine/tick";
import { createFmpSnapshotProvider } from "@/lib/market/fmp";
import { createMockSnapshotProvider } from "@/lib/market/mock";
import { getStore } from "@/lib/store";

export function buildStepDeps(): StepDeps {
  const useMockPrices = process.env.MOCK_PRICES === "1" || !process.env.FMP_API_KEY;
  return {
    store: getStore(),
    snapshotProvider: useMockPrices ? createMockSnapshotProvider() : createFmpSnapshotProvider(),
    isMock: modelsAreMocked(),
    snapshotSource: useMockPrices ? "mock" : "FMP",
  };
}
