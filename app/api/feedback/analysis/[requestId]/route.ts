import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUser, isOwner } from "@/lib/auth";
import { FeedbackAnalysisResult, FeedbackSummary } from "@/lib/db/types";

/**
 * GET /api/feedback/analysis/[requestId]
 * Get the latest analysis summary and stats for a feedback request.
 * Owner-only.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  try {
    const user = await getUser();

    if (!user || !isOwner(user)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { requestId } = await params;
    const supabase = await createClient();

    // Verify the request belongs to this owner
    const { data: feedbackRequest, error: requestError } = await supabase
      .from("feedback_requests")
      .select("*")
      .eq("id", requestId)
      .eq("owner_id", user.id)
      .single();

    if (requestError || !feedbackRequest) {
      return NextResponse.json(
        { error: "Feedback request not found" },
        { status: 404 }
      );
    }

    // Get the latest summary
    const { data: summary, error: summaryError } = await supabase
      .from("feedback_summaries")
      .select("*")
      .eq("request_id", requestId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    // Get response stats
    const { data: responses, error: responsesError } = await supabase
      .from("feedback_responses")
      .select("id, created_at, is_flagged, sentiment_score, metadata")
      .eq("request_id", requestId);

    if (responsesError) {
      console.error("Error fetching responses:", responsesError);
    }

    // Get responder count
    const { count: responderCount, error: responderError } = await supabase
      .from("feedback_responders")
      .select("*", { count: "exact", head: true })
      .eq("request_id", requestId);

    if (responderError) {
      console.error("Error counting responders:", responderError);
    }

    // Calculate stats
    const responseList = responses || [];
    const flaggedCount = responseList.filter((r) => r.is_flagged).length;
    const sentimentScores = responseList
      .map((r) => r.sentiment_score)
      .filter((s): s is number => s !== null);
    const avgSentiment =
      sentimentScores.length > 0
        ? sentimentScores.reduce((a, b) => a + b, 0) / sentimentScores.length
        : null;

    const result: FeedbackAnalysisResult = {
      summary: summary ? (summary as FeedbackSummary) : null,
      stats: {
        response_count: responseList.length,
        responder_count: responderCount || 0,
        flagged_count: flaggedCount,
        average_sentiment: avgSentiment,
      },
      responses_summary: responseList.map((r) => ({
        id: r.id,
        created_at: r.created_at,
        is_flagged: r.is_flagged,
        sentiment_score: r.sentiment_score,
        relationship: r.metadata?.relationship || null,
      })),
      skipped: false,
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error in GET /api/feedback/analysis/[requestId]:", error);
    return NextResponse.json(
      { error: "Failed to get analysis" },
      { status: 500 }
    );
  }
}
