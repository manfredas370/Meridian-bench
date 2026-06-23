// Creates an experiment + participant roster from the config. Shared by the
// `npm run seed` script and the /api/dev/seed route so both produce identical
// runs. The rendered system prompt is hashed so prompt parity is auditable.

import { createHash } from "node:crypto";

import {
  BENCHMARK_TICKERS,
  DEFAULT_MODEL_PARAMS,
  DEFAULT_ROSTER,
  DEFAULT_RULES,
  DEFAULT_UNIVERSE,
  renderSystemPrompt,
  STARTING_CASH,
} from "@/lib/config";
import type { ExperimentRow, ParticipantRow, Store } from "@/lib/store/types";

export async function seedExperiment(
  store: Store,
  name = "Meridian Bench",
): Promise<{ experiment: ExperimentRow; participants: ParticipantRow[] }> {
  const promptTemplate = renderSystemPrompt(DEFAULT_RULES);
  const promptTemplateHash = createHash("sha256").update(promptTemplate).digest("hex").slice(0, 16);

  // Live-forward, ~1-month test window starting today.
  const start = new Date();
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);

  const experiment = await store.createExperiment({
    name,
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
    startingCash: STARTING_CASH,
    universe: DEFAULT_UNIVERSE,
    benchmarkTickers: BENCHMARK_TICKERS,
    rules: DEFAULT_RULES,
    modelParams: DEFAULT_MODEL_PARAMS,
    promptTemplate,
    promptTemplateHash,
  });

  const participants: ParticipantRow[] = [];
  for (const p of DEFAULT_ROSTER) {
    participants.push(
      await store.addParticipant({
        experimentId: experiment.id,
        modelId: p.modelId,
        label: p.label,
        kind: p.kind,
        benchmarkTicker: p.benchmarkTicker ?? null,
        startingCash: STARTING_CASH,
      }),
    );
  }
  return { experiment, participants };
}
