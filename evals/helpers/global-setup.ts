import { loadEnvLocal } from "../setup/env";
import { teardownKnowledgeBase } from "./knowledge-base-seed";

/**
 * Vitest `globalSetup`: runs once for the whole `evalite run` process, separate from (and
 * after) every worker that actually executes `.eval.ts` files. This is the only reliable
 * place to guarantee fixture cleanup runs exactly once regardless of how many eval files
 * seeded/read the shared knowledge base, or whether any of them failed.
 *
 * There's no corresponding seed step here on purpose — retrieval-quality.eval.ts and
 * answer-grounding.eval.ts each seed idempotently inside their own `data()`, since a
 * globalSetup function can't hand data back to eval files running in a different process.
 *
 * globalSetup runs in a separate process from the workers that get `setupFiles` applied to
 * them, so `.env.local` is never loaded here otherwise — confirmed the hard way: without
 * this, teardownKnowledgeBase() saw an empty NEXT_PUBLIC_SUPABASE_URL and (correctly, given
 * an empty string isn't local) refused to run.
 */
export default async function setup() {
  loadEnvLocal();
  return async function teardown() {
    await teardownKnowledgeBase();
  };
}
