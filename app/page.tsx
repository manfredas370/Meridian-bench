import { ExperimentView } from "@/components/ExperimentView";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function Home() {
  const experiment = await getStore().getLatestExperiment();

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
