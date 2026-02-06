import { createAdminClient } from "@/lib/supabase/admin";
import { embedText } from "@/lib/gemini/client";
import { EmbeddingMatch, PublicFeedbackSummary } from "@/lib/db/types";

/**
 * Retrieve relevant chunks from the vector database using similarity search
 */
export async function retrieveRelevantChunks(
  query: string,
  matchCount: number = 5,
  matchThreshold: number = 0.3
): Promise<EmbeddingMatch[]> {
  // Generate embedding for the query
  const queryEmbedding = await embedText(query);

  // Use admin client to bypass RLS for public RAG queries
  const supabase = createAdminClient();

  // Call the match_embeddings function we created in SQL
  const { data, error } = await supabase.rpc("match_embeddings", {
    query_embedding: queryEmbedding,
    match_threshold: matchThreshold,
    match_count: matchCount,
  });

  if (error) {
    console.error("Error retrieving chunks:", error);
    return [];
  }

  return (data as EmbeddingMatch[]) || [];
}

/**
 * Block metadata for RAG context building
 */
export interface BlockMetadata {
  title: string;
  is_important: boolean;
}

/**
 * Get content block metadata (title and importance) for attribution and prioritization
 */
export async function getBlockMetadata(
  blockIds: string[]
): Promise<Map<string, BlockMetadata>> {
  if (blockIds.length === 0) return new Map();

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("content_blocks")
    .select("id, title, is_important")
    .in("id", blockIds);

  if (error) {
    console.error("Error fetching block metadata:", error);
    return new Map();
  }

  const metadataMap = new Map<string, BlockMetadata>();
  for (const block of data || []) {
    metadataMap.set(block.id, {
      title: block.title,
      is_important: block.is_important ?? false,
    });
  }

  return metadataMap;
}

/**
 * Get content block titles for attribution (legacy helper, uses getBlockMetadata)
 */
export async function getBlockTitles(
  blockIds: string[]
): Promise<Map<string, string>> {
  const metadata = await getBlockMetadata(blockIds);
  const titleMap = new Map<string, string>();
  for (const [id, meta] of metadata) {
    titleMap.set(id, meta.title);
  }
  return titleMap;
}

/**
 * Prioritize chunks by block importance, then by similarity
 * Chunks from important blocks come first, then sorted by similarity within each group
 */
export function prioritizeChunks(
  chunks: EmbeddingMatch[],
  blockMetadata: Map<string, BlockMetadata>,
  limit: number = 5
): EmbeddingMatch[] {
  // Sort: important blocks first, then by similarity descending
  const sorted = [...chunks].sort((a, b) => {
    const aImportant = blockMetadata.get(a.content_block_id)?.is_important ?? false;
    const bImportant = blockMetadata.get(b.content_block_id)?.is_important ?? false;

    // Important blocks come first
    if (aImportant && !bImportant) return -1;
    if (!aImportant && bImportant) return 1;

    // Within same importance level, sort by similarity descending
    return b.similarity - a.similarity;
  });

  return sorted.slice(0, limit);
}

/**
 * Format retrieved chunks into context for the LLM
 */
export function formatContextFromChunks(
  chunks: EmbeddingMatch[],
  blockTitles: Map<string, string>
): string {
  if (chunks.length === 0) {
    return "No relevant information found in the knowledge base.";
  }

  const contextParts: string[] = [];

  for (const chunk of chunks) {
    const title = blockTitles.get(chunk.content_block_id) || "Unknown";
    contextParts.push(`[From: ${title}]\n${chunk.chunk_text}`);
  }

  return contextParts.join("\n\n---\n\n");
}

/**
 * Build the system prompt for RAG chat
 */
export function buildSystemPrompt(
  ownerName: string = "Foster Curtis",
  hasPeerFeedback: boolean = false
): string {
  const peerFeedbackInstruction = hasPeerFeedback
    ? `
- You also have access to peer feedback about ${ownerName} from colleagues who have worked with them
- If the user asks about what others say about ${ownerName}, their reputation, how colleagues describe them, or similar peer-related questions, use the PEER FEEDBACK SUMMARY section in the context
- The peer feedback represents anonymous, aggregated opinions from real colleagues`
    : "";

  return `You are a helpful AI assistant that answers questions about ${ownerName}. 
You have access to information from their resume, work experience, projects, and stories.

IMPORTANT INSTRUCTIONS:
- Only answer based on the provided context below
- If the context doesn't contain enough information to answer the question, say so politely
- Be conversational but professional
- When relevant, mention specific experiences or skills from the context
- Keep responses concise but informative
- If asked about something not in the context, suggest what topics you CAN help with based on ${ownerName}'s background${peerFeedbackInstruction}`;
}

/**
 * Retrieve public peer feedback summary for chat context
 */
export async function retrievePeerFeedbackSummary(): Promise<PublicFeedbackSummary | null> {
  const supabase = createAdminClient();
  const ownerEmail = process.env.OWNER_EMAIL;

  if (!ownerEmail) {
    return null;
  }

  // Get owner's requests via content_blocks (same pattern as getPublicFeedbackSummary)
  const { data: ownerBlocks } = await supabase
    .from("content_blocks")
    .select("owner_id")
    .limit(1);

  if (!ownerBlocks || ownerBlocks.length === 0) {
    return null;
  }

  const ownerId = ownerBlocks[0].owner_id;

  // Get all active requests for this owner
  const { data: requests } = await supabase
    .from("feedback_requests")
    .select("id")
    .eq("owner_id", ownerId)
    .eq("is_active", true);

  if (!requests || requests.length === 0) {
    return null;
  }

  const requestIds = requests.map((r) => r.id);

  // Get latest summary
  const { data: summaries } = await supabase
    .from("feedback_summaries")
    .select("*")
    .in("request_id", requestIds)
    .order("created_at", { ascending: false })
    .limit(1);

  if (!summaries || summaries.length === 0) {
    return null;
  }

  // Get unique responder count
  const { count: responderCount } = await supabase
    .from("feedback_responders")
    .select("*", { count: "exact", head: true })
    .in("request_id", requestIds);

  // Require at least 2 respondents for anonymity
  if (!responderCount || responderCount < 2) {
    return null;
  }

  const latestSummary = summaries[0];

  return {
    summary_text: latestSummary.summary_text,
    highlights: latestSummary.highlights as {
      strengths: string[];
      growth_areas: string[];
      themes: string[];
    },
    responder_count: responderCount,
    generated_at: latestSummary.created_at,
  };
}

/**
 * Format peer feedback summary into context for the LLM
 */
export function formatPeerFeedbackContext(
  summary: PublicFeedbackSummary
): string {
  const parts: string[] = [];

  parts.push("=== PEER FEEDBACK SUMMARY ===");
  parts.push(`Based on feedback from ${summary.responder_count} colleagues:\n`);
  parts.push(summary.summary_text);

  if (summary.highlights.strengths.length > 0) {
    parts.push("\nKey Strengths:");
    summary.highlights.strengths.forEach((s) => parts.push(`  • ${s}`));
  }

  if (summary.highlights.growth_areas.length > 0) {
    parts.push("\nAreas for Growth:");
    summary.highlights.growth_areas.forEach((a) => parts.push(`  • ${a}`));
  }

  if (summary.highlights.themes.length > 0) {
    parts.push("\nRecurring Themes:");
    summary.highlights.themes.forEach((t) => parts.push(`  • ${t}`));
  }

  return parts.join("\n");
}
