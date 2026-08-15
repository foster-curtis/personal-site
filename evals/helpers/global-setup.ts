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
 */
export default async function setup() {
  return async function teardown() {
    await teardownKnowledgeBase();
  };
}
