import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

import { createAdminClient } from "@/lib/supabase/admin";
import { GET } from "@/app/api/feedback/form/[token]/route";
import { mockGetRequest, mockParams } from "@/tests/helpers/request";
import {
  createMockSupabaseClient,
  asSupabaseClient,
  pgrst116Error,
  type MockSupabaseClient,
} from "@/tests/helpers/supabase-mock";

const mockCreateAdminClient = vi.mocked(createAdminClient);

const TOKEN = "a".repeat(43);

function makeLink(overrides: Record<string, unknown> = {}) {
  return {
    id: "link-1",
    request_id: "req-1",
    token: TOKEN,
    expires_at: null,
    max_submissions: null,
    submission_count: 0,
    ...overrides,
  };
}

function makeFeedbackRequest(overrides: Record<string, unknown> = {}) {
  return {
    id: "req-1",
    title: "Feedback for Foster",
    notes: "Internal notes not meant for the responder",
    owner_id: "owner-1",
    is_active: true,
    expires_at: null,
    ...overrides,
  };
}

function call(token = TOKEN) {
  return GET(mockGetRequest(`/api/feedback/form/${token}`), mockParams({ token }));
}

describe("GET /api/feedback/form/[token]", () => {
  let supabase: MockSupabaseClient;

  beforeEach(() => {
    supabase = createMockSupabaseClient();
    mockCreateAdminClient.mockReturnValue(asSupabaseClient(supabase));
  });

  it("returns 404 when the link is not found", async () => {
    supabase.queueFrom("feedback_links", { data: null, error: pgrst116Error() });
    const res = await call();
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
    const res = await call();
    expect(res.status).toBe(410);
    expect(await res.json()).toEqual({
      error: "This feedback link has expired",
    });
  });

  it("returns 410 when the submission limit has been reached", async () => {
    supabase.queueFrom("feedback_links", {
      data: makeLink({ max_submissions: 2, submission_count: 2 }),
      error: null,
    });
    const res = await call();
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
    const res = await call();
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Feedback request not found" });
  });

  it("returns 410 when the parent feedback request is no longer active", async () => {
    supabase.queueFrom("feedback_links", { data: makeLink(), error: null });
    supabase.queueFrom("feedback_requests", {
      data: makeFeedbackRequest({ is_active: false }),
      error: null,
    });
    const res = await call();
    expect(res.status).toBe(410);
    expect(await res.json()).toEqual({
      error: "This feedback request is no longer active",
    });
  });

  it("returns 410 when the parent feedback request has expired (unlike the submit route, this route checks it)", async () => {
    supabase.queueFrom("feedback_links", { data: makeLink(), error: null });
    supabase.queueFrom("feedback_requests", {
      data: makeFeedbackRequest({ expires_at: "2020-01-01T00:00:00.000Z" }),
      error: null,
    });
    const res = await call();
    expect(res.status).toBe(410);
    expect(await res.json()).toEqual({
      error: "This feedback request has expired",
    });
  });

  it("returns only non-sensitive form metadata on success", async () => {
    supabase.queueFrom("feedback_links", { data: makeLink(), error: null });
    supabase.queueFrom("feedback_requests", {
      data: makeFeedbackRequest(),
      error: null,
    });
    const res = await call();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({
      request: {
        id: "req-1",
        title: "Feedback for Foster",
        notes: "Internal notes not meant for the responder",
      },
      link: {
        id: "link-1",
        token: TOKEN,
        expires_at: null,
        max_submissions: null,
        submission_count: 0,
      },
    });
    // No owner_id, request_id, or any other responders' data leaks into the response.
    expect(json.request).not.toHaveProperty("owner_id");
    expect(json.link).not.toHaveProperty("request_id");
  });
});
