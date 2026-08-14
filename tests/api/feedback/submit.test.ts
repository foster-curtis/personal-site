import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

import { createAdminClient } from "@/lib/supabase/admin";
import { POST } from "@/app/api/feedback/submit/route";
import { mockJsonRequest } from "@/tests/helpers/request";
import {
  createMockSupabaseClient,
  asSupabaseClient,
  pgrst116Error,
  type MockSupabaseClient,
} from "@/tests/helpers/supabase-mock";

const mockCreateAdminClient = vi.mocked(createAdminClient);

const VALID_TOKEN = "a".repeat(43);

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    token: VALID_TOKEN,
    metadata: { relationship: "Manager" },
    content: { worker_description: "Did great work." },
    ...overrides,
  };
}

function makeLink(overrides: Record<string, unknown> = {}) {
  return {
    id: "link-1",
    request_id: "req-1",
    token: VALID_TOKEN,
    expires_at: null,
    max_submissions: null,
    submission_count: 0,
    ...overrides,
  };
}

function makeFeedbackRequest(overrides: Record<string, unknown> = {}) {
  return {
    id: "req-1",
    owner_id: "owner-1",
    is_active: true,
    expires_at: null,
    ...overrides,
  };
}

function dbError(code = "500") {
  return { code, message: "failed", details: "", hint: "" };
}

describe("POST /api/feedback/submit", () => {
  let supabase: MockSupabaseClient;

  beforeEach(() => {
    supabase = createMockSupabaseClient();
    mockCreateAdminClient.mockReturnValue(asSupabaseClient(supabase));
  });

  it("returns 400 with validation details for an invalid body", async () => {
    const req = mockJsonRequest("/api/feedback/submit", { token: "short" });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Invalid input");
    expect(Array.isArray(json.details)).toBe(true);
    expect(json.details.length).toBeGreaterThan(0);
  });

  // The route has a dedicated `if (!typedBody.token)` check (app/api/feedback/submit/
  // route.ts:44-46) returning its own "Token is required" message, but
  // validateFeedbackSubmission already requires a truthy 20-100 char token, so any
  // request that would trip that check has already failed validation first. This test
  // documents that the dedicated check is currently unreachable dead code.
  it("returns 400 via validation (not the dedicated token check) when token is missing", async () => {
    const req = mockJsonRequest("/api/feedback/submit", {
      metadata: {},
      content: {},
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Invalid input");
  });

  it("returns 404 when the link is not found", async () => {
    supabase.queueFrom("feedback_links", { data: null, error: pgrst116Error() });
    const req = mockJsonRequest("/api/feedback/submit", validBody());
    const res = await POST(req);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: "Invalid or expired feedback link",
    });
  });

  it("returns 410 when the link has expired", async () => {
    supabase.queueFrom("feedback_links", {
      data: makeLink({ expires_at: "2020-01-01T00:00:00.000Z" }),
      error: null,
    });
    const req = mockJsonRequest("/api/feedback/submit", validBody());
    const res = await POST(req);
    expect(res.status).toBe(410);
    expect(await res.json()).toEqual({
      error: "This feedback link has expired",
    });
  });

  it("returns 410 when the submission limit has been reached", async () => {
    supabase.queueFrom("feedback_links", {
      data: makeLink({ max_submissions: 1, submission_count: 1 }),
      error: null,
    });
    const req = mockJsonRequest("/api/feedback/submit", validBody());
    const res = await POST(req);
    expect(res.status).toBe(410);
    expect(await res.json()).toEqual({
      error: "This feedback link has reached its submission limit",
    });
  });

  it("returns 404 when the parent feedback request is not found", async () => {
    supabase.queueFrom("feedback_links", { data: makeLink(), error: null });
    supabase.queueFrom("feedback_requests", {
      data: null,
      error: pgrst116Error(),
    });
    const req = mockJsonRequest("/api/feedback/submit", validBody());
    const res = await POST(req);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Feedback request not found" });
  });

  it("returns 410 when the parent feedback request is no longer active", async () => {
    supabase.queueFrom("feedback_links", { data: makeLink(), error: null });
    supabase.queueFrom("feedback_requests", {
      data: makeFeedbackRequest({ is_active: false }),
      error: null,
    });
    const req = mockJsonRequest("/api/feedback/submit", validBody());
    const res = await POST(req);
    expect(res.status).toBe(410);
    expect(await res.json()).toEqual({
      error: "This feedback request is no longer active",
    });
  });

  it("returns 500 when the responder insert fails", async () => {
    supabase.queueFrom("feedback_links", { data: makeLink(), error: null });
    supabase.queueFrom("feedback_requests", {
      data: makeFeedbackRequest(),
      error: null,
    });
    supabase.queueFrom("feedback_responders", {
      data: null,
      error: dbError(),
    });
    const req = mockJsonRequest("/api/feedback/submit", validBody());
    const res = await POST(req);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      error: "Failed to create responder record",
    });
  });

  it("returns 500 when the response insert fails", async () => {
    supabase.queueFrom("feedback_links", { data: makeLink(), error: null });
    supabase.queueFrom("feedback_requests", {
      data: makeFeedbackRequest(),
      error: null,
    });
    supabase.queueFrom("feedback_responders", {
      data: { id: "responder-1" },
      error: null,
    });
    supabase.queueFrom("feedback_responses", {
      data: null,
      error: dbError(),
    });
    const req = mockJsonRequest("/api/feedback/submit", validBody());
    const res = await POST(req);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Failed to submit feedback" });
  });

  it("still returns 201 when the submission_count update fails (non-fatal)", async () => {
    supabase.queueFrom("feedback_links", { data: makeLink(), error: null });
    supabase.queueFrom("feedback_requests", {
      data: makeFeedbackRequest(),
      error: null,
    });
    supabase.queueFrom("feedback_responders", {
      data: { id: "responder-1" },
      error: null,
    });
    supabase.queueFrom("feedback_responses", {
      data: { id: "response-1" },
      error: null,
    });
    supabase.queueFrom("feedback_links", { data: null, error: dbError() });

    const req = mockJsonRequest("/api/feedback/submit", validBody());
    const res = await POST(req);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      success: true,
      message: "Thank you for your feedback!",
    });
  });

  it("returns 201 on success", async () => {
    supabase.queueFrom("feedback_links", { data: makeLink(), error: null });
    supabase.queueFrom("feedback_requests", {
      data: makeFeedbackRequest(),
      error: null,
    });
    supabase.queueFrom("feedback_responders", {
      data: { id: "responder-1" },
      error: null,
    });
    supabase.queueFrom("feedback_responses", {
      data: { id: "response-1" },
      error: null,
    });
    supabase.queueFrom("feedback_links", {
      data: { submission_count: 1 },
      error: null,
    });

    const req = mockJsonRequest("/api/feedback/submit", validBody());
    const res = await POST(req);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      success: true,
      message: "Thank you for your feedback!",
    });
  });

  // GAP (documented in plans/03-route-handler-tests.md): this route checks
  // link.expires_at but never checks the parent feedback request's own expires_at,
  // even though the sibling route app/api/feedback/form/[token]/route.ts:77 checks
  // both. This test pins current behavior — a link that's still valid but whose
  // *request* has expired currently still accepts submissions. Whether that's
  // correct is a product decision, not something this test asserts either way.
  it("GAP: currently still succeeds when the link is valid but its parent request has expired", async () => {
    supabase.queueFrom("feedback_links", { data: makeLink(), error: null });
    supabase.queueFrom("feedback_requests", {
      data: makeFeedbackRequest({ expires_at: "2020-01-01T00:00:00.000Z" }),
      error: null,
    });
    supabase.queueFrom("feedback_responders", {
      data: { id: "responder-1" },
      error: null,
    });
    supabase.queueFrom("feedback_responses", {
      data: { id: "response-1" },
      error: null,
    });
    supabase.queueFrom("feedback_links", {
      data: { submission_count: 1 },
      error: null,
    });

    const req = mockJsonRequest("/api/feedback/submit", validBody());
    const res = await POST(req);
    expect(res.status).toBe(201);
  });
});
