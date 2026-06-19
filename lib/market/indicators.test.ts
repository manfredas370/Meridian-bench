import assert from "node:assert/strict";
import { test } from "node:test";

import { computeTickerSnapshot, type DailyBar } from "@/lib/market/indicators";

function bars(closes: number[], openLast: number): DailyBar[] {
  return closes.map((c, i) => ({
    date: `2026-06-${String(i + 1).padStart(2, "0")}`,
    open: i === closes.length - 1 ? openLast : c,
    close: c,
  }));
}

test("features are computed through the prior close; open/close carried through", () => {
  // 7 bars; the last (idx 6) is the target day T.
  const b = bars([10, 11, 12, 13, 14, 15, 16], 16.5);
  const s = computeTickerSnapshot("NVDA", b, "2026-06-07");

  assert.equal(s.open, 16.5); // today's open (fill price)
  assert.equal(s.close, 16); // today's close (NAV mark)
  assert.equal(s.prevClose, 15); // T-1
  assert.equal(s.pctChange1d, Math.round(((15 - 14) / 14) * 1e8) / 1e8); // T-1 vs T-2
  assert.equal(s.pctChange5d, 0.5); // (15 - 10) / 10
  assert.equal(s.sma20, null); // not enough history
});

test("empty bars produce an all-null snapshot (no fabrication)", () => {
  const s = computeTickerSnapshot("AMD", [], "2026-06-07");
  assert.equal(s.open, null);
  assert.equal(s.close, null);
  assert.equal(s.prevClose, null);
  assert.equal(s.pctChange5d, null);
});
