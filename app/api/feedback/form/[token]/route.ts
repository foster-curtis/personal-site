import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { FeedbackLink, FeedbackRequest } from "@/lib/db/types";

/**
 * GET /api/feedback/form/[token]
 * Public endpoint to validate a feedback link token and return form metadata.
 * Uses admin client to bypass RLS for anonymous access.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const supabase = createAdminClient();

    // Fetch the link by token
    const { data: link, error: linkError } = await supabase
      .from("feedback_links")
      .select("*")
      .eq("token", token)
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

    // Fetch the parent request
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

    // Check if request is active
    if (!feedbackRequest.is_active) {
      return NextResponse.json(
        { error: "This feedback request is no longer active" },
        { status: 410 }
      );
    }

    // Check if request is expired
    if (feedbackRequest.expires_at) {
      const expiresAt = new Date(feedbackRequest.expires_at);
      if (expiresAt < new Date()) {
        return NextResponse.json(
          { error: "This feedback request has expired" },
          { status: 410 }
        );
      }
    }

    // Return form metadata (no sensitive data)
    return NextResponse.json({
      request: {
        id: feedbackRequest.id,
        title: feedbackRequest.title,
        notes: feedbackRequest.notes,
      },
      link: {
        id: link.id,
        token: link.token,
        expires_at: link.expires_at,
        max_submissions: link.max_submissions,
        submission_count: link.submission_count,
      },
    });
  } catch (error) {
    console.error("Error in GET /api/feedback/form/[token]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
