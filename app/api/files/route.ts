import { createClient } from "@/lib/supabase/server";
import { getUser, isOwner } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { FileRecord } from "@/lib/db/types";

// GET /api/files - List all files for the owner
export async function GET() {
  try {
    const user = await getUser();

    if (!user || !isOwner(user)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = await createClient();

    const { data, error } = await supabase
      .from("files")
      .select("*")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching files:", error);
      return NextResponse.json(
        { error: "Failed to fetch files" },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: data as FileRecord[] });
  } catch (error) {
    console.error("Error in GET /api/files:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/files - Upload a new file
export async function POST(request: NextRequest) {
  try {
    const user = await getUser();

    if (!user || !isOwner(user)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Validate file type
    const allowedTypes = [
      "application/pdf",
      "image/png",
      "image/jpeg",
      "image/gif",
      "text/plain",
    ];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        {
          error: `Invalid file type. Allowed types: ${allowedTypes.join(", ")}`,
        },
        { status: 400 }
      );
    }

    // Validate file size (50MB max)
    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 50MB" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Generate unique file path: {user_id}/{timestamp}_{filename}
    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
    const storagePath = `${user.id}/${timestamp}_${safeName}`;

    // Upload to Supabase Storage
    const arrayBuffer = await file.arrayBuffer();
    const { error: uploadError } = await supabase.storage
      .from("owner-files")
      .upload(storagePath, arrayBuffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("Error uploading file:", uploadError);
      return NextResponse.json(
        { error: "Failed to upload file: " + uploadError.message },
        { status: 500 }
      );
    }

    // Insert file record into database
    const { data, error: dbError } = await supabase
      .from("files")
      .insert({
        owner_id: user.id,
        name: file.name,
        storage_path: storagePath,
        mime_type: file.type,
        size_bytes: file.size,
      })
      .select()
      .single();

    if (dbError) {
      console.error("Error inserting file record:", dbError);
      // Try to clean up uploaded file
      await supabase.storage.from("owner-files").remove([storagePath]);
      return NextResponse.json(
        { error: "Failed to save file record" },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: data as FileRecord }, { status: 201 });
  } catch (error) {
    console.error("Error in POST /api/files:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
