import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

// GET /api/owner/resume - Get public resume summary
export async function GET() {
  try {
    const supabase = createAdminClient();
    const ownerEmail = process.env.OWNER_EMAIL;

    if (!ownerEmail) {
      return NextResponse.json(
        { error: "Owner not configured" },
        { status: 500 }
      );
    }

    // Get owner's user ID from auth
    const { data: users } = await supabase.auth.admin.listUsers();
    const owner = users?.users?.find(
      (u) => u.email?.toLowerCase() === ownerEmail.toLowerCase()
    );

    if (!owner) {
      return NextResponse.json({ blocks: [], summary: null });
    }

    // Get content blocks (resume and stories only, not qa or file_metadata)
    const { data: blocks, error } = await supabase
      .from("content_blocks")
      .select("id, type, title, body_text, created_at")
      .eq("owner_id", owner.id)
      .in("type", ["resume", "story"])
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching resume:", error);
      return NextResponse.json(
        { error: "Failed to fetch resume" },
        { status: 500 }
      );
    }

    // Build a simple text summary
    const summary = blocks
      ?.map((b) => `## ${b.title}\n${b.body_text}`)
      .join("\n\n---\n\n");

    return NextResponse.json({
      blocks: blocks || [],
      summary: summary || null,
    });
  } catch (error) {
    console.error("Error in GET /api/owner/resume:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
