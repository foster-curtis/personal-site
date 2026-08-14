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
import { GET, PATCH, DELETE } from "@/app/api/data/[id]/route";
import { mockGetRequest, mockJsonRequest, mockParams } from "@/tests/helpers/request";
import {
  createMockSupabaseClient,
  asSupabaseClient,
  pgrst116Error,
  type MockSupabaseClient,
} from "@/tests/helpers/supabase-mock";
import type { User } from "@supabase/supabase-js";

const mockCreateClient = vi.mocked(createClient);
const mockGetUser = vi.mocked(getUser);
const mockIsOwner = vi.mocked(isOwner);

const OWNER: User = { id: "owner-1", email: "owner@example.com" } as User;

describe("/api/data/[id]", () => {
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
      const res = await GET(mockGetRequest("/api/data/abc"), mockParams({ id: "abc" }));
      expect(res.status).toBe(401);
    });

    it("returns 401 for a non-owner user", async () => {
      mockIsOwner.mockReturnValue(false);
      const res = await GET(mockGetRequest("/api/data/abc"), mockParams({ id: "abc" }));
      expect(res.status).toBe(401);
    });

    it("returns 404 when the block is not found (PGRST116)", async () => {
      supabase.queueFrom("content_blocks", { data: null, error: pgrst116Error() });
      const res = await GET(mockGetRequest("/api/data/abc"), mockParams({ id: "abc" }));
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Content block not found" });
    });

    it("returns 500 on other database errors", async () => {
      supabase.queueFrom("content_blocks", {
        data: null,
        error: { code: "500", message: "db down", details: "", hint: "" },
      });
      const res = await GET(mockGetRequest("/api/data/abc"), mockParams({ id: "abc" }));
      expect(res.status).toBe(500);
    });

    it("returns the block on success", async () => {
      const block = { id: "abc", title: "T" };
      supabase.queueFrom("content_blocks", { data: block, error: null });
      const res = await GET(mockGetRequest("/api/data/abc"), mockParams({ id: "abc" }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ data: block });
    });
  });

  describe("PATCH", () => {
    it("returns 401 when unauthenticated", async () => {
      mockGetUser.mockResolvedValue(null);
      const req = mockJsonRequest("/api/data/abc", { title: "New" }, { method: "PATCH" });
      const res = await PATCH(req, mockParams({ id: "abc" }));
      expect(res.status).toBe(401);
    });

    it("returns 401 for a non-owner user", async () => {
      mockIsOwner.mockReturnValue(false);
      const req = mockJsonRequest("/api/data/abc", { title: "New" }, { method: "PATCH" });
      const res = await PATCH(req, mockParams({ id: "abc" }));
      expect(res.status).toBe(401);
    });

    it("returns 400 for an invalid type", async () => {
      const req = mockJsonRequest("/api/data/abc", { type: "bogus" }, { method: "PATCH" });
      const res = await PATCH(req, mockParams({ id: "abc" }));
      expect(res.status).toBe(400);
    });

    it("returns 400 'No fields to update' for an empty body", async () => {
      const req = mockJsonRequest("/api/data/abc", {}, { method: "PATCH" });
      const res = await PATCH(req, mockParams({ id: "abc" }));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "No fields to update" });
    });

    it("sends only the fields present in the request body to Supabase, nothing else", async () => {
      supabase.queueFrom("content_blocks", {
        data: { id: "abc", title: "New title" },
        error: null,
      });
      const req = mockJsonRequest(
        "/api/data/abc",
        { title: "New title" },
        { method: "PATCH" }
      );
      const res = await PATCH(req, mockParams({ id: "abc" }));
      expect(res.status).toBe(200);

      const updateCall = supabase
        .queryCalls("content_blocks")
        .find((c) => c.method === "update");
      expect(updateCall?.args[0]).toEqual({ title: "New title" });
    });

    it("includes multiple provided fields but omits absent ones", async () => {
      supabase.queueFrom("content_blocks", {
        data: { id: "abc" },
        error: null,
      });
      const req = mockJsonRequest(
        "/api/data/abc",
        { title: "New title", is_important: true },
        { method: "PATCH" }
      );
      const res = await PATCH(req, mockParams({ id: "abc" }));
      expect(res.status).toBe(200);

      const updateCall = supabase
        .queryCalls("content_blocks")
        .find((c) => c.method === "update");
      expect(updateCall?.args[0]).toEqual({
        title: "New title",
        is_important: true,
      });
    });

    it("returns 404 when the target row doesn't exist (PGRST116)", async () => {
      supabase.queueFrom("content_blocks", { data: null, error: pgrst116Error() });
      const req = mockJsonRequest("/api/data/abc", { title: "New" }, { method: "PATCH" });
      const res = await PATCH(req, mockParams({ id: "abc" }));
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Content block not found" });
    });
  });

  describe("DELETE", () => {
    it("returns 401 when unauthenticated", async () => {
      mockGetUser.mockResolvedValue(null);
      const res = await DELETE(
        mockGetRequest("/api/data/abc"),
        mockParams({ id: "abc" })
      );
      expect(res.status).toBe(401);
    });

    it("returns 401 for a non-owner user", async () => {
      mockIsOwner.mockReturnValue(false);
      const res = await DELETE(
        mockGetRequest("/api/data/abc"),
        mockParams({ id: "abc" })
      );
      expect(res.status).toBe(401);
    });

    it("returns 200 success on a normal delete", async () => {
      supabase.queueFrom("content_blocks", { data: null, error: null });
      const res = await DELETE(
        mockGetRequest("/api/data/abc"),
        mockParams({ id: "abc" })
      );
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ success: true });
    });

    it("returns 500 when the delete errors", async () => {
      supabase.queueFrom("content_blocks", {
        data: null,
        error: { code: "500", message: "delete failed", details: "", hint: "" },
      });
      const res = await DELETE(
        mockGetRequest("/api/data/abc"),
        mockParams({ id: "abc" })
      );
      expect(res.status).toBe(500);
    });

    // KNOWN BUG (documented in plans/03-route-handler-tests.md): the route never checks
    // whether a row was actually deleted — Supabase's `.delete().eq(...)` returns no error
    // and no data when zero rows match, so deleting a nonexistent id currently returns
    // 200 {success: true} instead of 404. This characterization test pins that behavior;
    // it is not an endorsement of it.
    it("BUG: deleting a nonexistent id still returns 200 {success: true} instead of 404", async () => {
      supabase.queueFrom("content_blocks", { data: null, error: null });
      const res = await DELETE(
        mockGetRequest("/api/data/does-not-exist"),
        mockParams({ id: "does-not-exist" })
      );
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ success: true });
    });
  });
});
