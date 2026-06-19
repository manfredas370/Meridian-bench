// Store selector. Defaults to Supabase when SUPABASE_URL is configured,
// otherwise the in-memory store (zero-config local demo). Force either with
// the STORE env var: STORE=memory | STORE=supabase.

import { getFileStore } from "@/lib/store/file";
import { getMemoryStore } from "@/lib/store/memory";
import { getSupabaseStore } from "@/lib/store/supabase";
import type { Store } from "@/lib/store/types";

// Default (no Supabase): a file-backed store. State must be shared across
// Next's separate RSC / route-handler module graphs, which a process-global
// singleton is NOT under Turbopack dev — so "memory" is opt-in for tests only.
export function getStore(): Store {
  const backend = process.env.STORE ?? (process.env.SUPABASE_URL ? "supabase" : "file");
  if (backend === "supabase") return getSupabaseStore();
  if (backend === "memory") return getMemoryStore();
  return getFileStore();
}

export type { Store } from "@/lib/store/types";
