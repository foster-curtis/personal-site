import { z } from "zod";

/** Mirrors the LLMAnalysisOutput shape lib/feedback/analysis.ts's prompt promises. */
export const FeedbackAnalysisOutputSchema = z.object({
  summary_text: z.string().min(1),
  highlights: z.object({
    strengths: z.array(z.string()),
    growth_areas: z.array(z.string()),
    themes: z.array(z.string()),
  }),
  per_response_analysis: z.array(
    z.object({
      response_id: z.string(),
      sentiment_score: z.number().min(1).max(10),
      is_flagged: z.boolean(),
      flag_reason: z.string().nullable(),
    })
  ),
});
