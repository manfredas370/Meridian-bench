import assert from "node:assert/strict";
import { test } from "node:test";

import { buildShockedBars } from "@/lib/market/chaos";
import { computeTickerSnapshot } from "@/lib/market/indicators";
import { getScenarioPreset, shockReturnFor } from "@/lib/scenarios";

const flash = getScenarioPreset("flash-crash")!;
const ANCHOR = "2026-06-12";
const DAYS = ["2026-06-13", "2026-06-14", "2026-06-15"];

test("shockReturnFor resolves group overrides (last match wins)", () => {
  // Day 1 of flash-crash: all -15%, high-beta -25%.
  assert.equal(shockReturnFor("NVDA", flash.days[0]), -0.25); // high-beta override
  assert.equal(shockReturnFor("CEG", flash.days[0]), -0.15); // broad only
});

test("a −15% day produces close ≈ 0.85×anchor and a matching 1d% the next day", () => {
  const bars = buildShockedBars("CEG", 100, ANCHOR, DAYS, flash);

  // The day-1 bar close is the shocked price.
  const day1 = bars.find((b) => b.date === DAYS[0])!;
  assert.ok(Math.abs((day1.close ?? 0) - 85) < 0.01, `expected ~85, got ${day1.close}`);

  // Features are through the prior close: day 1 shows no move yet (pre-shock)...
  const snap1 = computeTickerSnapshot("CEG", bars, DAYS[0]);
  assert.ok(Math.abs(snap1.pctChange1d ?? 1) < 1e-9, "day 1 features are pre-shock");

  // ...and day 2 surfaces the crash in 1d%.
  const snap2 = computeTickerSnapshot("CEG", bars, DAYS[1]);
  assert.ok(Math.abs((snap2.pctChange1d ?? 0) - -0.15) < 0.01, `expected ~-0.15, got ${snap2.pctChange1d}`);
});

test("indicators stay finite through the shock (SMAs defined)", () => {
  const bars = buildShockedBars("NVDA", 250, ANCHOR, DAYS, flash);
  const snap = computeTickerSnapshot("NVDA", bars, DAYS[2]);
  assert.ok(snap.sma20 != null && Number.isFinite(snap.sma20));
  assert.ok(snap.sma50 != null && Number.isFinite(snap.sma50));
  assert.ok(snap.close != null && snap.close > 0);
});
