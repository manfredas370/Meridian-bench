import { ExperimentView } from "@/components/ExperimentView";
import { StandingsTabs, type StandingsTab } from "@/components/StandingsTabs";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

const TIER_LABEL = (tier: string) => (tier === "fundamentals" ? "Fundamentals + News" : "Price only");

export default async function Home() {
  const store = getStore();
  const experiment = await store.getLatestExperiment();

  // Parallel live runs (price-only + fundamentals) → in-place tabbed switcher.
  const live = (await store.listExperiments())
    .filter((e) => e.kind === "live" && e.status === "running")
    .sort((a, b) => (a.dataTier === "price" ? -1 : 1) - (b.dataTier === "price" ? -1 : 1));

  if (live.length >= 2) {
    const tabs: StandingsTab[] = live.map((e) => ({
      id: e.id,
      tier: e.dataTier,
      label: TIER_LABEL(e.dataTier),
    }));
    return (
      <StandingsTabs tabs={tabs}>
        {live.map((e) => (
          <ExperimentView key={e.id} experimentId={e.id} embedded />
        ))}
      </StandingsTabs>
    );
  }

  if (!experiment) {
    return (
      <div className="space-y-4 rounded-xl border border-dashed border-border-strong bg-white p-8">
        <h1 className="text-xl font-medium tracking-tight text-fg">No experiment yet</h1>
        <p className="text-sm text-fg-3">
          Seed a run and advance a trading day. The zero-config local demo needs no API keys (mock models + synthetic
          prices):
        </p>
        <pre className="overflow-x-auto rounded-lg border border-border bg-surface-2 p-3 font-mono text-xs text-fg-2">{`# advance one trading day (auto-seeds on first run)
curl -X POST http://localhost:3000/api/dev/tick

# ...repeat to build the equity curve, then refresh this page`}</pre>
        <p className="text-xs text-fg-muted">
          With Supabase + an AI Gateway key configured, the daily Vercel cron drives real models instead.
        </p>
      </div>
    );
  }

  return <ExperimentView experimentId={experiment.id} />;
}
