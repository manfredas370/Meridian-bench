"use client";

// A ticker shown with its company logo, linking to the stock's quote page.
// The logo is a keyless image; on failure it falls back to a 2-letter monogram
// so the row never breaks.

import { useState } from "react";

export function TickerBadge({ ticker }: { ticker: string }) {
  const [logoOk, setLogoOk] = useState(true);
  return (
    <a
      href={`https://finance.yahoo.com/quote/${ticker}`}
      target="_blank"
      rel="noopener noreferrer"
      className="group inline-flex items-center gap-2 font-medium text-fg transition-colors hover:text-accent"
      title={`${ticker} — open on Yahoo Finance`}
    >
      {logoOk ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`https://financialmodelingprep.com/image-stock/${ticker}.png`}
          alt=""
          width={18}
          height={18}
          loading="lazy"
          onError={() => setLogoOk(false)}
          className="h-[18px] w-[18px] shrink-0 rounded-[4px] bg-white object-contain ring-1 ring-border"
        />
      ) : (
        <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[4px] bg-surface-3 text-[9px] font-semibold text-fg-3">
          {ticker.slice(0, 2)}
        </span>
      )}
      <span className="group-hover:underline">{ticker}</span>
    </a>
  );
}
