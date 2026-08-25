// Store selector.
//
// When the bundled archive (data/archive.json) contains a concluded run, it is
// served read-only by default — even over a configured SUPABASE_URL — so the
// public site never depends on a live database that can pause or disappear.
// STORE=memory|file still force the mutable local backends (tests / dev), and
// emptying data/archive.json restores the old behavior: Supabase when
// SUPABASE_URL is configured, otherwise the file store.

import { archiveHasData, getArchiveStore } from "@/lib/store/archive";
import { getFileStore } from "@/lib/store/file";
import { getMemoryStore } from "@/lib/store/memory";
import { getSupabaseStore } from "@/lib/store/supabase";
import type { Store } from "@/lib/store/types";

// Default (no Supabase, no archive): a file-backed store. State must be shared
// across Next's separate RSC / route-handler module graphs, which a
// process-global singleton is NOT under Turbopack dev — so "memory" is opt-in
// for tests only.
export function getStore(): Store {
  const forced = process.env.STORE;
  if (forced === "memory") return getMemoryStore();
  if (forced === "file") return getFileStore();
  if (forced === "archive" || archiveHasData()) return getArchiveStore();
  if (forced === "supabase" || process.env.SUPABASE_URL) return getSupabaseStore();
  return getFileStore();
}

export type { Store } from "@/lib/store/types";
