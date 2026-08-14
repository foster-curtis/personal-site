/**
 * Feedback Analysis Module
 *
 * Uses LLM to analyze anonymous feedback responses and generate summaries.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { generateJSON } from "@/lib/llm";
import { FeedbackResponse, FeedbackSummary } from "@/lib/db/types";
import { FEEDBACK_QUESTIONS } from "./questions";

// Map question IDs to human-readable labels for the prompt
const questionLabels: Record<string, string> = Object.fromEntries(
  FEEDBACK_QUESTIONS.map((q) => [q.id, q.label])
);

export interface AnalysisInput {
  responses: FeedbackResponse[];
  ownerName: string;
}

interface LLMAnalysisOutput {
  summary_text: string;
  highlights: {
    strengths: string[];
    growth_areas: string[];
    themes: string[];
  };
  per_response_analysis: {
    response_id: string;
    sentiment_score: number; // 1-10 scale
    is_flagged: boolean;
    flag_reason: string | null;
  }[];
}

/**
 * Build the prompt for feedback analysis
 */
export function buildAnalysisPrompt(input: AnalysisInput): string {
  const { responses, ownerName } = input;

  // Format each response for the LLM
  const formattedResponses = responses.map((r, index) => {
    const metadata = r.metadata || {};
    const content = r.content || {};

    let text = `--- Response #${index + 1} (ID: ${r.id}) ---\n`;
    text += `Relationship: ${metadata.relationship || "Not specified"}\n`;
    if (metadata.worked_from || metadata.worked_to) {
      text += `Period: ${metadata.worked_from || "?"} to ${
        metadata.worked_to || "?"
      }\n`;
    }
    text += "\n";

    // Add content fields with their labels
    for (const [key, value] of Object.entries(content)) {
      if (value && typeof value === "string" && value.trim()) {
        const label = questionLabels[key] || key;
        text += `${label}:\n${value}\n\n`;
      }
    }

    return text;
  });

  return `You are analyzing anonymous peer feedback about ${ownerName}. 

Below are ${
    responses.length
  } feedback responses from people who have worked with ${ownerName}. Your job is to:

1. Write a professional summary (2-3 paragraphs) that captures the overall impression of ${ownerName} based on this feedback. Write in third person. Be balanced and fair.

2. Extract key highlights:
   - strengths: 3-5 notable strengths or positive themes mentioned
   - growth_areas: 1-3 areas for improvement (if mentioned), or leave empty if none
   - themes: 2-4 recurring themes across the feedback

3. For EACH response, provide:
   - sentiment_score: 1-10 where 1=very negative, 5=neutral, 10=very positive
   - is_flagged: true if the response is abusive, extremely negative/unhelpful, spam, or contains inappropriate content
   - flag_reason: if flagged, explain why (null otherwise)

FEEDBACK RESPONSES:

${formattedResponses.join("\n")}

Respond with JSON in this exact structure:
{
  "summary_text": "Professional summary paragraph(s) here...",
  "highlights": {
    "strengths": ["strength 1", "strength 2", ...],
    "growth_areas": ["area 1", ...] or [],
    "themes": ["theme 1", "theme 2", ...]
  },
  "per_response_analysis": [
    {
      "response_id": "uuid-here",
      "sentiment_score": 7,
      "is_flagged": false,
      "flag_reason": null
    },
    ...
  ]
}`;
}

/**
 * Run analysis on feedback responses using LLM
 */
export async function analyzeFeedback(
  input: AnalysisInput
): Promise<LLMAnalysisOutput> {
  const prompt = buildAnalysisPrompt(input);

  const result = await generateJSON<LLMAnalysisOutput>({
    prompt,
    systemInstruction: `You are an expert HR analyst helping create fair, balanced summaries of peer feedback. 
Be professional and constructive. Focus on patterns and themes rather than individual opinions.
Always respond with valid JSON matching the requested structure.`,
  });

  return result;
}

/**
 * Check if analysis should be skipped (no new feedback since last analysis)
 */
export async function shouldSkipAnalysis(
  requestId: string
): Promise<{
  skip: boolean;
  existingSummary: FeedbackSummary | null;
  currentCount: number;
}> {
  const supabase = createAdminClient();

  // Get current response count for this request
  const { count: currentCount, error: countError } = await supabase
    .from("feedback_responses")
    .select("*", { count: "exact", head: true })
    .eq("request_id", requestId);

  if (countError) {
    console.error("Error counting responses:", countError);
    return { skip: false, existingSummary: null, currentCount: 0 };
  }

  // Get latest summary for this request
  const { data: latestSummary, error: summaryError } = await supabase
    .from("feedback_summaries")
    .select("*")
    .eq("request_id", requestId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (summaryError || !latestSummary) {
    // No existing summary, don't skip
    return {
      skip: false,
      existingSummary: null,
      currentCount: currentCount || 0,
    };
  }

  // Compare counts
  if (latestSummary.response_count_at_analysis >= (currentCount || 0)) {
    // No new feedback, skip analysis
    return {
      skip: true,
      existingSummary: latestSummary as FeedbackSummary,
      currentCount: currentCount || 0,
    };
  }

  return {
    skip: false,
    existingSummary: null,
    currentCount: currentCount || 0,
  };
}

/**
 * Save analysis results to database
 */
export async function saveAnalysisResults(
  requestId: string,
  analysis: LLMAnalysisOutput,
  responseCount: number
): Promise<FeedbackSummary> {
  const supabase = createAdminClient();

  // Save the summary
  const { data: summary, error: summaryError } = await supabase
    .from("feedback_summaries")
    .insert({
      request_id: requestId,
      summary_text: analysis.summary_text,
      highlights: analysis.highlights,
      response_count_at_analysis: responseCount,
    })
    .select()
    .single();

  if (summaryError) {
    console.error("Error saving summary:", summaryError);
    throw new Error("Failed to save feedback summary");
  }

  // Update individual responses with sentiment scores and flags
  for (const responseAnalysis of analysis.per_response_analysis) {
    const { error: updateError } = await supabase
      .from("feedback_responses")
      .update({
        sentiment_score: responseAnalysis.sentiment_score,
        is_flagged: responseAnalysis.is_flagged,
        flag_reason: responseAnalysis.flag_reason,
      })
      .eq("id", responseAnalysis.response_id);

    if (updateError) {
      console.error(
        `Error updating response ${responseAnalysis.response_id}:`,
        updateError
      );
      // Continue with other responses rather than failing completely
    }
  }

  return summary as FeedbackSummary;
}

/**
 * Get feedback responses for analysis (excluding deleted ones)
 */
export async function getResponsesForAnalysis(
  requestId: string
): Promise<FeedbackResponse[]> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("feedback_responses")
    .select("*")
    .eq("request_id", requestId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Error fetching responses:", error);
    throw new Error("Failed to fetch feedback responses");
  }

  return (data || []) as FeedbackResponse[];
}

/**
 * Get the latest public summary (for public-facing page)
 * Aggregates across all requests to give a holistic view
 */
export async function getPublicFeedbackSummary(): Promise<{
  summary_text: string;
  highlights: { strengths: string[]; growth_areas: string[]; themes: string[] };
  responder_count: number;
  generated_at: string;
} | null> {
  const supabase = createAdminClient();
  const ownerEmail = process.env.OWNER_EMAIL;

  if (!ownerEmail) {
    return null;
  }

  // Get owner's requests
  const { data: ownerBlocks } = await supabase
    .from("content_blocks")
    .select("owner_id")
    .limit(1);

  if (!ownerBlocks || ownerBlocks.length === 0) {
    return null;
  }

  const ownerId = ownerBlocks[0].owner_id;

  // Get all active requests for this owner
  const { data: requests } = await supabase
    .from("feedback_requests")
    .select("id")
    .eq("owner_id", ownerId)
    .eq("is_active", true);

  if (!requests || requests.length === 0) {
    return null;
  }

  const requestIds = requests.map((r) => r.id);

  // Get latest summaries for these requests
  const { data: summaries } = await supabase
    .from("feedback_summaries")
    .select("*")
    .in("request_id", requestIds)
    .order("created_at", { ascending: false });

  if (!summaries || summaries.length === 0) {
    return null;
  }

  // Get unique responder count (non-flagged responses only)
  const { count: responderCount } = await supabase
    .from("feedback_responders")
    .select("*", { count: "exact", head: true })
    .in("request_id", requestIds);

  // For now, just use the most recent summary
  // In a more sophisticated version, you could aggregate multiple summaries
  const latestSummary = summaries[0];

  return {
    summary_text: latestSummary.summary_text,
    highlights: latestSummary.highlights as {
      strengths: string[];
      growth_areas: string[];
      themes: string[];
    },
    responder_count: responderCount || 0,
    generated_at: latestSummary.created_at,
  };
}
