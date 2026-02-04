import { createClient } from "@/lib/supabase/server";
import { getUser, isOwner } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { Prompt } from "@/lib/db/types";

// GET /api/prompts - Get prompts
// Query params:
//   - all=true: Get all prompts (including answered)
//   - Default: Get up to 3 pending prompts
export async function GET(request: NextRequest) {
  try {
    const user = await getUser();
    if (!user || !isOwner(user)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    const fetchAll = searchParams.get("all") === "true";

    let query = supabase
      .from("prompts")
      .select("*")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false });

    if (!fetchAll) {
      // Default behavior: only pending prompts, limit 3
      query = query.eq("status", "pending").limit(3);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching prompts:", error);
      return NextResponse.json(
        { error: "Failed to fetch prompts" },
        { status: 500 }
      );
    }

    return NextResponse.json({ prompts: data as Prompt[] });
  } catch (error) {
    console.error("Error in GET /api/prompts:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/prompts - Answer a prompt
export async function POST(request: NextRequest) {
  try {
    const user = await getUser();
    if (!user || !isOwner(user)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { promptId, answerText } = await request.json();

    if (!promptId || !answerText?.trim()) {
      return NextResponse.json(
        { error: "promptId and answerText are required" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // 1. Verify prompt exists and belongs to user
    const { data: prompt, error: promptError } = await supabase
      .from("prompts")
      .select("*")
      .eq("id", promptId)
      .eq("owner_id", user.id)
      .eq("status", "pending")
      .single();

    if (promptError || !prompt) {
      return NextResponse.json({ error: "Prompt not found" }, { status: 404 });
    }

    // 2. Create content block with the answer
    const { data: block, error: blockError } = await supabase
      .from("content_blocks")
      .insert({
        owner_id: user.id,
        type: "qa",
        title:
          prompt.prompt_text.substring(0, 100) +
          (prompt.prompt_text.length > 100 ? "..." : ""),
        body_text: answerText,
        source_question_id: promptId,
      })
      .select()
      .single();

    if (blockError || !block) {
      console.error("Error creating content block:", blockError);
      return NextResponse.json(
        { error: "Failed to save answer" },
        { status: 500 }
      );
    }

    // 3. Update prompt to answered
    const { error: updateError } = await supabase
      .from("prompts")
      .update({
        status: "answered",
        answer_block_id: block.id,
        answered_at: new Date().toISOString(),
      })
      .eq("id", promptId);

    if (updateError) {
      console.error("Error updating prompt:", updateError);
    }

    // 4. Embed the new content block (fire and forget)
    try {
      await fetch(new URL("/api/embed", request.url).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content_block_id: block.id }),
      });
    } catch (embedError) {
      console.error("Failed to embed answer:", embedError);
    }

    // 5. Generate a new prompt to replace this one
    try {
      await fetch(new URL("/api/prompts/generate", request.url).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: 1 }),
      });
    } catch (genError) {
      console.error("Failed to generate new prompt:", genError);
    }

    return NextResponse.json({ success: true, block });
  } catch (error) {
    console.error("Error in POST /api/prompts:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
