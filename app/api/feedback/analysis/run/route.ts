import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUser, isOwner } from "@/lib/auth";
import {
  shouldSkipAnalysis,
  getResponsesForAnalysis,
  analyzeFeedback,
  saveAnalysisResults,
} from "@/lib/feedback/analysis";

/**
 * POST /api/feedback/analysis/run
 * Run AI analysis on feedback responses for a specific request.
 * Owner-only. Skips if no new feedback since last analysis.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getUser();

    if (!user || !isOwner(user)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { request_id } = body;

    if (!request_id) {
      return NextResponse.json(
        { error: "request_id is required" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Verify the request belongs to this owner
    const { data: feedbackRequest, error: requestError } = await supabase
      .from("feedback_requests")
      .select("*")
      .eq("id", request_id)
      .eq("owner_id", user.id)
      .single();

    if (requestError || !feedbackRequest) {
      return NextResponse.json(
        { error: "Feedback request not found" },
        { status: 404 }
      );
    }

    // Check if we should skip analysis
    const { skip, existingSummary, currentCount } = await shouldSkipAnalysis(
      request_id
    );

    if (skip && existingSummary) {
      return NextResponse.json({
        skipped: true,
        message: "No new feedback since last analysis",
        summary: existingSummary,
        response_count: currentCount,
      });
    }

    // Check if there are any responses to analyze
    if (currentCount === 0) {
      return NextResponse.json({
        skipped: true,
        message: "No feedback responses to analyze yet",
        summary: null,
        response_count: 0,
      });
    }

    // Get responses for analysis
    const responses = await getResponsesForAnalysis(request_id);

    if (responses.length === 0) {
      return NextResponse.json({
        skipped: true,
        message: "No feedback responses to analyze",
        summary: null,
        response_count: 0,
      });
    }

    // Run the analysis
    const ownerName = process.env.OWNER_NAME || "the candidate";
    const analysisOutput = await analyzeFeedback({
      responses,
      ownerName,
    });

    // Save results
    const summary = await saveAnalysisResults(
      request_id,
      analysisOutput,
      responses.length
    );

    return NextResponse.json({
      skipped: false,
      message: "Analysis completed successfully",
      summary,
      response_count: responses.length,
      flagged_count: analysisOutput.per_response_analysis.filter(
        (r) => r.is_flagged
      ).length,
    });
  } catch (error) {
    console.error("Error in POST /api/feedback/analysis/run:", error);
    return NextResponse.json(
      { error: "Failed to run analysis" },
      { status: 500 }
    );
  }
}
