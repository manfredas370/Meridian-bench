// "Stress test" scenario engine. Forks a live experiment into a sandbox, applies
// a synthetic price shock, and runs the models through it — leaving the live run
// untouched. The fork seeds each participant at its CURRENT equity (so scenario
// returns measure performance from the shock), copies its positions + cash, and
// drops a day-0 NAV baseline. Then a chaos SnapshotProvider drives the days.

import { latestTradingDayISO } from "@/lib/market/calendar";
import { addDays, createScenarioSnapshotProvider } from "@/lib/market/chaos";
import { round8 } from "@/lib/money";
import { getScenarioPreset, type ScenarioPreset } from "@/lib/scenarios";
import {
  ensureSnapshot,
  stepParticipant,
  type StepDeps,
  type StepOutcome,
} from "@/lib/engine/tick";
import type { ExperimentRow, ParticipantRow, Store } from "@/lib/store/types";

interface ForkResult {
  scenario: ExperimentRow;
  participants: ParticipantRow[];
  anchorDay: string;
  scenarioDays: string[];
  anchorCloses: Record<string, number | null>;
}

/** Clone a live run's current state into a fresh scenario experiment. */
export async function forkForScenario(
  store: Store,
  sourceExperimentId: string,
  preset: ScenarioPreset,
): Promise<ForkResult> {
  const source = await store.getExperiment(sourceExperimentId);
  if (!source) throw new Error(`Source experiment ${sourceExperimentId} not found.`);
  if (source.kind === "scenario") throw new Error("Cannot fork a scenario; fork the live run.");

  const parentParticipants = await store.listParticipants(sourceExperimentId);

  // Anchor on the parent's most recent NAV day; read real closes from its snapshot.
  const navs = await store.listNavHistory(sourceExperimentId);
  const anchorDay = navs.length ? navs[navs.length - 1].tradingDay : latestTradingDayISO();
  const anchorSnap = await store.getSnapshot(sourceExperimentId, anchorDay);
  const allTickers = Array.from(new Set([...source.universe, ...source.benchmarkTickers]));
  const anchorCloses: Record<string, number | null> = {};
  for (const t of allTickers) {
    const s = anchorSnap?.tickers[t];
    anchorCloses[t] = s ? (s.close ?? s.open ?? s.prevClose ?? null) : null;
  }

  const scenarioDays = preset.days.map((_, i) => addDays(anchorDay, i + 1));

  const scenario = await store.createExperiment({
    name: `${source.name} — ${preset.label}`,
    startingCash: source.startingCash,
    universe: source.universe,
    benchmarkTickers: source.benchmarkTickers,
    rules: source.rules,
    modelParams: source.modelParams,
    promptTemplate: source.promptTemplate,
    promptTemplateHash: source.promptTemplateHash,
    kind: "scenario",
    parentExperimentId: source.id,
    scenario: {
      presetId: preset.id,
      presetLabel: preset.label,
      description: preset.description,
      anchorDay,
    },
  });

  const participants: ParticipantRow[] = [];
  for (const p of parentParticipants) {
    const forkNav = (await store.latestNav(p.id))?.nav ?? p.cash;
    // startingCash = current equity → scenario return is measured from the shock.
    const np = await store.addParticipant({
      experimentId: scenario.id,
      modelId: p.modelId,
      label: p.label,
      kind: p.kind,
      benchmarkTicker: p.benchmarkTicker,
      startingCash: forkNav,
    });
    // addParticipant set cash = startingCash; restore the real cash + copy holdings.
    await store.setParticipantCash(np.id, p.cash);
    await store.savePositions(np.id, await store.getPositions(p.id));
    // Day-0 baseline so the equity curve starts flat at the fork point.
    await store.saveNav({
      participantId: np.id,
      experimentId: scenario.id,
      tradingDay: anchorDay,
      nav: forkNav,
      cash: p.cash,
      investedValue: round8(forkNav - p.cash),
      dailyReturn: null,
    });
    participants.push(np);
  }

  return { scenario, participants, anchorDay, scenarioDays, anchorCloses };
}

/** Fork + run a full scenario. Days are sequential; participants run concurrently. */
export async function runScenario(
  deps: StepDeps,
  sourceExperimentId: string,
  presetId: string,
): Promise<{ scenarioExperimentId: string; anchorDay: string; days: string[]; outcomes: StepOutcome[] }> {
  const preset = getScenarioPreset(presetId);
  if (!preset) throw new Error(`Unknown scenario preset: ${presetId}`);

  const { scenario, anchorDay, scenarioDays, anchorCloses } = await forkForScenario(
    deps.store,
    sourceExperimentId,
    preset,
  );

  const chaosDeps: StepDeps = {
    ...deps,
    snapshotProvider: createScenarioSnapshotProvider({ anchorDay, anchorCloses, scenarioDays, preset }),
    snapshotSource: `scenario:${preset.id}`,
  };

  const outcomes: StepOutcome[] = [];
  for (const day of scenarioDays) {
    const snapshot = await ensureSnapshot(chaosDeps, scenario, day);
    const participants = await deps.store.listParticipants(scenario.id);
    const dayOutcomes = await Promise.all(
      participants.map((p) =>
        stepParticipant(chaosDeps, scenario, p, snapshot, day).catch(
          (e): StepOutcome => ({
            participantId: p.id,
            label: p.label,
            status: "error",
            error: e instanceof Error ? e.message : String(e),
          }),
        ),
      ),
    );
    outcomes.push(...dayOutcomes);
  }

  return { scenarioExperimentId: scenario.id, anchorDay, days: scenarioDays, outcomes };
}
