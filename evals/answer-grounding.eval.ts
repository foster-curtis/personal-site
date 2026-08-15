import { evalite } from "evalite";
import { Factuality } from "autoevals";
import { POST } from "../app/api/chat/route";
import { jsonRequest } from "./helpers/next-request";
import { seedKnowledgeBase } from "./helpers/knowledge-base-seed";
import { JUDGE_MODEL } from "./helpers/gemini-openai-client";
import { NO_CONTEXT_QUESTIONS } from "./fixtures/no-context-questions";

/**
 * Category 2 (nightly, non-blocking) — answer grounding.
 *
 * lib/rag.ts's buildSystemPrompt explicitly instructs the model to only answer from
 * provided context and to say so when it can't. Nothing else in the codebase verifies the
 * model actually follows that instruction. This runs real off-topic questions through the
 * real chat route (app/api/chat/route.ts) against a populated fixture knowledge base — the
 * knowledge base needs to actually have *other* content for "no context for this specific
 * question" to mean anything, hence seeding it here too rather than querying an empty DB.
 *
 * Judged by an LLM (autoevals' Factuality, routed to Gemini — see
 * helpers/gemini-openai-client.ts), so this is inherently probabilistic: keep it
 * nightly/non-blocking per plans/07-rag-evals.md, and never snapshot the raw model text.
 *
 * Hard rule: run each prompt multiple times, not once (trialCount: 3) — a single sample of
 * a judged, non-deterministic pipeline is a coin flip with extra steps.
 */
const HEDGE_REFERENCE_ANSWER =
  "I don't have information about that in the context I was given, so I can't answer that " +
  "question — I can only answer based on what's in my knowledge base.";

evalite("answer grounding - declines when context is missing", {
  trialCount: 3,
  data: async () => {
    await seedKnowledgeBase();
    return NO_CONTEXT_QUESTIONS.map((question) => ({
      input: question,
      expected: HEDGE_REFERENCE_ANSWER,
    }));
  },
  task: async (question: string): Promise<string> => {
    const res = await POST(jsonRequest("/api/chat", { message: question }));
    const body = await res.json();
    if (!res.ok) {
      throw new Error(`evals/: /api/chat returned ${res.status}: ${JSON.stringify(body)}`);
    }
    return body.response as string;
  },
  scorers: [
    (opts) => Factuality({ ...opts, model: JUDGE_MODEL }),
  ],
});
