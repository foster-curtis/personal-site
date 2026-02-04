import { NextRequest, NextResponse } from "next/server";
import { generateWithContext } from "@/lib/gemini/client";
import {
  retrieveRelevantChunks,
  getBlockTitles,
  formatContextFromChunks,
  buildSystemPrompt,
  retrievePeerFeedbackSummary,
  formatPeerFeedbackContext,
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

    // 1. Retrieve relevant chunks using RAG
    const chunks = await retrieveRelevantChunks(message, 5, 0.3);

    // 2. Get block titles for attribution
    const blockIds = [...new Set(chunks.map((c) => c.content_block_id))];
    const blockTitles = await getBlockTitles(blockIds);

    // 3. Format context from chunks
    let context = formatContextFromChunks(chunks, blockTitles);

    // 4. Retrieve and add peer feedback summary if available
    const peerFeedback = await retrievePeerFeedbackSummary();
    const hasPeerFeedback = peerFeedback !== null;

    if (peerFeedback) {
      const feedbackContext = formatPeerFeedbackContext(peerFeedback);
      context = `${context}\n\n${feedbackContext}`;
    }

    // 5. Build system prompt (with peer feedback awareness if available)
    const systemPrompt = buildSystemPrompt("Foster Curtis", hasPeerFeedback);

    // 6. Generate response with context
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
