"use client";

// Tabbed standings for the home page: switch between the parallel live runs
// (Price only / Fundamentals + News) in place, with an animated sliding
// underline. The per-tab content is server-rendered and passed in as children.

import { Children, type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";

import { ScenarioLauncher } from "@/components/ScenarioLauncher";

export interface StandingsTab {
  id: string;
  label: string;
  tier: "price" | "fundamentals";
}

function TierIcon({ tier }: { tier: StandingsTab["tier"] }) {
  // price = candlesticks; fundamentals = document — drawn inline (no icon dep).
  return tier === "fundamentals" ? (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M4 2.5h6l2.5 2.5v8.5h-8.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M6 7h4M6 9.5h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  ) : (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M4 3v10M12 3v10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <rect x="2.5" y="6" width="3" height="5" rx="0.7" stroke="currentColor" strokeWidth="1.3" />
      <rect x="10.5" y="4.5" width="3" height="5" rx="0.7" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

export function StandingsTabs({ tabs, children }: { tabs: StandingsTab[]; children: ReactNode }) {
  const panels = Children.toArray(children);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [bar, setBar] = useState({ left: 0, width: 0 });

  // Slide the underline under the active tab; re-measure on resize.
  useLayoutEffect(() => {
    const el = btnRefs.current[active];
    if (el) setBar({ left: el.offsetLeft, width: el.offsetWidth });
  }, [active, tabs.length]);
  useEffect(() => {
    const onResize = () => {
      const el = btnRefs.current[active];
      if (el) setBar({ left: el.offsetLeft, width: el.offsetWidth });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [active]);

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-strong">
        <div ref={listRef} className="relative flex">
          {tabs.map((t, i) => {
            const isActive = i === active;
            return (
              <button
                key={t.id}
                ref={(el) => {
                  btnRefs.current[i] = el;
                }}
                onClick={() => setActive(i)}
                className="group px-1 pb-2.5 pt-1"
                aria-selected={isActive}
                role="tab"
              >
                <span
                  className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    isActive ? "text-fg" : "text-fg-3 group-hover:bg-surface-2 group-hover:text-fg"
                  }`}
                >
                  <TierIcon tier={t.tier} />
                  {t.label}
                </span>
              </button>
            );
          })}
          <span
            className="absolute -bottom-px h-0.5 rounded-full bg-accent transition-all duration-300 ease-out"
            style={{ left: bar.left, width: bar.width }}
            aria-hidden
          />
        </div>
        <ScenarioLauncher sourceExperimentId={tabs[active].id} />
      </div>

      <div key={active} className="animate-tab-fade">
        {panels[active]}
      </div>
    </section>
  );
}
