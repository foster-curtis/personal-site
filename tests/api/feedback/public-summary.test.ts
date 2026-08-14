import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/feedback/analysis", () => ({
  getPublicFeedbackSummary: vi.fn(),
}));

import { getPublicFeedbackSummary } from "@/lib/feedback/analysis";
import { GET } from "@/app/api/feedback/public-summary/route";

const mockGetPublicFeedbackSummary = vi.mocked(getPublicFeedbackSummary);

function makeSummary(overrides: Record<string, unknown> = {}) {
  return {
    summary_text: "A great colleague to work with.",
    highlights: {
      strengths: ["Communication"],
      growth_areas: [],
      themes: ["Reliability"],
    },
    responder_count: 3,
    generated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

// This route is a privacy control: it must never expose peer feedback that could be
// attributed back to a single respondent, so the < 2 respondent gate is asserted
// explicitly and by name, not just folded into a generic "returns data" test.
describe("GET /api/feedback/public-summary (anonymity gate)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns available: false when no summary exists yet", async () => {
    mockGetPublicFeedbackSummary.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      available: false,
      message: "No peer feedback available yet",
    });
  });

  it("returns available: false when responder_count is below 2, even though a summary exists", async () => {
    mockGetPublicFeedbackSummary.mockResolvedValue(makeSummary({ responder_count: 1 }));
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      available: false,
      message: "Not enough feedback collected yet for a summary",
    });
  });

  it("returns available: false at exactly 1 responder (boundary just below the gate)", async () => {
    mockGetPublicFeedbackSummary.mockResolvedValue(makeSummary({ responder_count: 1 }));
    const res = await GET();
    const json = await res.json();
    expect(json.available).toBe(false);
    // No raw summary content should leak when gated.
    expect(json.summary_text).toBeUndefined();
    expect(json.highlights).toBeUndefined();
  });

  it("returns the full summary once responder_count reaches exactly 2 (boundary at the gate)", async () => {
    const summary = makeSummary({ responder_count: 2 });
    mockGetPublicFeedbackSummary.mockResolvedValue(summary);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      available: true,
      summary_text: summary.summary_text,
      highlights: summary.highlights,
      responder_count: 2,
      generated_at: summary.generated_at,
    });
  });

  it("returns the full summary when responder_count is well above 2", async () => {
    const summary = makeSummary({ responder_count: 8 });
    mockGetPublicFeedbackSummary.mockResolvedValue(summary);
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({
      available: true,
      summary_text: summary.summary_text,
      highlights: summary.highlights,
      responder_count: 8,
      generated_at: summary.generated_at,
    });
  });

  it("returns 500 when the summary lookup throws", async () => {
    mockGetPublicFeedbackSummary.mockRejectedValue(new Error("db down"));
    const res = await GET();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      error: "Failed to get feedback summary",
    });
  });
});
