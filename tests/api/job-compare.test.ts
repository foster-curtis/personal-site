import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));
vi.mock("@/lib/gemini/client", () => ({
  generateContent: vi.fn(),
}));

import { createAdminClient } from "@/lib/supabase/admin";
import { generateContent } from "@/lib/gemini/client";
import { POST } from "@/app/api/job-compare/route";
import { mockJsonRequest } from "@/tests/helpers/request";
import {
  createMockSupabaseClient,
  asSupabaseClient,
  type MockSupabaseClient,
} from "@/tests/helpers/supabase-mock";

const mockCreateAdminClient = vi.mocked(createAdminClient);
const mockGenerateContent = vi.mocked(generateContent);

const OWNER_USER = { id: "owner-1", email: "owner@example.com" };

function request(jobDescription: unknown = "A great job description.") {
  return mockJsonRequest("/api/job-compare", { jobDescription });
}

describe("POST /api/job-compare", () => {
  let supabase: MockSupabaseClient;
  const originalOwnerEmail = process.env.OWNER_EMAIL;

  beforeEach(() => {
    supabase = createMockSupabaseClient();
    mockCreateAdminClient.mockReturnValue(asSupabaseClient(supabase));
    process.env.OWNER_EMAIL = "owner@example.com";
  });

  afterEach(() => {
    process.env.OWNER_EMAIL = originalOwnerEmail;
  });

  it("returns 400 when jobDescription is missing", async () => {
    const res = await POST(mockJsonRequest("/api/job-compare", {}));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Job description is required",
    });
  });

  it("returns 400 when jobDescription is an empty/whitespace string", async () => {
    const res = await POST(request("   "));
    expect(res.status).toBe(400);
  });

  it("returns 500 when OWNER_EMAIL is not configured", async () => {
    delete process.env.OWNER_EMAIL;
    const res = await POST(request());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Owner not configured" });
  });

  it("returns 404 when no user matches OWNER_EMAIL", async () => {
    supabase.auth.setListUsers([]);
    const res = await POST(request());
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: "No candidate profile found",
    });
  });

  it("returns 500 when fetching content blocks errors", async () => {
    supabase.auth.setListUsers([OWNER_USER]);
    supabase.queueFrom("content_blocks", {
      data: null,
      error: { code: "500", message: "db down", details: "", hint: "" },
    });
    const res = await POST(request());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      error: "Failed to fetch candidate profile",
    });
  });

  it("returns 404 when the owner has no content blocks", async () => {
    supabase.auth.setListUsers([OWNER_USER]);
    supabase.queueFrom("content_blocks", { data: [], error: null });
    const res = await POST(request());
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toContain("No candidate profile data available");
  });

  it("returns 200 with the parsed analysis on successful extraction", async () => {
    supabase.auth.setListUsers([OWNER_USER]);
    supabase.queueFrom("content_blocks", {
      data: [{ type: "resume", title: "Resume", body_text: "10 years of experience." }],
      error: null,
    });
    const analysis = {
      overallMatch: "strong",
      matchScore: 88,
      summary: "Great fit.",
      strengths: [],
      partialMatches: [],
      gaps: [],
      recommendation: {
        hire: true,
        confidence: "high",
        reasoning: "Strong alignment.",
        interviewFocus: [],
      },
    };
    mockGenerateContent.mockResolvedValue(
      `Here is my analysis:\n${JSON.stringify(analysis)}`
    );

    const res = await POST(request());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ analysis });
  });

  // Easy to miss: a parse failure is NOT a 500 — the route deliberately returns 200 with
  // the raw model text so the caller can still show something to the user.
  it("returns 200 (not 500) with analysis: null and the raw response when JSON extraction fails", async () => {
    supabase.auth.setListUsers([OWNER_USER]);
    supabase.queueFrom("content_blocks", {
      data: [{ type: "resume", title: "Resume", body_text: "10 years of experience." }],
      error: null,
    });
    mockGenerateContent.mockResolvedValue("Sorry, I can't produce that right now.");

    const res = await POST(request());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      analysis: null,
      rawResponse: "Sorry, I can't produce that right now.",
      error: "Failed to parse structured analysis",
    });
  });

  it("returns 200 with analysis: null when the extracted text has braces but isn't valid JSON", async () => {
    supabase.auth.setListUsers([OWNER_USER]);
    supabase.queueFrom("content_blocks", {
      data: [{ type: "resume", title: "Resume", body_text: "10 years of experience." }],
      error: null,
    });
    mockGenerateContent.mockResolvedValue("{ this is not valid json }");

    const res = await POST(request());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.analysis).toBeNull();
    expect(json.error).toBe("Failed to parse structured analysis");
  });

  it("returns 500 when generateContent throws", async () => {
    supabase.auth.setListUsers([OWNER_USER]);
    supabase.queueFrom("content_blocks", {
      data: [{ type: "resume", title: "Resume", body_text: "10 years of experience." }],
      error: null,
    });
    mockGenerateContent.mockRejectedValue(new Error("gemini down"));

    const res = await POST(request());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Failed to analyze job fit" });
  });
});
