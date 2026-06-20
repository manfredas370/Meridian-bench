// Chaos "stress test" scenario presets. Each preset is a short scripted price
// path applied to a fork of a live run: a list of days, each carrying per-ticker
// daily-return shocks. Shocks are matched in order ("all" first, then specific
// groups), last match wins. Returns are decimals (-0.15 = -15%).
//
// Client-safe: imports only ticker constants from config (no server deps), so
// the launcher can render the catalog.

import { BENCHMARK_TICKERS } from "@/lib/config";

/** One shock rule within a day. `match: "all"` hits every ticker (incl. benchmarks). */
export interface ShockRule {
  match: "all" | string[];
  pct: number;
}

export interface ScenarioDay {
  shocks: ShockRule[];
  note?: string;
}

export interface ScenarioPreset {
  id: string;
  label: string;
  description: string;
  days: ScenarioDay[];
}

// Ticker groups drawn from the universe (lib/config.ts).
const SEMIS = ["NVDA", "AMD", "AVGO", "MU", "ANET"]; // high-beta compute/networking
const HIGH_BETA = [...SEMIS, "DELL", "PLTR", "RKLB", "TEM", "HIMS", "SHOP"];
const GROWTH_TECH = [...HIGH_BETA, "CRM", "NOW", ...BENCHMARK_TICKERS]; // most things sell off
const DEFENSIVES = ["CEG", "VST", "CCJ", "GEV", "VRT"]; // power/energy, hold up better

/** The resolved daily return for one ticker on one scenario day. Last match wins. */
export function shockReturnFor(ticker: string, day: ScenarioDay): number {
  let r = 0;
  for (const rule of day.shocks) {
    if (rule.match === "all" || rule.match.includes(ticker)) r = rule.pct;
  }
  return r;
}

export const SCENARIO_PRESETS: ScenarioPreset[] = [
  {
    id: "flash-crash",
    label: "Flash crash",
    description: "Broad −15% rout led by high-beta names (−25%), a −3% follow-through, then a sharp relief bounce.",
    days: [
      { shocks: [{ match: "all", pct: -0.15 }, { match: HIGH_BETA, pct: -0.25 }], note: "Risk-off cascade." },
      { shocks: [{ match: "all", pct: -0.03 }], note: "Aftershock / continued selling." },
      { shocks: [{ match: "all", pct: 0.06 }, { match: HIGH_BETA, pct: 0.1 }], note: "Relief bounce." },
    ],
  },
  {
    id: "rate-shock",
    label: "Rate shock",
    description: "A hawkish surprise hammers long-duration growth/tech for two days while defensives hold; modest stabilization.",
    days: [
      { shocks: [{ match: GROWTH_TECH, pct: -0.06 }, { match: DEFENSIVES, pct: 0.005 }], note: "Yields spike." },
      { shocks: [{ match: GROWTH_TECH, pct: -0.05 }, { match: DEFENSIVES, pct: -0.01 }], note: "Repricing continues." },
      { shocks: [{ match: GROWTH_TECH, pct: 0.02 }, { match: DEFENSIVES, pct: 0.005 }], note: "Stabilization." },
    ],
  },
  {
    id: "sector-rotation",
    label: "Sector rotation",
    description: "Capital rotates out of semiconductors (−12%) into the rest of the book (+3%), persisting over three days.",
    days: [
      { shocks: [{ match: "all", pct: 0.03 }, { match: SEMIS, pct: -0.12 }], note: "Out of semis." },
      { shocks: [{ match: "all", pct: 0.015 }, { match: SEMIS, pct: -0.04 }] },
      { shocks: [{ match: "all", pct: 0.01 }, { match: SEMIS, pct: -0.02 }] },
    ],
  },
  {
    id: "black-swan",
    label: "Black swan + recovery",
    description: "An exogenous −20% gap down, a −6% aftershock, then a violent +12% snap-back rally.",
    days: [
      { shocks: [{ match: "all", pct: -0.2 }], note: "Exogenous shock." },
      { shocks: [{ match: "all", pct: -0.06 }], note: "Capitulation." },
      { shocks: [{ match: "all", pct: 0.12 }], note: "Snap-back rally." },
    ],
  },
];

export function getScenarioPreset(id: string): ScenarioPreset | undefined {
  return SCENARIO_PRESETS.find((p) => p.id === id);
}
