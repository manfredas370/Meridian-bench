"use client";

// Owner-only "Stress test" control. Picks a chaos preset, forks the live run
// into a sandbox scenario (real models, synthetic shock), and navigates to it.
// Gated by CRON_SECRET, collected once and kept in sessionStorage.

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { SCENARIO_PRESETS } from "@/lib/scenarios";

const SECRET_KEY = "meridian_cron_secret";

export function ScenarioLauncher({ sourceExperimentId }: { sourceExperimentId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // Close the menu on outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  async function launch(presetId: string) {
    setError(null);
    let secret = sessionStorage.getItem(SECRET_KEY) ?? "";
    if (!secret) {
      secret = window.prompt("Enter the owner secret (CRON_SECRET) to run a stress test:") ?? "";
      if (!secret) return;
      sessionStorage.setItem(SECRET_KEY, secret);
    }
    setOpen(false);
    setRunning(presetId);
    try {
      const res = await fetch("/api/scenario", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-cron-secret": secret },
        body: JSON.stringify({ sourceExperimentId, presetId }),
      });
      if (res.status === 401) {
        sessionStorage.removeItem(SECRET_KEY);
        throw new Error("Unauthorized — secret cleared, try again.");
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`);
      router.push(`/experiment/${data.scenarioExperimentId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRunning(null);
    }
  }

  return (
    <div className="relative" ref={ref}>
      {running ? (
        <button
          disabled
          style={{ backgroundColor: "#2A2B30" }}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-white opacity-70"
        >
          <Spinner /> Running stress test…
        </button>
      ) : (
        // Split button group: label + a joined chevron trigger (both open the menu).
        <div
          style={{ backgroundColor: "#2A2B30" }}
          className="inline-flex items-stretch overflow-hidden rounded-lg"
        >
          <button
            onClick={() => setOpen((v) => !v)}
            className="px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-white/10"
          >
            Stress test
          </button>
          <span className="w-px self-stretch bg-white/15" aria-hidden />
          <button
            onClick={() => setOpen((v) => !v)}
            aria-label="Choose a scenario"
            aria-expanded={open}
            className="flex items-center px-2 text-white/80 transition-colors hover:bg-white/10"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
              <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      )}

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-80 overflow-hidden rounded-xl border border-border bg-white shadow-lg">
          <div className="border-b border-border px-4 py-2.5 text-xs text-fg-3">
            Forks this run into a sandbox and applies a synthetic shock. The live run is untouched.
          </div>
          {SCENARIO_PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => launch(p.id)}
              className="block w-full border-b border-border px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-surface-2"
            >
              <div className="text-sm font-medium text-fg">{p.label}</div>
              <div className="mt-0.5 text-xs leading-relaxed text-fg-3">{p.description}</div>
            </button>
          ))}
        </div>
      )}

      {error && <p className="absolute right-0 mt-2 w-80 text-xs text-loss">{error}</p>}
    </div>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin" width="13" height="13" viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
