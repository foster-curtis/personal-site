import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUser, isOwner } from "@/lib/auth";
import {
  FeedbackRequest,
  CreateFeedbackRequestInput,
  FeedbackLink,
} from "@/lib/db/types";
import { generateFeedbackToken } from "@/lib/feedback/tokens";

/**
 * GET /api/feedback/requests
 * List all feedback requests for the owner with summary stats.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getUser();

    if (!user || !isOwner(user)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = await createClient();

    // Fetch requests with their links
    const { data: requests, error: requestsError } = await supabase
      .from("feedback_requests")
      .select("*")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false });

    if (requestsError) {
      console.error("Error fetching feedback requests:", requestsError);
      return NextResponse.json(
        { error: "Failed to fetch feedback requests" },
        { status: 500 }
      );
    }

    // Fetch links for each request
    const requestIds = (requests || []).map((r) => r.id);
    const { data: links, error: linksError } = await supabase
      .from("feedback_links")
      .select("*")
      .in("request_id", requestIds);

    if (linksError) {
      console.error("Error fetching feedback links:", linksError);
      // Continue without links rather than failing
    }

    // Fetch response counts per request
    const { data: responses, error: responsesError } = await supabase
      .from("feedback_responses")
      .select("request_id")
      .in("request_id", requestIds);

    if (responsesError) {
      console.error("Error fetching response counts:", responsesError);
    }

    // Count responses per request
    const responseCounts = new Map<string, number>();
    (responses || []).forEach((r) => {
      responseCounts.set(
        r.request_id,
        (responseCounts.get(r.request_id) || 0) + 1
      );
    });

    // Count responders per request
    const { data: responders, error: respondersError } = await supabase
      .from("feedback_responders")
      .select("request_id")
      .in("request_id", requestIds);

    if (respondersError) {
      console.error("Error fetching responder counts:", respondersError);
    }

    const responderCounts = new Map<string, number>();
    (responders || []).forEach((r) => {
      responderCounts.set(
        r.request_id,
        (responderCounts.get(r.request_id) || 0) + 1
      );
    });

    // Group links by request_id
    const linksByRequest = new Map<string, FeedbackLink[]>();
    (links || []).forEach((link) => {
      const existing = linksByRequest.get(link.request_id) || [];
      existing.push(link);
      linksByRequest.set(link.request_id, existing);
    });

    // Combine data
    const requestsWithStats = (requests || []).map((req) => ({
      ...req,
      links: linksByRequest.get(req.id) || [],
      response_count: responseCounts.get(req.id) || 0,
      responder_count: responderCounts.get(req.id) || 0,
    }));

    return NextResponse.json({ data: requestsWithStats });
  } catch (error) {
    console.error("Error in GET /api/feedback/requests:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/feedback/requests
 * Create a new feedback request and generate a default link.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getUser();

    if (!user || !isOwner(user)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body: CreateFeedbackRequestInput = await request.json();

    const supabase = await createClient();

    // Create the feedback request
    const { data: feedbackRequest, error: requestError } = await supabase
      .from("feedback_requests")
      .insert({
        owner_id: user.id,
        title: body.title || null,
        notes: body.notes || null,
        expires_at: body.expires_at || null,
        is_active: body.is_active !== undefined ? body.is_active : true,
      })
      .select()
      .single();

    if (requestError) {
      console.error("Error creating feedback request:", requestError);
      return NextResponse.json(
        { error: "Failed to create feedback request" },
        { status: 500 }
      );
    }

    // Generate a default link for this request
    const token = generateFeedbackToken();
    const { data: feedbackLink, error: linkError } = await supabase
      .from("feedback_links")
      .insert({
        request_id: feedbackRequest.id,
        token,
        expires_at: body.expires_at || null,
        max_submissions: 1,
        submission_count: 0,
      })
      .select()
      .single();

    if (linkError) {
      console.error("Error creating feedback link:", linkError);
      // Request was created but link failed - still return success but note the issue
      return NextResponse.json(
        {
          data: feedbackRequest,
          link: null,
          warning: "Request created but link generation failed",
        },
        { status: 201 }
      );
    }

    return NextResponse.json(
      {
        data: {
          ...feedbackRequest,
          links: [feedbackLink],
          response_count: 0,
          responder_count: 0,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error in POST /api/feedback/requests:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
