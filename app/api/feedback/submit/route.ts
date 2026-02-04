import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { FeedbackFormSubmission } from "@/lib/db/types";

/**
 * POST /api/feedback/submit
 * Public endpoint to submit anonymous feedback.
 * Uses admin client to bypass RLS for anonymous submissions.
 */
export async function POST(request: NextRequest) {
  try {
    const body: FeedbackFormSubmission = await request.json();

    if (!body.token) {
      return NextResponse.json({ error: "Token is required" }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Validate token and fetch link
    const { data: link, error: linkError } = await supabase
      .from("feedback_links")
      .select("*")
      .eq("token", body.token)
      .single();

    if (linkError || !link) {
      return NextResponse.json(
        { error: "Invalid or expired feedback link" },
        { status: 404 }
      );
    }

    // Check if link is expired
    if (link.expires_at) {
      const expiresAt = new Date(link.expires_at);
      if (expiresAt < new Date()) {
        return NextResponse.json(
          { error: "This feedback link has expired" },
          { status: 410 }
        );
      }
    }

    // Check submission limit
    if (
      link.max_submissions !== null &&
      link.submission_count >= link.max_submissions
    ) {
      return NextResponse.json(
        { error: "This feedback link has reached its submission limit" },
        { status: 410 }
      );
    }

    // Verify request is active
    const { data: feedbackRequest, error: requestError } = await supabase
      .from("feedback_requests")
      .select("*")
      .eq("id", link.request_id)
      .single();

    if (requestError || !feedbackRequest) {
      return NextResponse.json(
        { error: "Feedback request not found" },
        { status: 404 }
      );
    }

    if (!feedbackRequest.is_active) {
      return NextResponse.json(
        { error: "This feedback request is no longer active" },
        { status: 410 }
      );
    }

    // Check if we need to create a new responder or use existing
    // For simplicity, we'll create a new responder for each submission
    // In a more sophisticated system, you might use cookies/localStorage to correlate
    const { data: responder, error: responderError } = await supabase
      .from("feedback_responders")
      .insert({
        request_id: link.request_id,
        link_id: link.id,
      })
      .select()
      .single();

    if (responderError) {
      console.error("Error creating responder:", responderError);
      return NextResponse.json(
        { error: "Failed to create responder record" },
        { status: 500 }
      );
    }

    // Create the feedback response
    const { data: response, error: responseError } = await supabase
      .from("feedback_responses")
      .insert({
        responder_id: responder.id,
        request_id: link.request_id,
        metadata: body.metadata || {},
        content: body.content || {},
        sentiment_score: null, // Will be set by AI analysis in Phase 5
        is_flagged: false,
        flag_reason: null,
      })
      .select()
      .single();

    if (responseError) {
      console.error("Error creating feedback response:", responseError);
      return NextResponse.json(
        { error: "Failed to submit feedback" },
        { status: 500 }
      );
    }

    // Increment submission count on the link
    const { error: updateError } = await supabase
      .from("feedback_links")
      .update({ submission_count: link.submission_count + 1 })
      .eq("id", link.id);

    if (updateError) {
      console.error("Error updating submission count:", updateError);
      // Don't fail the request - submission was successful
    }

    return NextResponse.json(
      {
        success: true,
        message: "Thank you for your feedback!",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error in POST /api/feedback/submit:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
