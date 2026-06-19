// Seed an experiment into the configured store.
//   npm run seed
// Env is loaded via `--env-file-if-exists` (see package.json). With Supabase
// configured this persists; with the in-memory store it only lives for this
// process (use POST /api/dev/seed to seed the running dev server instead).

import { seedExperiment } from "@/lib/seed";
import { getStore } from "@/lib/store";

async function main() {
  const today = new Date().toISOString().slice(0, 10);
  const { experiment, participants } = await seedExperiment(getStore(), `Meridian Bench ${today}`);
  const backend = process.env.STORE ?? (process.env.SUPABASE_URL ? "supabase" : "memory");
  console.log(`✓ Seeded experiment ${experiment.id} with ${participants.length} participants.`);
  console.log(`  Store backend: ${backend}`);
  if (backend === "memory") {
    console.log("  ⚠ in-memory store: not shared with the dev server. Use POST /api/dev/seed instead.");
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
