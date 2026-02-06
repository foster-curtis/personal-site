import { createClient } from "@/lib/supabase/server";
import { getUser, isOwner } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import {
  ContentBlock,
  UpdateContentBlockInput,
  ContentBlockType,
} from "@/lib/db/types";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/data/[id] - Get a single content block
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getUser();

    if (!user || !isOwner(user)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("content_blocks")
      .select("*")
      .eq("id", id)
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

    return NextResponse.json({ data: data as ContentBlock });
  } catch (error) {
    console.error("Error in GET /api/data/[id]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// PATCH /api/data/[id] - Update a content block
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getUser();

    if (!user || !isOwner(user)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body: UpdateContentBlockInput = await request.json();

    // Validate type if provided
    if (body.type) {
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
    }

    const supabase = await createClient();

    // Build update object with only provided fields
    const updateData: Partial<UpdateContentBlockInput> = {};
    if (body.type !== undefined) updateData.type = body.type;
    if (body.title !== undefined) updateData.title = body.title;
    if (body.body_text !== undefined) updateData.body_text = body.body_text;
    if (body.is_important !== undefined) updateData.is_important = body.is_important;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("content_blocks")
      .update(updateData)
      .eq("id", id)
      .eq("owner_id", user.id)
      .select()
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return NextResponse.json(
          { error: "Content block not found" },
          { status: 404 }
        );
      }
      console.error("Error updating content block:", error);
      return NextResponse.json(
        { error: "Failed to update content block" },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: data as ContentBlock });
  } catch (error) {
    console.error("Error in PATCH /api/data/[id]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE /api/data/[id] - Delete a content block
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getUser();

    if (!user || !isOwner(user)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const supabase = await createClient();

    const { error } = await supabase
      .from("content_blocks")
      .delete()
      .eq("id", id)
      .eq("owner_id", user.id);

    if (error) {
      console.error("Error deleting content block:", error);
      return NextResponse.json(
        { error: "Failed to delete content block" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in DELETE /api/data/[id]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
