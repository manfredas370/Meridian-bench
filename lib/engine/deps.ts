// Assembles the engine's runtime dependencies from the environment:
//   • store   — Supabase when configured, else file/in-memory
//   • prices  — Twelve Data when TWELVEDATA_API_KEY is set, else deterministic mock
//   • isMock  — mock models when there is no AI Gateway key

import { modelsAreMocked } from "@/lib/decision";
import type { SnapshotProvider, StepDeps } from "@/lib/engine/tick";
import type { FundamentalsProvider } from "@/lib/market/finnhub";
import { createFinnhubProvider } from "@/lib/market/finnhub";
import { createMockFundamentalsProvider, createMockSnapshotProvider } from "@/lib/market/mock";
import { createTwelveDataSnapshotProvider } from "@/lib/market/twelvedata";
import { getStore } from "@/lib/store";

// Price source priority: forced mock → Twelve Data (broad free) → mock.
function resolvePriceSource(): { provider: SnapshotProvider; source: string } {
  if (process.env.MOCK_PRICES === "1") return { provider: createMockSnapshotProvider(), source: "mock" };
  if (process.env.TWELVEDATA_API_KEY) return { provider: createTwelveDataSnapshotProvider(), source: "TwelveData" };
  return { provider: createMockSnapshotProvider(), source: "mock" };
}

// Fundamentals/news source: Finnhub when keyed; mock when prices are mocked;
// otherwise none (fundamentals-tier runs degrade gracefully to price-only).
function resolveFundamentalsProvider(): FundamentalsProvider | undefined {
  if (process.env.FINNHUB_API_KEY) return createFinnhubProvider();
  if (process.env.MOCK_PRICES === "1") return createMockFundamentalsProvider();
  return undefined;
}

export function buildStepDeps(): StepDeps {
  const { provider, source } = resolvePriceSource();
  return {
    store: getStore(),
    snapshotProvider: provider,
    isMock: modelsAreMocked(),
    snapshotSource: source,
    fundamentalsProvider: resolveFundamentalsProvider(),
  };
}
