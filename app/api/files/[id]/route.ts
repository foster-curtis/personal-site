import { createClient } from "@/lib/supabase/server";
import { getUser, isOwner } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { FileRecord } from "@/lib/db/types";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/files/[id] - Get file metadata and signed download URL
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const user = await getUser();

    if (!user || !isOwner(user)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = await createClient();

    // Fetch file record
    const { data: file, error } = await supabase
      .from("files")
      .select("*")
      .eq("id", id)
      .eq("owner_id", user.id)
      .single();

    if (error || !file) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    // Generate signed URL for download (valid for 1 hour)
    const { data: urlData, error: urlError } = await supabase.storage
      .from("owner-files")
      .createSignedUrl(file.storage_path, 3600);

    if (urlError) {
      console.error("Error creating signed URL:", urlError);
      return NextResponse.json(
        { error: "Failed to generate download URL" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: file as FileRecord,
      downloadUrl: urlData.signedUrl,
    });
  } catch (error) {
    console.error("Error in GET /api/files/[id]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE /api/files/[id] - Delete a file
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const user = await getUser();

    if (!user || !isOwner(user)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = await createClient();

    // Fetch file record first to get storage path
    const { data: file, error: fetchError } = await supabase
      .from("files")
      .select("*")
      .eq("id", id)
      .eq("owner_id", user.id)
      .single();

    if (fetchError || !file) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    // Delete from storage
    const { error: storageError } = await supabase.storage
      .from("owner-files")
      .remove([file.storage_path]);

    if (storageError) {
      console.error("Error deleting file from storage:", storageError);
      // Continue to delete DB record even if storage delete fails
    }

    // Delete database record
    const { error: dbError } = await supabase
      .from("files")
      .delete()
      .eq("id", id)
      .eq("owner_id", user.id);

    if (dbError) {
      console.error("Error deleting file record:", dbError);
      return NextResponse.json(
        { error: "Failed to delete file" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in DELETE /api/files/[id]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
