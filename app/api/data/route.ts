import { createClient } from "@/lib/supabase/server";
import { getUser, isOwner } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import {
  ContentBlock,
  CreateContentBlockInput,
  ContentBlockType,
} from "@/lib/db/types";

// GET /api/data - List all content blocks for the owner
export async function GET(request: NextRequest) {
  try {
    const user = await getUser();

    if (!user || !isOwner(user)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") as ContentBlockType | null;

    let query = supabase
      .from("content_blocks")
      .select("*")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false });

    // Filter by type if provided
    if (type) {
      query = query.eq("type", type);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching content blocks:", error);
      return NextResponse.json(
        { error: "Failed to fetch content blocks" },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: data as ContentBlock[] });
  } catch (error) {
    console.error("Error in GET /api/data:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/data - Create a new content block
export async function POST(request: NextRequest) {
  try {
    const user = await getUser();

    if (!user || !isOwner(user)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body: CreateContentBlockInput = await request.json();

    // Validate required fields
    if (!body.type || !body.title || !body.body_text) {
      return NextResponse.json(
        { error: "Missing required fields: type, title, body_text" },
        { status: 400 }
      );
    }

    // Validate type
    const validTypes: ContentBlockType[] = [
      "resume",
      "story",
      "qa",
      "file_metadata",
    ];
    if (!validTypes.includes(body.type)) {
      return NextResponse.json(
        { error: `Invalid type. Must be one of: ${validTypes.join(", ")}` },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    const { data, error } = await supabase
      .from("content_blocks")
      .insert({
        owner_id: user.id,
        type: body.type,
        title: body.title,
        body_text: body.body_text,
        source_question_id: body.source_question_id || null,
        // Resume blocks are important by default
        is_important: body.type === "resume",
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating content block:", error);
      return NextResponse.json(
        { error: "Failed to create content block" },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: data as ContentBlock }, { status: 201 });
  } catch (error) {
    console.error("Error in POST /api/data:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
