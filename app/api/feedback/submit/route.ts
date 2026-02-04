import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { FeedbackFormSubmission } from "@/lib/db/types";
import { logger, LogEvents } from "@/lib/logging";
import {
  validateFeedbackSubmission,
  sanitizeStringObject,
} from "@/lib/validation";

/**
 * POST /api/feedback/submit
 * Public endpoint to submit anonymous feedback.
 * Uses admin client to bypass RLS for anonymous submissions.
 *
 * Security notes:
 * - No PII is stored (no IP, email, or name)
 * - Input is validated and sanitized
 * - Token-based authentication prevents unauthorized access
 */
export async function POST(request: NextRequest) {
  const startTime = performance.now();

  try {
    const body = await request.json();

    // Validate input
    const validation = validateFeedbackSubmission(body);
    if (!validation.valid) {
      logger.warn(
        LogEvents.VALIDATION_ERROR,
        "Feedback submission validation failed",
        {
          errors: validation.errors,
        }
      );
      return NextResponse.json(
        { error: "Invalid input", details: validation.errors },
        { status: 400 }
      );
    }

    const typedBody = body as FeedbackFormSubmission;

    if (!typedBody.token) {
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
      logger.error(
        LogEvents.FEEDBACK_SUBMISSION_FAILED,
        responderError,
        "Failed to create responder",
        {
          request_id: link.request_id,
        }
      );
      return NextResponse.json(
        { error: "Failed to create responder record" },
        { status: 500 }
      );
    }

    // Sanitize input data before storing
    const sanitizedMetadata = typedBody.metadata
      ? sanitizeStringObject(typedBody.metadata as Record<string, unknown>, 500)
      : {};
    const sanitizedContent = typedBody.content
      ? sanitizeStringObject(
          typedBody.content as Record<string, unknown>,
          10000
        )
      : {};

    // Create the feedback response
    const { data: response, error: responseError } = await supabase
      .from("feedback_responses")
      .insert({
        responder_id: responder.id,
        request_id: link.request_id,
        metadata: sanitizedMetadata,
        content: sanitizedContent,
        sentiment_score: null, // Will be set by AI analysis in Phase 5
        is_flagged: false,
        flag_reason: null,
      })
      .select()
      .single();

    if (responseError) {
      logger.error(
        LogEvents.FEEDBACK_SUBMISSION_FAILED,
        responseError,
        "Failed to save feedback response",
        {
          request_id: link.request_id,
          responder_id: responder.id,
        }
      );
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
      logger.warn(
        "feedback.link.update_failed",
        "Failed to update submission count",
        {
          link_id: link.id,
        }
      );
      // Don't fail the request - submission was successful
    }

    // Log successful submission (no PII logged)
    const durationMs = Math.round(performance.now() - startTime);
    logger.info(
      LogEvents.FEEDBACK_SUBMISSION,
      "Feedback submitted successfully",
      {
        request_id: link.request_id,
        response_id: response.id,
        duration_ms: durationMs,
        content_fields: Object.keys(sanitizedContent).length,
      }
    );

    return NextResponse.json(
      {
        success: true,
        message: "Thank you for your feedback!",
      },
      { status: 201 }
    );
  } catch (error) {
    logger.error(
      LogEvents.FEEDBACK_SUBMISSION_FAILED,
      error,
      "Unexpected error in feedback submission"
    );
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
