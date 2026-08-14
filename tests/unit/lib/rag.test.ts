import { describe, it, expect } from "vitest";
import {
  prioritizeChunks,
  formatContextFromChunks,
  buildSystemPrompt,
  formatPeerFeedbackContext,
  BlockMetadata,
} from "@/lib/rag";
import { EmbeddingMatch, PublicFeedbackSummary } from "@/lib/db/types";

function makeChunk(
  overrides: Partial<EmbeddingMatch> & { content_block_id: string }
): EmbeddingMatch {
  return {
    id: overrides.id ?? `chunk-${overrides.content_block_id}`,
    content_block_id: overrides.content_block_id,
    chunk_index: overrides.chunk_index ?? 0,
    chunk_text: overrides.chunk_text ?? "text",
    similarity: overrides.similarity ?? 0,
  };
}

describe("prioritizeChunks", () => {
  it("does not mutate the input array", () => {
    const chunks = [
      makeChunk({ content_block_id: "a", similarity: 0.5 }),
      makeChunk({ content_block_id: "b", similarity: 0.9 }),
    ];
    const original = [...chunks];
    const result = prioritizeChunks(chunks, new Map());
    expect(chunks).toEqual(original);
    expect(result).not.toBe(chunks);
  });

  it("sorts important-block chunks before non-important, then by similarity descending within each tier", () => {
    const metadata = new Map<string, BlockMetadata>([
      ["important-block", { title: "Important", is_important: true }],
      ["normal-block", { title: "Normal", is_important: false }],
    ]);
    const chunks = [
      makeChunk({ content_block_id: "normal-block", similarity: 0.9 }),
      makeChunk({ content_block_id: "important-block", similarity: 0.3 }),
      makeChunk({ content_block_id: "important-block", similarity: 0.5 }),
      makeChunk({ content_block_id: "normal-block", similarity: 0.5 }),
    ];
    const result = prioritizeChunks(chunks, metadata, 10);
    expect(
      result.map((c) => [c.content_block_id, c.similarity])
    ).toEqual([
      ["important-block", 0.5],
      ["important-block", 0.3],
      ["normal-block", 0.9],
      ["normal-block", 0.5],
    ]);
  });

  it("defaults missing block metadata's is_important to false", () => {
    const chunks = [
      makeChunk({ content_block_id: "known-important", similarity: 0.1 }),
      makeChunk({ content_block_id: "unknown-block", similarity: 0.9 }),
    ];
    const metadata = new Map<string, BlockMetadata>([
      ["known-important", { title: "Known", is_important: true }],
    ]);
    const result = prioritizeChunks(chunks, metadata, 10);
    // unknown-block has no metadata entry, so is_important defaults to
    // false via `?? false` and it sorts after the known-important chunk
    // even though it has higher similarity.
    expect(result.map((c) => c.content_block_id)).toEqual([
      "known-important",
      "unknown-block",
    ]);
  });

  it("respects the limit slice", () => {
    const chunks = [
      makeChunk({ content_block_id: "a", similarity: 0.9 }),
      makeChunk({ content_block_id: "b", similarity: 0.5 }),
      makeChunk({ content_block_id: "c", similarity: 0.3 }),
    ];
    const result = prioritizeChunks(chunks, new Map(), 2);
    expect(result).toHaveLength(2);
    expect(result.map((c) => c.content_block_id)).toEqual(["a", "b"]);
  });
});

describe("formatContextFromChunks", () => {
  it("returns the exact fallback string for an empty chunks array", () => {
    expect(formatContextFromChunks([], new Map())).toBe(
      "No relevant information found in the knowledge base."
    );
  });

  it("falls back to 'Unknown' for a block id with no title", () => {
    const chunks = [
      makeChunk({ content_block_id: "missing", chunk_text: "some text" }),
    ];
    const result = formatContextFromChunks(chunks, new Map());
    expect(result).toBe("[From: Unknown]\nsome text");
  });

  it("joins multiple chunks with the exact separator", () => {
    const chunks = [
      makeChunk({ content_block_id: "a", chunk_text: "first" }),
      makeChunk({ content_block_id: "b", chunk_text: "second" }),
    ];
    const titles = new Map([
      ["a", "Title A"],
      ["b", "Title B"],
    ]);
    const result = formatContextFromChunks(chunks, titles);
    expect(result).toBe(
      "[From: Title A]\nfirst\n\n---\n\n[From: Title B]\nsecond"
    );
  });
});

describe("buildSystemPrompt", () => {
  it("omits the peer-feedback instruction block when hasPeerFeedback is false", () => {
    const prompt = buildSystemPrompt("Jane Doe", false);
    expect(prompt).toContain("Jane Doe");
    expect(prompt).not.toContain("PEER FEEDBACK SUMMARY");
    expect(prompt).not.toContain("peer feedback about Jane Doe");
  });

  it("includes the peer-feedback instruction block when hasPeerFeedback is true", () => {
    const prompt = buildSystemPrompt("Jane Doe", true);
    expect(prompt).toContain("peer feedback about Jane Doe");
    expect(prompt).toContain("PEER FEEDBACK SUMMARY");
  });

  it("produces meaningfully different text between the two branches", () => {
    const withFeedback = buildSystemPrompt("Jane Doe", true);
    const withoutFeedback = buildSystemPrompt("Jane Doe", false);
    expect(withFeedback).not.toBe(withoutFeedback);
    expect(withFeedback.length).toBeGreaterThan(withoutFeedback.length);
  });

  it("defaults ownerName and hasPeerFeedback", () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain("Foster Curtis");
    expect(prompt).not.toContain("PEER FEEDBACK SUMMARY");
  });
});

describe("formatPeerFeedbackContext", () => {
  function makeSummary(
    overrides: Partial<PublicFeedbackSummary["highlights"]> = {}
  ): PublicFeedbackSummary {
    return {
      summary_text: "Overall great to work with.",
      responder_count: 3,
      generated_at: "2026-01-01T00:00:00.000Z",
      highlights: {
        strengths: [],
        growth_areas: [],
        themes: [],
        ...overrides,
      },
    };
  }

  it("always includes the header and summary text", () => {
    const result = formatPeerFeedbackContext(makeSummary());
    expect(result).toContain("=== PEER FEEDBACK SUMMARY ===");
    expect(result).toContain("Based on feedback from 3 colleagues:");
    expect(result).toContain("Overall great to work with.");
  });

  it("omits strengths/growth_areas/themes sections when their arrays are empty", () => {
    const result = formatPeerFeedbackContext(makeSummary());
    expect(result).not.toContain("Key Strengths:");
    expect(result).not.toContain("Areas for Growth:");
    expect(result).not.toContain("Recurring Themes:");
  });

  it("renders the strengths section only when non-empty", () => {
    const result = formatPeerFeedbackContext(
      makeSummary({ strengths: ["Communication", "Reliability"] })
    );
    expect(result).toContain("Key Strengths:");
    expect(result).toContain("  • Communication");
    expect(result).toContain("  • Reliability");
  });

  it("renders the growth_areas section only when non-empty", () => {
    const result = formatPeerFeedbackContext(
      makeSummary({ growth_areas: ["Delegation"] })
    );
    expect(result).toContain("Areas for Growth:");
    expect(result).toContain("  • Delegation");
  });

  it("renders the themes section only when non-empty", () => {
    const result = formatPeerFeedbackContext(
      makeSummary({ themes: ["Leadership", "Mentorship"] })
    );
    expect(result).toContain("Recurring Themes:");
    expect(result).toContain("  • Leadership");
    expect(result).toContain("  • Mentorship");
  });

  it("renders all four sections together when all arrays are non-empty", () => {
    const result = formatPeerFeedbackContext(
      makeSummary({
        strengths: ["S1"],
        growth_areas: ["G1"],
        themes: ["T1"],
      })
    );
    expect(result).toContain("Key Strengths:");
    expect(result).toContain("Areas for Growth:");
    expect(result).toContain("Recurring Themes:");
  });
});
