import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUser, isOwner } from "@/lib/auth";

/**
 * GET /api/feedback/requests/[id]
 * Get detailed view of a single feedback request (owner-only).
 * Returns aggregated stats, not raw response text.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getUser();

    if (!user || !isOwner(user)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const supabase = await createClient();

    // Fetch the request
    const { data: feedbackRequest, error: requestError } = await supabase
      .from("feedback_requests")
      .select("*")
      .eq("id", id)
      .eq("owner_id", user.id)
      .single();

    if (requestError || !feedbackRequest) {
      return NextResponse.json(
        { error: "Feedback request not found" },
        { status: 404 }
      );
    }

    // Fetch links
    const { data: links, error: linksError } = await supabase
      .from("feedback_links")
      .select("*")
      .eq("request_id", id);

    if (linksError) {
      console.error("Error fetching links:", linksError);
    }

    // Count responses
    const { data: responses, error: responsesError } = await supabase
      .from("feedback_responses")
      .select("id, created_at, is_flagged, sentiment_score")
      .eq("request_id", id);

    if (responsesError) {
      console.error("Error fetching responses:", responsesError);
    }

    // Count responders
    const { data: responders, error: respondersError } = await supabase
      .from("feedback_responders")
      .select("id, created_at")
      .eq("request_id", id);

    if (respondersError) {
      console.error("Error fetching responders:", respondersError);
    }

    // Aggregate stats (no raw text)
    const responseCount = (responses || []).length;
    const flaggedCount = (responses || []).filter((r) => r.is_flagged).length;
    const responderCount = (responders || []).length;

    // Calculate average sentiment (if available)
    const sentimentScores = (responses || [])
      .map((r) => r.sentiment_score)
      .filter((s): s is number => s !== null);
    const avgSentiment =
      sentimentScores.length > 0
        ? sentimentScores.reduce((a, b) => a + b, 0) / sentimentScores.length
        : null;

    return NextResponse.json({
      data: {
        ...feedbackRequest,
        links: links || [],
        stats: {
          response_count: responseCount,
          responder_count: responderCount,
          flagged_count: flaggedCount,
          average_sentiment: avgSentiment,
        },
        // Return minimal response metadata (no content)
        responses_summary: (responses || []).map((r) => ({
          id: r.id,
          created_at: r.created_at,
          is_flagged: r.is_flagged,
          sentiment_score: r.sentiment_score,
        })),
      },
    });
  } catch (error) {
    console.error("Error in GET /api/feedback/requests/[id]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
