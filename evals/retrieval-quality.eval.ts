import { evalite } from "evalite";
import { getBlockMetadata, prioritizeChunks, retrieveRelevantChunks } from "../lib/rag";
import { seedKnowledgeBase } from "./helpers/knowledge-base-seed";
import { GOLDEN_QUESTIONS } from "./fixtures/golden-questions";

/**
 * Category 1 (blocking-eligible) — retrieval quality, scored as recall@5.
 *
 * Hard rules from plans/07-rag-evals.md, restated here since they're easy to erode:
 *   1. Never snapshot-test LLM output — not applicable to this file (no generation call),
 *      but the same "assert structure/scores, not raw text" spirit applies: we assert
 *      block-id membership, never chunk text equality.
 *   2. Never grade on a single sample. This eval's sample size is the 36-question golden
 *      set itself (see fixtures/golden-questions.ts) — no per-question repetition
 *      (`trialCount`) is needed, since retrieval has no generation step and embeddings are
 *      far more stable run-to-run than a chat completion.
 *
 * Target: recall@5 >= 0.80 (see plans/07-rag-evals.md for why 0.80 is the bar). The score
 * evalite reports for this eval *is* recall@5 directly, since every scorer here returns
 * exactly 0 or 1.
 *
 * To run this eval alone with a hard CI gate once Phase 08 wires up blocking checks:
 *   evalite run retrieval-quality.eval.ts --threshold 80
 */
evalite("retrieval quality - recall@5", {
  data: async () => {
    const keyToBlockId = await seedKnowledgeBase();
    return GOLDEN_QUESTIONS.map(({ question, expectedBlockKey }) => {
      const expectedBlockId = keyToBlockId.get(expectedBlockKey);
      if (!expectedBlockId) {
        throw new Error(
          `evals/: golden question references unknown fixture key "${expectedBlockKey}" ` +
            `(see fixtures/knowledge-base.ts)`
        );
      }
      return { input: question, expected: expectedBlockId };
    });
  },
  task: async (question: string): Promise<string[]> => {
    // Mirrors app/api/chat/route.ts's retrieval steps exactly (retrieve 10 candidates,
    // prioritize down to the 5 actually used) so this eval tracks the real production path.
    const allChunks = await retrieveRelevantChunks(question, 10, 0.3);
    const blockIds = [...new Set(allChunks.map((c) => c.content_block_id))];
    const blockMetadata = await getBlockMetadata(blockIds);
    const top5 = prioritizeChunks(allChunks, blockMetadata, 5);
    return top5.map((c) => c.content_block_id);
  },
  scorers: [
    {
      name: "recall@5",
      description: "1 if the expected content block is among the top-5 retrieved chunks, else 0.",
      scorer: ({ output, expected }) => (output.includes(expected!) ? 1 : 0),
    },
  ],
});
