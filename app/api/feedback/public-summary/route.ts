import { NextResponse } from "next/server";
import { getPublicFeedbackSummary } from "@/lib/feedback/analysis";

/**
 * GET /api/feedback/public-summary
 * Public endpoint to get aggregated peer feedback summary.
 * Returns sanitized, aggregated summary only - no raw response text.
 */
export async function GET() {
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

    return NextResponse.json({
      available: true,
      summary_text: summary.summary_text,
      highlights: summary.highlights,
      responder_count: summary.responder_count,
      generated_at: summary.generated_at,
    });
  } catch (error) {
    console.error("Error in GET /api/feedback/public-summary:", error);
    return NextResponse.json(
      { error: "Failed to get feedback summary" },
      { status: 500 }
    );
  }
}
