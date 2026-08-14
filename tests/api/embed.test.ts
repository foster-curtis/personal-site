import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({
  getUser: vi.fn(),
  isOwner: vi.fn(),
}));
vi.mock("@/lib/gemini/client", () => ({
  embedText: vi.fn(),
  chunkText: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUser, isOwner } from "@/lib/auth";
import { embedText, chunkText } from "@/lib/gemini/client";
import { GET, POST } from "@/app/api/embed/route";
import { mockJsonRequest } from "@/tests/helpers/request";
import {
  createMockSupabaseClient,
  asSupabaseClient,
  pgrst116Error,
  type MockSupabaseClient,
} from "@/tests/helpers/supabase-mock";
import type { User } from "@supabase/supabase-js";

const mockCreateClient = vi.mocked(createClient);
const mockCreateAdminClient = vi.mocked(createAdminClient);
const mockGetUser = vi.mocked(getUser);
const mockIsOwner = vi.mocked(isOwner);
const mockEmbedText = vi.mocked(embedText);
const mockChunkText = vi.mocked(chunkText);

const OWNER: User = { id: "owner-1", email: "owner@example.com" } as User;

describe("/api/embed", () => {
  let server: MockSupabaseClient;
  let admin: MockSupabaseClient;

  beforeEach(() => {
    server = createMockSupabaseClient();
    admin = createMockSupabaseClient();
    mockCreateClient.mockResolvedValue(asSupabaseClient(server));
    mockCreateAdminClient.mockReturnValue(asSupabaseClient(admin));
    mockGetUser.mockResolvedValue(OWNER);
    mockIsOwner.mockReturnValue(true);
    mockEmbedText.mockResolvedValue([0.1, 0.2, 0.3]);
    mockChunkText.mockReturnValue(["chunk one"]);
  });

  describe("POST", () => {
    it("returns 401 when unauthenticated", async () => {
      mockGetUser.mockResolvedValue(null);
      const res = await POST(mockJsonRequest("/api/embed", {}));
      expect(res.status).toBe(401);
    });

    it("returns 401 for a non-owner user", async () => {
      mockIsOwner.mockReturnValue(false);
      const res = await POST(mockJsonRequest("/api/embed", {}));
      expect(res.status).toBe(401);
    });

    it("returns 400 when neither content_block_id nor sync_all is provided", async () => {
      const res = await POST(mockJsonRequest("/api/embed", {}));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({
        error: "Either content_block_id or sync_all must be provided",
      });
    });

    it("returns 404 when content_block_id doesn't match a row (PGRST116)", async () => {
      server.queueFrom("content_blocks", { data: null, error: pgrst116Error() });
      const res = await POST(
        mockJsonRequest("/api/embed", { content_block_id: "missing-id" })
      );
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Content block not found" });
    });

    it("returns 500 when sync_all's fetch errors", async () => {
      server.queueFrom("content_blocks", {
        data: null,
        error: { code: "500", message: "db down", details: "", hint: "" },
      });
      const res = await POST(mockJsonRequest("/api/embed", { sync_all: true }));
      expect(res.status).toBe(500);
    });

    it("returns 200 with zero embedded when there are no content blocks to embed", async () => {
      server.queueFrom("content_blocks", { data: [], error: null });
      const res = await POST(mockJsonRequest("/api/embed", { sync_all: true }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        message: "No content blocks to embed",
        embedded: 0,
        chunks: 0,
      });
    });

    it("uses the admin client (not the server client) for embedding deletes/inserts, and counts only successfully-inserted chunks", async () => {
      server.queueFrom("content_blocks", {
        data: [{ id: "block-1", title: "My Block", body_text: "Some long text." }],
        error: null,
      });
      mockChunkText.mockReturnValue(["chunk one", "chunk two", "chunk three"]);

      // Sequence of `.from("content_embeddings")` calls on the ADMIN client:
      // 1 delete (existing embeddings) + 3 inserts (one per chunk), with the
      // middle chunk's insert failing.
      admin.queueFrom("content_embeddings", { data: null, error: null }); // delete
      admin.queueFrom("content_embeddings", { data: { id: "e1" }, error: null }); // chunk 1 insert ok
      admin.queueFrom("content_embeddings", {
        data: null,
        error: { code: "500", message: "insert failed", details: "", hint: "" },
      }); // chunk 2 insert fails — logged and skipped, not fatal
      admin.queueFrom("content_embeddings", { data: { id: "e3" }, error: null }); // chunk 3 insert ok

      const res = await POST(mockJsonRequest("/api/embed", { sync_all: true }));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.embedded).toBe(1);
      // Only 2 of the 3 chunks succeeded — the failed insert doesn't count and
      // doesn't fail the overall request.
      expect(json.chunks).toBe(2);

      // The server client was never asked to touch content_embeddings — only the
      // admin client bypasses RLS for this table.
      expect(server.queryCalls("content_embeddings")).toEqual([]);
      const deleteCall = admin
        .queryCalls("content_embeddings")
        .find((c) => c.method === "delete");
      expect(deleteCall).toBeDefined();
    });

    it("continues syncing other chunks when embedText throws for one chunk", async () => {
      server.queueFrom("content_blocks", {
        data: [{ id: "block-1", title: "My Block", body_text: "Some long text." }],
        error: null,
      });
      mockChunkText.mockReturnValue(["chunk one", "chunk two"]);
      mockEmbedText
        .mockResolvedValueOnce([0.1, 0.2])
        .mockRejectedValueOnce(new Error("embedding API down"));

      admin.queueFrom("content_embeddings", { data: null, error: null }); // delete
      admin.queueFrom("content_embeddings", { data: { id: "e1" }, error: null }); // chunk 1 insert ok
      // chunk 2's embedText throws before any insert call is made for it.

      const res = await POST(mockJsonRequest("/api/embed", { sync_all: true }));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.chunks).toBe(1);
    });
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

    it("returns content_blocks and embeddings counts, reading embeddings via the admin client", async () => {
      server.queueFrom("content_blocks", { data: null, count: 5, error: null });
      server.queueFrom("content_blocks", {
        data: [{ id: "b1" }, { id: "b2" }],
        error: null,
      });
      admin.queueFrom("content_embeddings", { data: null, count: 12, error: null });

      const res = await GET();
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ content_blocks: 5, embeddings: 12 });
    });

    it("does not query the admin client for embeddings when the owner has no content blocks", async () => {
      server.queueFrom("content_blocks", { data: null, count: 0, error: null });
      server.queueFrom("content_blocks", { data: [], error: null });

      const res = await GET();
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ content_blocks: 0, embeddings: 0 });
      expect(admin.queryCalls("content_embeddings")).toEqual([]);
    });
  });
});
