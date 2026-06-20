import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Meridian Bench",
  description: "A multi-LLM paper-trading arena — same $1000, same rules, same data; only the model differs.",
};

function MeridianMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="8.5" stroke="var(--accent)" strokeWidth="1.5" opacity="0.45" />
      <circle cx="11" cy="11" r="2" fill="var(--accent)" />
      <line x1="2" y1="11" x2="20" y2="11" stroke="var(--accent)" strokeWidth="1.5" />
    </svg>
  );
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full`}>
      <body className="flex min-h-full flex-col">
        <header className="sticky top-0 z-20 border-b border-border bg-white/90 backdrop-blur">
          <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-5">
            <Link href="/" className="flex items-center gap-2.5">
              <MeridianMark />
              <span className="text-[15px] font-medium tracking-tight text-fg">Meridian Bench</span>
              <span className="hidden text-[13px] text-fg-3 sm:inline">multi-LLM trading arena</span>
            </Link>
            <span className="hidden text-xs text-fg-muted sm:inline">paper trading · no real capital</span>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8">{children}</main>
      </body>
    </html>
  );
}
