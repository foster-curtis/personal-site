import { z } from "zod";

/**
 * The shape app/api/job-compare/route.ts's prompt promises the model will return (see the
 * JSON template inline in that file, and docs/api-reference.md#job-comparison). The route
 * does its own regex-based JSON extraction rather than Gemini structured-output mode, so
 * this schema is the only thing standing between "the model drifted off-format" and a
 * silently broken /job-compare page.
 */
export const JobCompareAnalysisSchema = z.object({
  overallMatch: z.enum(["strong", "moderate", "developing"]),
  matchScore: z.number().min(1).max(100),
  summary: z.string().min(1),
  strengths: z.array(
    z.object({
      area: z.string(),
      evidence: z.string(),
      relevance: z.string(),
    })
  ),
  partialMatches: z.array(
    z.object({
      requirement: z.string(),
      candidateExperience: z.string(),
      gap: z.string(),
      transferability: z.string(),
    })
  ),
  gaps: z.array(
    z.object({
      requirement: z.string(),
      assessment: z.string(),
      mitigation: z.string(),
    })
  ),
  recommendation: z.object({
    hire: z.boolean(),
    confidence: z.enum(["high", "medium", "low"]),
    reasoning: z.string(),
    interviewFocus: z.array(z.string()),
  }),
});
