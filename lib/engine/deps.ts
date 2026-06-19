// Assembles the engine's runtime dependencies from the environment:
//   • store   — Supabase when configured, else file/in-memory
//   • prices  — Twelve Data when TWELVEDATA_API_KEY is set, else deterministic mock
//   • isMock  — mock models when there is no AI Gateway key

import { modelsAreMocked } from "@/lib/decision";
import type { SnapshotProvider, StepDeps } from "@/lib/engine/tick";
import { createMockSnapshotProvider } from "@/lib/market/mock";
import { createTwelveDataSnapshotProvider } from "@/lib/market/twelvedata";
import { getStore } from "@/lib/store";

// Price source priority: forced mock → Twelve Data (broad free) → mock.
function resolvePriceSource(): { provider: SnapshotProvider; source: string } {
  if (process.env.MOCK_PRICES === "1") return { provider: createMockSnapshotProvider(), source: "mock" };
  if (process.env.TWELVEDATA_API_KEY) return { provider: createTwelveDataSnapshotProvider(), source: "TwelveData" };
  return { provider: createMockSnapshotProvider(), source: "mock" };
}

export function buildStepDeps(): StepDeps {
  const { provider, source } = resolvePriceSource();
  return {
    store: getStore(),
    snapshotProvider: provider,
    isMock: modelsAreMocked(),
    snapshotSource: source,
  };
}
