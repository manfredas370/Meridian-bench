import assert from "node:assert/strict";
import { test } from "node:test";

import { runDailyStep, type StepDeps } from "@/lib/engine/tick";
import { runScenario } from "@/lib/engine/scenario";
import { createMockSnapshotProvider } from "@/lib/market/mock";
import { MemoryStore } from "@/lib/store/memory";
import type { Rules } from "@/lib/types";

const RULES: Rules = {
  maxPositionPctOfNav: 0.2,
  minCashReservePct: 0.05,
  maxOrdersPerDay: 10,
  minOrderUsd: 1,
  allowShorting: false,
  allowLeverage: false,
  allowOptions: false,
  universe: ["NVDA", "CEG"],
};

async function setupLiveRun() {
  const store = new MemoryStore();
  const exp = await store.createExperiment({
    name: "Live",
    startingCash: 1000,
    universe: ["NVDA", "CEG"],
    benchmarkTickers: ["SPY"],
    rules: RULES,
    modelParams: { temperature: 0.3, maxOutputTokens: 1500 },
    promptTemplate: "system",
    promptTemplateHash: "hash",
  });
  await store.addParticipant({ experimentId: exp.id, modelId: "mock/a", label: "Mock A", kind: "llm", startingCash: 1000 });
  await store.addParticipant({ experimentId: exp.id, modelId: "__passive__", label: "SPY B&H", kind: "passive", benchmarkTicker: "SPY", startingCash: 1000 });
  const deps: StepDeps = { store, snapshotProvider: createMockSnapshotProvider(), isMock: true, snapshotSource: "mock" };
  await runDailyStep(deps, exp.id, "2026-06-01"); // one live day so positions + an anchor snapshot exist
  return { store, exp, deps };
}

test("runScenario forks a sandbox, runs the shock, and leaves the live run untouched", async () => {
  const { store, exp, deps } = await setupLiveRun();

  const liveNavBefore = await store.listNavHistory(exp.id);
  const livePositionsBefore = await store.getPositions((await store.listParticipants(exp.id))[0].id);

  const result = await runScenario(deps, exp.id, "flash-crash");

  // The fork is a distinct, scenario-kind experiment linked to the parent.
  const scenario = await store.getExperiment(result.scenarioExperimentId);
  assert.ok(scenario);
  assert.equal(scenario!.kind, "scenario");
  assert.equal(scenario!.parentExperimentId, exp.id);
  assert.equal(result.anchorDay, "2026-06-01");
  assert.equal(result.days.length, 3);

  // The live run never appears as "latest"; the scenario must not hijack it.
  assert.equal((await store.getLatestExperiment())!.id, exp.id);

  // Live run is unchanged.
  assert.deepEqual(await store.listNavHistory(exp.id), liveNavBefore);
  assert.deepEqual(await store.getPositions((await store.listParticipants(exp.id))[0].id), livePositionsBefore);

  // Scenario has a day-0 baseline + one point per scenario day, per participant.
  const scParticipants = await store.listParticipants(scenario!.id);
  const scNavs = await store.listNavHistory(scenario!.id);
  assert.equal(scNavs.length, scParticipants.length * 4);
});

test("the scenario snapshot reflects the shock (CEG ≈ 0.85×its live close on day 1)", async () => {
  const { store, exp, deps } = await setupLiveRun();
  const liveClose = (await store.getSnapshot(exp.id, "2026-06-01"))!.tickers["CEG"].close!;

  const result = await runScenario(deps, exp.id, "flash-crash");
  const shocked = (await store.getSnapshot(result.scenarioExperimentId, result.days[0]))!.tickers["CEG"].close!;

  assert.ok(Math.abs(shocked - liveClose * 0.85) < 0.02 * liveClose, `expected ~${liveClose * 0.85}, got ${shocked}`);
});
