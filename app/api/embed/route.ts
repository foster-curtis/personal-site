import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUser, isOwner } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { embedText, chunkText } from "@/lib/gemini/client";
import { ContentBlock } from "@/lib/db/types";

interface EmbedRequest {
  content_block_id?: string;
  sync_all?: boolean;
}

// POST /api/embed - Generate embeddings for content blocks
export async function POST(request: NextRequest) {
  try {
    const user = await getUser();

    if (!user || !isOwner(user)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body: EmbedRequest = await request.json();
    const { content_block_id, sync_all } = body;

    if (!content_block_id && !sync_all) {
      return NextResponse.json(
        { error: "Either content_block_id or sync_all must be provided" },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    // Use admin client for embedding operations to bypass RLS
    const adminSupabase = createAdminClient();

    let blocks: ContentBlock[] = [];

    if (sync_all) {
      // Fetch all content blocks for the owner
      const { data, error } = await supabase
        .from("content_blocks")
        .select("*")
        .eq("owner_id", user.id);

      if (error) {
        console.error("Error fetching content blocks:", error);
        return NextResponse.json(
          { error: "Failed to fetch content blocks" },
          { status: 500 }
        );
      }

      blocks = data as ContentBlock[];
    } else if (content_block_id) {
      // Fetch single content block
      const { data, error } = await supabase
        .from("content_blocks")
        .select("*")
        .eq("id", content_block_id)
        .eq("owner_id", user.id)
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          return NextResponse.json(
            { error: "Content block not found" },
            { status: 404 }
          );
        }
        console.error("Error fetching content block:", error);
        return NextResponse.json(
          { error: "Failed to fetch content block" },
          { status: 500 }
        );
      }

      blocks = [data as ContentBlock];
    }

    if (blocks.length === 0) {
      return NextResponse.json({
        message: "No content blocks to embed",
        embedded: 0,
        chunks: 0,
      });
    }

    let totalChunks = 0;
    const results: { block_id: string; title: string; chunks: number }[] = [];

    for (const block of blocks) {
      // Combine title and body for embedding
      const fullText = `${block.title}\n\n${block.body_text}`;

      // Split into chunks
      const chunks = chunkText(fullText);

      if (chunks.length === 0) {
        continue;
      }

      // Delete existing embeddings for this block
      const { error: deleteError } = await adminSupabase
        .from("content_embeddings")
        .delete()
        .eq("content_block_id", block.id);

      if (deleteError) {
        console.error(
          `Error deleting existing embeddings for block ${block.id}:`,
          deleteError
        );
        // Continue anyway - we'll insert new ones
      }

      // Generate and insert embeddings for each chunk
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];

        try {
          // Generate embedding
          const embedding = await embedText(chunk);

          // Insert into database
          const { error: insertError } = await adminSupabase
            .from("content_embeddings")
            .insert({
              content_block_id: block.id,
              chunk_index: i,
              chunk_text: chunk,
              embedding: embedding,
            });

          if (insertError) {
            console.error(
              `Error inserting embedding for block ${block.id}, chunk ${i}:`,
              insertError
            );
            // Continue with other chunks
          } else {
            totalChunks++;
          }
        } catch (embedError) {
          console.error(
            `Error generating embedding for block ${block.id}, chunk ${i}:`,
            embedError
          );
          // Continue with other chunks
        }
      }

      results.push({
        block_id: block.id,
        title: block.title,
        chunks: chunks.length,
      });
    }

    return NextResponse.json({
      message: `Successfully embedded ${blocks.length} content block(s)`,
      embedded: blocks.length,
      chunks: totalChunks,
      results,
    });
  } catch (error) {
    console.error("Error in POST /api/embed:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// GET /api/embed - Get embedding stats
export async function GET() {
  try {
    const user = await getUser();

    if (!user || !isOwner(user)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = await createClient();

    // Get count of content blocks
    const { count: blockCount } = await supabase
      .from("content_blocks")
      .select("*", { count: "exact", head: true })
      .eq("owner_id", user.id);

    // Get count of embeddings (using admin to join across tables)
    const adminSupabase = createAdminClient();

    // Get embedding count for user's blocks
    const { data: userBlocks } = await supabase
      .from("content_blocks")
      .select("id")
      .eq("owner_id", user.id);

    let embeddingCount = 0;
    if (userBlocks && userBlocks.length > 0) {
      const blockIds = userBlocks.map((b) => b.id);
      const { count } = await adminSupabase
        .from("content_embeddings")
        .select("*", { count: "exact", head: true })
        .in("content_block_id", blockIds);

      embeddingCount = count || 0;
    }

    return NextResponse.json({
      content_blocks: blockCount || 0,
      embeddings: embeddingCount,
    });
  } catch (error) {
    console.error("Error in GET /api/embed:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
