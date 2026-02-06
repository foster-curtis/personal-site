import { NextRequest, NextResponse } from "next/server";
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

export async function POST(request: NextRequest) {
  try {
    const { message } = await request.json();

    if (!message) {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }

    // 1. Retrieve more chunks than needed for prioritization
    const allChunks = await retrieveRelevantChunks(message, 10, 0.3);

    // 2. Get block metadata (title + importance) for prioritization
    const blockIds = [...new Set(allChunks.map((c) => c.content_block_id))];
    const blockMetadata = await getBlockMetadata(blockIds);

    // 3. Prioritize chunks: important blocks first, then by similarity
    const chunks = prioritizeChunks(allChunks, blockMetadata, 5);

    // 4. Build title map for context formatting
    const blockTitles = new Map<string, string>();
    for (const [id, meta] of blockMetadata) {
      blockTitles.set(id, meta.title);
    }

    // 5. Format context from prioritized chunks
    let context = formatContextFromChunks(chunks, blockTitles);

    // 6. Retrieve and add peer feedback summary if available
    const peerFeedback = await retrievePeerFeedbackSummary();
    const hasPeerFeedback = peerFeedback !== null;

    if (peerFeedback) {
      const feedbackContext = formatPeerFeedbackContext(peerFeedback);
      context = `${context}\n\n${feedbackContext}`;
    }

    // 7. Build system prompt (with peer feedback awareness if available)
    const systemPrompt = buildSystemPrompt("Foster Curtis", hasPeerFeedback);

    // 8. Generate response with context
    const response = await generateWithContext(systemPrompt, context, message);

    return NextResponse.json({
      response,
      // Include sources for transparency (optional - can display in UI)
      sources: chunks.map((c) => ({
        title: blockTitles.get(c.content_block_id) || "Unknown",
        similarity: c.similarity,
      })),
    });
  } catch (error) {
    console.error("Error in chat API:", error);
    return NextResponse.json(
      { error: "Failed to get response" },
      { status: 500 }
    );
  }
}
