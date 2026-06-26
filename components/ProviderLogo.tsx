"use client";

// Small provider brand mark next to a model name, derived from its gateway slug
// (e.g. "anthropic/claude-opus-4.8" → Anthropic). Uses a keyless favicon source;
// hides itself on load failure so the row never breaks.

import { useState } from "react";

const DOMAINS: Record<string, string> = {
  anthropic: "anthropic.com",
  openai: "openai.com",
  google: "google.com",
  deepseek: "deepseek.com",
  moonshotai: "moonshot.ai",
};

export function ProviderLogo({ modelId }: { modelId: string }) {
  const provider = modelId.split("/")[0];
  const domain = DOMAINS[provider];
  const [ok, setOk] = useState(true);
  if (!domain || !ok) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`}
      alt=""
      width={16}
      height={16}
      loading="lazy"
      onError={() => setOk(false)}
      className="h-4 w-4 shrink-0 rounded-[3px] object-contain"
    />
  );
}
