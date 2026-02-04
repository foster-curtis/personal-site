import { NextResponse } from "next/server";
import { getPublicFeedbackSummary } from "@/lib/feedback/analysis";
import { logger } from "@/lib/logging";

/**
 * GET /api/feedback/public-summary
 * Public endpoint to get aggregated peer feedback summary.
 * Returns sanitized, aggregated summary only - no raw response text.
 *
 * Privacy guarantees:
 * - Only returns aggregated summary text (no individual responses)
 * - Requires minimum 2 respondents to prevent de-anonymization
 * - No raw response content is ever exposed
 */
export async function GET() {
  const startTime = performance.now();

  try {
    const summary = await getPublicFeedbackSummary();

    if (!summary) {
      return NextResponse.json(
        {
          available: false,
          message: "No peer feedback available yet",
        },
        { status: 200 }
      );
    }

    // Only return if there's meaningful content and enough respondents
    // to maintain anonymity (require at least 2 respondents)
    if (summary.responder_count < 2) {
      return NextResponse.json(
        {
          available: false,
          message: "Not enough feedback collected yet for a summary",
        },
        { status: 200 }
      );
    }

    const durationMs = Math.round(performance.now() - startTime);
    logger.info(
      "feedback.public_summary.served",
      "Public feedback summary served",
      {
        responder_count: summary.responder_count,
        duration_ms: durationMs,
      }
    );

    return NextResponse.json({
      available: true,
      summary_text: summary.summary_text,
      highlights: summary.highlights,
      responder_count: summary.responder_count,
      generated_at: summary.generated_at,
    });
  } catch (error) {
    logger.error(
      "feedback.public_summary.error",
      error,
      "Failed to get public feedback summary"
    );
    return NextResponse.json(
      { error: "Failed to get feedback summary" },
      { status: 500 }
    );
  }
}
