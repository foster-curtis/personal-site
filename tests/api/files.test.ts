import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({
  getUser: vi.fn(),
  isOwner: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { getUser, isOwner } from "@/lib/auth";
import { GET, POST } from "@/app/api/files/route";
import { mockFormDataRequest } from "@/tests/helpers/request";
import {
  createMockSupabaseClient,
  asSupabaseClient,
  type MockSupabaseClient,
} from "@/tests/helpers/supabase-mock";
import type { User } from "@supabase/supabase-js";

const mockCreateClient = vi.mocked(createClient);
const mockGetUser = vi.mocked(getUser);
const mockIsOwner = vi.mocked(isOwner);

const OWNER: User = { id: "owner-1", email: "owner@example.com" } as User;

function makeFile(
  overrides: { name?: string; type?: string; size?: number; content?: string } = {}
): File {
  // `size` needs *real* content: NextRequest serializes the FormData to an actual
  // multipart body, and `request.formData()` reconstructs fresh File objects from
  // those bytes on the way back out — a `size` property patched onto the original
  // File instance doesn't survive that round trip, only real byte length does.
  const parts: BlobPart[] =
    overrides.size !== undefined
      ? [new Uint8Array(overrides.size)]
      : [overrides.content ?? "file content"];
  return new File(parts, overrides.name ?? "resume.pdf", {
    type: overrides.type ?? "application/pdf",
  });
}

function uploadRequest(file: File | null) {
  const formData = new FormData();
  if (file) formData.set("file", file);
  return mockFormDataRequest("/api/files", formData);
}

describe("/api/files", () => {
  let supabase: MockSupabaseClient;

  beforeEach(() => {
    supabase = createMockSupabaseClient();
    mockCreateClient.mockResolvedValue(asSupabaseClient(supabase));
    mockGetUser.mockResolvedValue(OWNER);
    mockIsOwner.mockReturnValue(true);
  });

  describe("GET", () => {
    it("returns 401 when unauthenticated", async () => {
      mockGetUser.mockResolvedValue(null);
      const res = await GET();
      expect(res.status).toBe(401);
    });

    it("returns 401 for a non-owner user", async () => {
      mockIsOwner.mockReturnValue(false);
      const res = await GET();
      expect(res.status).toBe(401);
    });

    it("returns the owner's files", async () => {
      const files = [{ id: "f1", name: "resume.pdf" }];
      supabase.queueFrom("files", { data: files, error: null });
      const res = await GET();
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ data: files });
    });
  });

  describe("POST", () => {
    it("returns 401 when unauthenticated", async () => {
      mockGetUser.mockResolvedValue(null);
      const res = await POST(uploadRequest(makeFile()));
      expect(res.status).toBe(401);
    });

    it("returns 401 for a non-owner user", async () => {
      mockIsOwner.mockReturnValue(false);
      const res = await POST(uploadRequest(makeFile()));
      expect(res.status).toBe(401);
    });

    it("returns 400 when no file is provided", async () => {
      const res = await POST(uploadRequest(null));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "No file provided" });
    });

    it("returns 400 for a disallowed MIME type", async () => {
      const res = await POST(
        uploadRequest(makeFile({ type: "application/zip", name: "archive.zip" }))
      );
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("Invalid file type");
    });

    it("returns 400 when the file exceeds the 50MB cap", async () => {
      const res = await POST(
        uploadRequest(makeFile({ size: 50 * 1024 * 1024 + 1 }))
      );
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({
        error: "File too large. Maximum size is 50MB",
      });
    });

    it("accepts a file at exactly the 50MB boundary", async () => {
      supabase.storage.queueUpload({ data: { path: "x" }, error: null });
      supabase.queueFrom("files", { data: { id: "f1" }, error: null });
      const res = await POST(uploadRequest(makeFile({ size: 50 * 1024 * 1024 })));
      expect(res.status).toBe(201);
    });

    it("sanitizes special characters out of the stored filename", async () => {
      supabase.storage.queueUpload({ data: { path: "x" }, error: null });
      supabase.queueFrom("files", { data: { id: "f1" }, error: null });

      const res = await POST(
        uploadRequest(makeFile({ name: "my resume!@#2024.pdf" }))
      );
      expect(res.status).toBe(201);

      const uploadCall = supabase.storage
        .calls("owner-files")
        .find((c) => c.method === "upload");
      const storagePath = uploadCall?.args[0] as string;
      expect(storagePath).toMatch(/^owner-1\/\d+_my_resume___2024\.pdf$/);
    });

    it("returns 500 when the storage upload fails", async () => {
      supabase.storage.queueUpload({
        data: null,
        error: { code: "500", message: "bucket unavailable", details: "", hint: "" },
      });
      const res = await POST(uploadRequest(makeFile()));
      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.error).toContain("bucket unavailable");
    });

    it("returns 201 with the file record on success", async () => {
      supabase.storage.queueUpload({ data: { path: "owner-1/123_resume.pdf" }, error: null });
      const record = { id: "f1", name: "resume.pdf" };
      supabase.queueFrom("files", { data: record, error: null });

      const res = await POST(uploadRequest(makeFile()));
      expect(res.status).toBe(201);
      expect(await res.json()).toEqual({ data: record });
    });

    // Compensating-action test: a DB insert failure after a successful storage upload
    // must not leave an orphaned object in the bucket.
    it("removes the uploaded object from storage when the DB insert fails after a successful upload", async () => {
      supabase.storage.queueUpload({ data: { path: "irrelevant" }, error: null });
      supabase.queueFrom("files", {
        data: null,
        error: { code: "500", message: "insert failed", details: "", hint: "" },
      });

      const res = await POST(uploadRequest(makeFile()));
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: "Failed to save file record" });

      const calls = supabase.storage.calls("owner-files");
      const uploadCall = calls.find((c) => c.method === "upload");
      const removeCall = calls.find((c) => c.method === "remove");
      expect(uploadCall).toBeDefined();
      expect(removeCall).toBeDefined();
      // The cleanup removes exactly the same storage path that was uploaded.
      expect(removeCall?.args[0]).toEqual([uploadCall?.args[0]]);
    });
  });
});
