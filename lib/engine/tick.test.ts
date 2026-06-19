import assert from "node:assert/strict";
import { test } from "node:test";

import { runDailyStep, type SnapshotProvider, type StepDeps } from "@/lib/engine/tick";
import { round2 } from "@/lib/money";
import { MemoryStore } from "@/lib/store/memory";
import type { Rules, TickerSnapshot } from "@/lib/types";

const PRICES: Record<string, Record<string, { open: number; close: number; prevClose: number; mom5: number }>> = {
  "2026-06-01": {
    NVDA: { open: 50, close: 50, prevClose: 48, mom5: 0.05 },
    AMD: { open: 10, close: 10, prevClose: 9.8, mom5: 0.03 },
    SPY: { open: 100, close: 100, prevClose: 99, mom5: 0.01 },
  },
  "2026-06-02": {
    NVDA: { open: 55, close: 55, prevClose: 50, mom5: 0.1 },
    AMD: { open: 11, close: 11, prevClose: 10, mom5: 0.1 },
    SPY: { open: 110, close: 110, prevClose: 100, mom5: 0.1 },
  },
};

const provider: SnapshotProvider = async (tickers, day) =>
  tickers.map((t): TickerSnapshot => {
    const p = PRICES[day][t];
    return {
      ticker: t,
      open: p.open,
      close: p.close,
      prevClose: p.prevClose,
      pctChange1d: null,
      pctChange5d: p.mom5,
      sma20: null,
      sma50: null,
      pctFrom20dHigh: null,
    };
  });

const RULES: Rules = {
  maxPositionPctOfNav: 0.2,
  minCashReservePct: 0.05,
  maxOrdersPerDay: 10,
  minOrderUsd: 1,
  allowShorting: false,
  allowLeverage: false,
  allowOptions: false,
  universe: ["NVDA", "AMD"],
};

async function setup() {
  const store = new MemoryStore();
  const exp = await store.createExperiment({
    name: "test",
    startingCash: 1000,
    universe: ["NVDA", "AMD"],
    benchmarkTickers: ["SPY"],
    rules: RULES,
    modelParams: { temperature: 0.3, maxOutputTokens: 1500 },
    promptTemplate: "test-system",
    promptTemplateHash: "hash",
  });
  const llm = await store.addParticipant({
    experimentId: exp.id,
    modelId: "mock/llm-a",
    label: "Mock A",
    kind: "llm",
    startingCash: 1000,
  });
  const passive = await store.addParticipant({
    experimentId: exp.id,
    modelId: "__passive__",
    label: "SPY B&H",
    kind: "passive",
    benchmarkTicker: "SPY",
    startingCash: 1000,
  });
  const deps: StepDeps = { store, snapshotProvider: provider, isMock: true, snapshotSource: "mock" };
  return { store, exp, llm, passive, deps };
}

test("daily step executes all participants and records NAV ≈ starting cash", async () => {
  const { store, exp, deps } = await setup();
  const { outcomes } = await runDailyStep(deps, exp.id, "2026-06-01");

  assert.equal(outcomes.length, 2);
  assert.ok(outcomes.every((o) => o.status === "executed"), "all participants executed");

  const navs = await store.listNavHistory(exp.id);
  assert.equal(navs.length, 2);
  // Day 1 has open == close, so a fill-at-open + mark-at-close conserves NAV.
  for (const nav of navs) assert.equal(nav.nav, 1000);
});

test("NAV reconciles to cash + Σ(shares × close) for every participant", async () => {
  const { store, exp, llm, passive, deps } = await setup();
  await runDailyStep(deps, exp.id, "2026-06-01");
  const snap = await store.getSnapshot(exp.id, "2026-06-01");
  assert.ok(snap);
  const navs = await store.listNavHistory(exp.id);

  for (const p of [llm, passive]) {
    const fresh = await store.getParticipant(p.id);
    const positions = await store.getPositions(p.id);
    let invested = 0;
    for (const pos of positions) {
      if (pos.shares > 0) invested = round2(invested + round2(pos.shares * (snap!.tickers[pos.ticker].close ?? 0)));
    }
    const navRec = navs.find((n) => n.participantId === p.id)!;
    assert.equal(navRec.nav, round2(fresh!.cash + invested));
  }
});

test("the LLM trades into the universe and the passive control buys its benchmark", async () => {
  const { store, exp, llm, passive, deps } = await setup();
  await runDailyStep(deps, exp.id, "2026-06-01");

  const llmPositions = (await store.getPositions(llm.id)).filter((p) => p.shares > 0);
  assert.ok(llmPositions.length > 0, "mock LLM opened at least one position");

  const passivePositions = (await store.getPositions(passive.id)).filter((p) => p.shares > 0);
  assert.equal(passivePositions.length, 1);
  assert.equal(passivePositions[0].ticker, "SPY");
  const passiveCash = (await store.getParticipant(passive.id))!.cash;
  assert.ok(passiveCash < 1, "passive control is fully invested (cash ~ 0)");
});

test("re-running the same trading day is fully idempotent", async () => {
  const { store, exp, llm, deps } = await setup();
  await runDailyStep(deps, exp.id, "2026-06-01");
  const cashAfterFirst = (await store.getParticipant(llm.id))!.cash;
  const navCountAfterFirst = (await store.listNavHistory(exp.id)).length;

  const { outcomes } = await runDailyStep(deps, exp.id, "2026-06-01");
  assert.ok(outcomes.every((o) => o.status === "skipped"), "second run skips everyone");
  assert.equal((await store.listNavHistory(exp.id)).length, navCountAfterFirst);
  assert.equal((await store.getParticipant(llm.id))!.cash, cashAfterFirst);
});

test("a second day advances the experiment and grows the equity curve", async () => {
  const { store, exp, deps } = await setup();
  await runDailyStep(deps, exp.id, "2026-06-01");
  const { outcomes } = await runDailyStep(deps, exp.id, "2026-06-02");

  assert.ok(outcomes.every((o) => o.status === "executed"));
  const navs = await store.listNavHistory(exp.id);
  assert.equal(navs.length, 4); // 2 participants × 2 days
  // Prices rose 10% on day 2, so invested participants should be worth > $1000.
  const day2 = navs.filter((n) => n.tradingDay === "2026-06-02");
  assert.ok(day2.every((n) => n.nav > 1000), "NAVs grew on the up day");
});
