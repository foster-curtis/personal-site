import { evalite } from "evalite";
import { POST } from "../app/api/job-compare/route";
import { jsonRequest } from "./helpers/next-request";
import { JobCompareAnalysisSchema } from "./helpers/job-compare-schema";
import { JOB_DESCRIPTIONS } from "./fixtures/job-descriptions";

/**
 * Category 3 (blocking-eligible) — schema conformance.
 *
 * This is contract testing over an LLM's output: deterministic enough to gate CI on, unlike
 * the judged answer-quality checks elsewhere in this suite, even though it involves a real
 * model call (see plans/07-rag-evals.md). Runs /api/job-compare against real, varied job
 * descriptions and Zod-validates every response.
 *
 * Needs OWNER_EMAIL's real content_blocks (resume/story/qa) to already exist in the target
 * Supabase project — unlike retrieval-quality, this reads real owner content rather than
 * seeding a fixture, so there's no local-only requirement here.
 *
 * Hard rule: run each input multiple times (trialCount: 3), not once — the route's own
 * regex-based JSON extraction (rather than Gemini structured-output mode) means format
 * drift is exactly the kind of failure that won't show up on every single sample.
 *
 * To run this eval alone with a hard CI gate once Phase 08 wires up blocking checks:
 *   evalite run schema-conformance.eval.ts --threshold 100
 */
evalite("schema conformance - job-compare", {
  trialCount: 3,
  data: () =>
    JOB_DESCRIPTIONS.map((jobDescription) => ({
      input: jobDescription,
      expected: true,
    })),
  task: async (jobDescription: string): Promise<{ analysis: unknown }> => {
    const res = await POST(jsonRequest("/api/job-compare", { jobDescription }));
    const body = await res.json();
    if (!res.ok) {
      throw new Error(`evals/: /api/job-compare returned ${res.status}: ${JSON.stringify(body)}`);
    }
    return body;
  },
  scorers: [
    {
      name: "schema-conformance",
      description:
        "1 if response.analysis validates against the documented job-compare schema, else 0.",
      scorer: ({ output }) => {
        const result = JobCompareAnalysisSchema.safeParse(output.analysis);
        return {
          score: result.success ? 1 : 0,
          metadata: result.success ? undefined : { issues: result.error.issues },
        };
      },
    },
  ],
});
