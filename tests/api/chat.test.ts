import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/gemini/client", () => ({
  generateWithContext: vi.fn(),
}));

vi.mock("@/lib/rag", () => ({
  retrieveRelevantChunks: vi.fn(),
  getBlockMetadata: vi.fn(),
  formatContextFromChunks: vi.fn(),
  buildSystemPrompt: vi.fn(),
  retrievePeerFeedbackSummary: vi.fn(),
  formatPeerFeedbackContext: vi.fn(),
  prioritizeChunks: vi.fn(),
}));

import { generateWithContext } from "@/lib/gemini/client";
import {
  retrieveRelevantChunks,
  getBlockMetadata,
  formatContextFromChunks,
  buildSystemPrompt,
  retrievePeerFeedbackSummary,
  formatPeerFeedbackContext,
  prioritizeChunks,
} from "@/lib/rag";
import { POST } from "@/app/api/chat/route";
import { mockJsonRequest } from "@/tests/helpers/request";
import type { EmbeddingMatch, PublicFeedbackSummary } from "@/lib/db/types";
import type { BlockMetadata } from "@/lib/rag";

const mockGenerateWithContext = vi.mocked(generateWithContext);
const mockRetrieveRelevantChunks = vi.mocked(retrieveRelevantChunks);
const mockGetBlockMetadata = vi.mocked(getBlockMetadata);
const mockFormatContextFromChunks = vi.mocked(formatContextFromChunks);
const mockBuildSystemPrompt = vi.mocked(buildSystemPrompt);
const mockRetrievePeerFeedbackSummary = vi.mocked(retrievePeerFeedbackSummary);
const mockFormatPeerFeedbackContext = vi.mocked(formatPeerFeedbackContext);
const mockPrioritizeChunks = vi.mocked(prioritizeChunks);

function chunk(overrides: Partial<EmbeddingMatch> & { content_block_id: string }): EmbeddingMatch {
  return {
    id: overrides.id ?? `chunk-${Math.random()}`,
    content_block_id: overrides.content_block_id,
    chunk_index: overrides.chunk_index ?? 0,
    chunk_text: overrides.chunk_text ?? "text",
    similarity: overrides.similarity ?? 0.5,
  };
}

const peerFeedback: PublicFeedbackSummary = {
  summary_text: "Great colleague.",
  highlights: { strengths: [], growth_areas: [], themes: [] },
  responder_count: 3,
  generated_at: "2026-01-01T00:00:00.000Z",
};

describe("POST /api/chat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRetrieveRelevantChunks.mockResolvedValue([]);
    mockGetBlockMetadata.mockResolvedValue(new Map());
    mockPrioritizeChunks.mockReturnValue([]);
    mockFormatContextFromChunks.mockReturnValue("CONTEXT");
    mockRetrievePeerFeedbackSummary.mockResolvedValue(null);
    mockFormatPeerFeedbackContext.mockReturnValue("PEER_CONTEXT");
    mockBuildSystemPrompt.mockReturnValue("SYSTEM_PROMPT");
    mockGenerateWithContext.mockResolvedValue("AI_RESPONSE");
  });

  it("returns 400 when message is missing", async () => {
    const req = mockJsonRequest("/api/chat", {});
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Message is required" });
    expect(mockRetrieveRelevantChunks).not.toHaveBeenCalled();
  });

  it("wires the full RAG pipeline: retrieval -> dedup -> prioritize -> format -> prompt -> generate", async () => {
    const allChunks = [
      chunk({ id: "c1", content_block_id: "block-a", similarity: 0.9 }),
      chunk({ id: "c2", content_block_id: "block-a", similarity: 0.5 }),
      chunk({ id: "c3", content_block_id: "block-b", similarity: 0.7 }),
    ];
    const blockMetadata = new Map<string, BlockMetadata>([
      ["block-a", { title: "Block A", is_important: true }],
      ["block-b", { title: "Block B", is_important: false }],
    ]);
    const prioritized = [allChunks[0], allChunks[2]];

    mockRetrieveRelevantChunks.mockResolvedValue(allChunks);
    mockGetBlockMetadata.mockResolvedValue(blockMetadata);
    mockPrioritizeChunks.mockReturnValue(prioritized);
    mockFormatContextFromChunks.mockReturnValue("FORMATTED_CONTEXT");

    const req = mockJsonRequest("/api/chat", { message: "What did they do?" });
    const res = await POST(req);

    expect(res.status).toBe(200);

    // 1. retrieveRelevantChunks called with (message, 10, 0.3)
    expect(mockRetrieveRelevantChunks).toHaveBeenCalledWith(
      "What did they do?",
      10,
      0.3
    );

    // 2. block ids deduped via Set before metadata lookup
    expect(mockGetBlockMetadata).toHaveBeenCalledWith(["block-a", "block-b"]);

    // 3. prioritizeChunks called with a limit of 5
    expect(mockPrioritizeChunks).toHaveBeenCalledWith(
      allChunks,
      blockMetadata,
      5
    );

    // 5. formatContextFromChunks called with the prioritized chunks and title map
    expect(mockFormatContextFromChunks).toHaveBeenCalledWith(
      prioritized,
      new Map([
        ["block-a", "Block A"],
        ["block-b", "Block B"],
      ])
    );

    // 7. buildSystemPrompt("Foster Curtis", hasPeerFeedback) — no peer feedback here
    expect(mockBuildSystemPrompt).toHaveBeenCalledWith("Foster Curtis", false);

    // 8. generateWithContext called with the assembled system prompt, context, message
    expect(mockGenerateWithContext).toHaveBeenCalledWith(
      "SYSTEM_PROMPT",
      "FORMATTED_CONTEXT",
      "What did they do?"
    );

    const json = await res.json();
    expect(json.response).toBe("AI_RESPONSE");
    expect(json.sources).toEqual([
      { title: "Block A", similarity: 0.9 },
      { title: "Block B", similarity: 0.7 },
    ]);
  });

  it("appends peer feedback context and flips hasPeerFeedback to true when a summary is found", async () => {
    mockRetrievePeerFeedbackSummary.mockResolvedValue(peerFeedback);
    mockFormatContextFromChunks.mockReturnValue("BASE_CONTEXT");
    mockFormatPeerFeedbackContext.mockReturnValue("PEER_CONTEXT_BLOCK");

    const req = mockJsonRequest("/api/chat", { message: "hi" });
    await POST(req);

    expect(mockFormatPeerFeedbackContext).toHaveBeenCalledWith(peerFeedback);
    expect(mockBuildSystemPrompt).toHaveBeenCalledWith("Foster Curtis", true);
    expect(mockGenerateWithContext).toHaveBeenCalledWith(
      "SYSTEM_PROMPT",
      "BASE_CONTEXT\n\nPEER_CONTEXT_BLOCK",
      "hi"
    );
  });

  it("does not append peer feedback context and keeps hasPeerFeedback false when no summary is found", async () => {
    mockRetrievePeerFeedbackSummary.mockResolvedValue(null);
    mockFormatContextFromChunks.mockReturnValue("BASE_CONTEXT");

    const req = mockJsonRequest("/api/chat", { message: "hi" });
    await POST(req);

    expect(mockFormatPeerFeedbackContext).not.toHaveBeenCalled();
    expect(mockBuildSystemPrompt).toHaveBeenCalledWith("Foster Curtis", false);
    expect(mockGenerateWithContext).toHaveBeenCalledWith(
      "SYSTEM_PROMPT",
      "BASE_CONTEXT",
      "hi"
    );
  });

  it("returns 500 with a generic error when any pipeline step throws", async () => {
    mockRetrieveRelevantChunks.mockRejectedValue(new Error("embedding API down"));

    const req = mockJsonRequest("/api/chat", { message: "hi" });
    const res = await POST(req);

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Failed to get response" });
  });

  it("returns 500 when the final generation step throws", async () => {
    mockGenerateWithContext.mockRejectedValue(new Error("gemini down"));

    const req = mockJsonRequest("/api/chat", { message: "hi" });
    const res = await POST(req);

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Failed to get response" });
  });
});
