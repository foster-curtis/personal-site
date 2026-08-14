import { describe, it, expect } from "vitest";
import { buildAnalysisPrompt } from "@/lib/feedback/analysis";
import { FeedbackResponse } from "@/lib/db/types";

function makeResponse(overrides: Partial<FeedbackResponse> = {}): FeedbackResponse {
  return {
    id: "resp-1",
    responder_id: "responder-1",
    request_id: "request-1",
    created_at: "2026-01-01T00:00:00.000Z",
    metadata: {},
    content: {},
    sentiment_score: null,
    is_flagged: false,
    flag_reason: null,
    ...overrides,
  };
}

describe("buildAnalysisPrompt", () => {
  it("numbers each response starting at 1 and includes its id", () => {
    const prompt = buildAnalysisPrompt({
      ownerName: "Jane Doe",
      responses: [
        makeResponse({ id: "aaa" }),
        makeResponse({ id: "bbb" }),
        makeResponse({ id: "ccc" }),
      ],
    });
    expect(prompt).toContain("--- Response #1 (ID: aaa) ---");
    expect(prompt).toContain("--- Response #2 (ID: bbb) ---");
    expect(prompt).toContain("--- Response #3 (ID: ccc) ---");
  });

  it("falls back to 'Not specified' when relationship is missing", () => {
    const prompt = buildAnalysisPrompt({
      ownerName: "Jane Doe",
      responses: [makeResponse({ metadata: {} })],
    });
    expect(prompt).toContain("Relationship: Not specified");
  });

  it("uses the actual relationship value when present", () => {
    const prompt = buildAnalysisPrompt({
      ownerName: "Jane Doe",
      responses: [makeResponse({ metadata: { relationship: "manager" } })],
    });
    expect(prompt).toContain("Relationship: manager");
  });

  it("omits the Period line entirely when neither worked_from nor worked_to is set", () => {
    const prompt = buildAnalysisPrompt({
      ownerName: "Jane Doe",
      responses: [makeResponse({ metadata: {} })],
    });
    expect(prompt).not.toContain("Period:");
  });

  it("renders the Period line with '?' fallback when only one of worked_from/worked_to is set", () => {
    const promptFromOnly = buildAnalysisPrompt({
      ownerName: "Jane Doe",
      responses: [makeResponse({ metadata: { worked_from: "2022" } })],
    });
    expect(promptFromOnly).toContain("Period: 2022 to ?");

    const promptToOnly = buildAnalysisPrompt({
      ownerName: "Jane Doe",
      responses: [makeResponse({ metadata: { worked_to: "2024" } })],
    });
    expect(promptToOnly).toContain("Period: ? to 2024");
  });

  it("renders the Period line fully when both worked_from and worked_to are set", () => {
    const prompt = buildAnalysisPrompt({
      ownerName: "Jane Doe",
      responses: [
        makeResponse({
          metadata: { worked_from: "2022", worked_to: "2024" },
        }),
      ],
    });
    expect(prompt).toContain("Period: 2022 to 2024");
  });

  it("maps content keys through question labels", () => {
    const prompt = buildAnalysisPrompt({
      ownerName: "Jane Doe",
      responses: [
        makeResponse({
          content: { worker_description: "Very diligent." },
        }),
      ],
    });
    expect(prompt).toContain(
      "How would you describe them as a worker?:\nVery diligent."
    );
  });

  it("falls back to the raw key name for an unrecognized content key", () => {
    const prompt = buildAnalysisPrompt({
      ownerName: "Jane Doe",
      responses: [
        makeResponse({
          content: { some_unmapped_key: "Some value." },
        }),
      ],
    });
    expect(prompt).toContain("some_unmapped_key:\nSome value.");
  });

  it("skips empty and whitespace-only content values", () => {
    const prompt = buildAnalysisPrompt({
      ownerName: "Jane Doe",
      responses: [
        makeResponse({
          content: {
            worker_description: "   ",
            character_comments: "",
            skills_comments: "Real content here.",
          },
        }),
      ],
    });
    expect(prompt).not.toContain("How would you describe them as a worker?");
    expect(prompt).not.toContain(
      "What can you say about their character?"
    );
    expect(prompt).toContain(
      "What are their strongest skills or proficiencies?:\nReal content here."
    );
  });

  it("includes ownerName and the response count in the instructional text", () => {
    const prompt = buildAnalysisPrompt({
      ownerName: "Jane Doe",
      responses: [makeResponse(), makeResponse({ id: "resp-2" })],
    });
    expect(prompt).toContain("anonymous peer feedback about Jane Doe");
    expect(prompt).toContain("Below are 2 feedback responses");
  });
});
