import { ExperimentView } from "@/components/ExperimentView";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function Home() {
  const experiment = await getStore().getLatestExperiment();

  if (!experiment) {
    return (
      <div className="space-y-4 rounded-xl border border-dashed border-zinc-300 p-8 dark:border-zinc-700">
        <h1 className="text-xl font-semibold">No experiment yet</h1>
        <p className="text-sm text-zinc-500">
          Seed a run and advance a trading day. The zero-config local demo needs no API keys (mock models + synthetic
          prices):
        </p>
        <pre className="overflow-x-auto rounded-lg bg-zinc-100 p-3 text-xs dark:bg-zinc-900">{`# advance one trading day (auto-seeds on first run)
curl -X POST http://localhost:3000/api/dev/tick

# ...repeat to build the equity curve, then refresh this page`}</pre>
        <p className="text-xs text-zinc-400">
          With Supabase + an AI Gateway key configured, the daily Vercel cron drives real models instead.
        </p>
      </div>
    );
  }

  return <ExperimentView experimentId={experiment.id} />;
}
