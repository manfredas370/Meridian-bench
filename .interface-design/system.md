# Meridian Bench — Interface Design System

The benchmarking arena where LLMs trade head-to-head. The UI is a **standings
board + trading terminal**: scan who's winning, whether models beat the index,
and read each model's reasoning trail.

## Direction & feel

- **Google-Finance light.** White canvas, light-gray fills, near-black text,
  quiet hairline borders + whitespace do the structural work. Precise, calm,
  data-dense — a terminal you can read at a glance, not a flashy dashboard.
- **Type stays Geist** (Sans everywhere; `.tnum` tabular figures for all numeric
  columns so they align). Do not change the font family.
- **Depth: borders-only.** No shadows for structure (a dense data tool). Cards
  lift via a slightly stronger edge, not elevation.

## The signature (where the product shows through)

1. **Per-model identity color as a connective spine.** Each model has one hue
   (`MODEL_PALETTE` in `lib/chart-colors.ts`, resolved via `assignColors`). That
   same hue runs through everything tied to the model: its leaderboard **rank
   spine** (3px left border on the `#` cell) and leader-row wash, its **line** in
   the performance chart, the **color spine** beside its drill-down hero, the
   **"Analyst take" heading**, and the **active Performance/Holdings tab
   underline**. Pull it from `lineColor`/`assignColors` — never hardcode per place.
2. **Benchmarks as dashed baselines.** SPY/QQQ render as dashed, muted gray lines
   (`LineChart` `dashed` prop) — the bar models race to beat — vs solid colored
   model lines. Legend shows a dashed swatch for them; leaderboard tags them `INDEX`.
3. **Leader wash.** The rank-1 row is tinted with the *leader's own* identity
   color at **8% opacity** (`` `${color}14` ``), matching its spine — not a fixed
   accent. Bold neutral rank number.

## Tokens (`app/globals.css`)

Text hierarchy: `--fg` (primary) · `--fg-2` (secondary) · `--fg-3` (metadata/axis)
· `--fg-muted` (disabled/placeholder). Use all four.

Borders (progression): `--border` (#eceef1, hairline inner dividers) ·
`--border-strong` (#dde0e4, top-level card edges, header rule).

Surfaces: white canvas · `--surface-2` (#f8f9fa hover/stat cells) ·
`--surface-3` (#f1f3f4 chips/deeper fill).

Color carries meaning: `--accent` (#1a73e8 interactive/links/active) ·
`--accent-soft` (#e8f0fe selection / scenario banner) · `--gain` (#1a8e3e) ·
`--loss` (#d93025) · `--index-line` (#9aa0a6 benchmark) · `--leader` /
`--leader-soft` (amber — legacy, the leader wash now uses the model's own hue).

## Palettes

- **Model identity** (`MODEL_PALETTE`, leaderboard + line chart): the vivid
  categorical set `#4285f4 #f29900 #a142f4 #009688 #e52592 #5e35b1`; passive
  controls get grays `#5f6368` (SPY) / `#b0b4b8` (QQQ).
- **Holdings stacked bar** (`HOLDING_PALETTE` in `app/participant/[id]/page.tsx`):
  a separate, **clean medium-saturation** set (AntV/Tableau spirit —
  `#5b8ff9 #f59e4e #e6c14a #3fc488 #9a7bd8 #46b8d0 …`). Lesson learned: a
  desaturated/muted palette read **muddy**; keep saturation moderate, avoid
  brown/gray/olive hues. Cash recedes in `#d6dadf`.

## Type & spacing

- Section/column micro-labels: `text-[10px] font-medium uppercase tracking-wider
  text-fg-3`. Headlines: medium weight, tight tracking. Hero NAV: `text-[34px]`.
- Spacing base 4px; card padding `p-4 sm:p-5`; row `py-3`; cell `px-3`.
- Radius: cards `rounded-xl`, chips/controls `rounded`/`rounded-lg`, logos
  `rounded-full`.

## Component patterns

- **Cards:** `rounded-xl border border-border-strong bg-white`; inner dividers
  `divide-border`. Panel header = uppercase micro-label + tnum count.
- **Stat strip:** flex of equal cells, `divide-x divide-border`; uppercase
  micro-label + `text-[17px] tnum` value. Standings leads with a **Leader** tile
  (color dot + model + return delta).
- **Delta:** colored `▲`/`▼` glyph (`text-[0.7em]`) + magnitude, gain/loss color.
- **Tables:** per-column alignment — text columns left, numeric right, **headers
  must match their cells** (don't blanket-right-align). Wrap in `overflow-x-auto`
  + `min-w-[…]` so columns stay reachable on mobile.
- **TickerBadge** (`components/TickerBadge.tsx`): circular company logo (keyless
  `financialmodelingprep.com/image-stock/{T}.png`, 2-letter monogram fallback on
  error) + ticker linking to its Yahoo Finance quote. Use anywhere a ticker shows.
- **Decision journal:** vertical timeline; **dot colored by outlook**
  (gain/muted/loss); outlook **pill** (▲ Bullish / — Neutral / ▼ Bearish) +
  **confidence mini-meter** bar; buy/sell **ticker chips** from the decision's
  orders (gain/loss tinted); **action days full-strength, hold days muted**
  ("Held · no trades"); subtle uppercase **"shift"** marker when outlook flips.
- **Charts** (`components/LineChart.tsx`, `StackedBarChart.tsx`): Recharts,
  custom light tooltip + chip legend (centered), `type="linear"` (no smoothing),
  no gradients. Chart cards have no legend on the home standings (the table
  carries identity).
- **ScenarioLauncher:** split button group (dark `#2A2B30`, white text) — a
  label segment + joined chevron — opening the chaos-preset menu.
- **Analyst take** (per-model AI summary): a featured/editorial block — a masthead
  band with a plain **model-colored "Analyst take" heading** + "as of" date, a
  larger pull-quote body (`text-[17px]`/`19px`, primary ink, model-color left
  rule), then a data row: the **sentiment gauge** + Return / vs SPY / Cash figures.
- **Sentiment gauge** (Fear↔Greed, derived from cash deployment + outlook): a
  gradient **fill** bar (faint→solid, width = score) in a **cool→warm** ramp
  (`#4f7bd6`→`#e07d3a`, kept separate from the P&L green/red so it doesn't read as
  gain/loss) with the zone word as a color-matched heading. No marker, no end
  labels. This is the one sanctioned gradient — it encodes intensity on a scale,
  unlike the decorative chart fills we removed.

## Consistency checks

- New cards use `border-strong` edges + `border` inner dividers; never shadows.
- Numeric text always `.tnum`. Micro-labels always uppercase-tracked `text-fg-3`.
- A model's color must be consistent across its spine, line, hero, and leader
  wash — pull from `assignColors`/`MODEL_PALETTE`, never hardcode per place.
- Keep model-identity and holdings palettes separate (different jobs).
