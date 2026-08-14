import { describe, it, expect } from "vitest";
import {
  FEEDBACK_QUESTIONS,
  getMetadataQuestions,
  getContentQuestions,
} from "@/lib/feedback/questions";

describe("getMetadataQuestions", () => {
  it("returns exactly 4 questions", () => {
    expect(getMetadataQuestions()).toHaveLength(4);
  });

  it("returns only questions categorized as metadata", () => {
    expect(
      getMetadataQuestions().every((q) => q.category === "metadata")
    ).toBe(true);
  });
});

describe("getContentQuestions", () => {
  it("returns exactly 6 questions", () => {
    expect(getContentQuestions()).toHaveLength(6);
  });

  it("returns only questions categorized as content", () => {
    expect(
      getContentQuestions().every((q) => q.category === "content")
    ).toBe(true);
  });
});

describe("FEEDBACK_QUESTIONS invariants", () => {
  it("has unique ids across all questions", () => {
    const ids = FEEDBACK_QUESTIONS.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every question's category is exactly 'metadata' or 'content', no third state", () => {
    for (const q of FEEDBACK_QUESTIONS) {
      expect(["metadata", "content"]).toContain(q.category);
    }
  });

  it("metadata and content categories partition the full question set", () => {
    const total =
      getMetadataQuestions().length + getContentQuestions().length;
    expect(total).toBe(FEEDBACK_QUESTIONS.length);
  });
});
