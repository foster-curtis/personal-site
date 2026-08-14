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
import { GET, POST } from "@/app/api/data/route";
import { mockGetRequest, mockJsonRequest } from "@/tests/helpers/request";
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

describe("/api/data", () => {
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
      const res = await GET(mockGetRequest("/api/data"));
      expect(res.status).toBe(401);
    });

    it("returns 401 for a non-owner user", async () => {
      mockIsOwner.mockReturnValue(false);
      const res = await GET(mockGetRequest("/api/data"));
      expect(res.status).toBe(401);
    });

    it("returns the owner's content blocks", async () => {
      const blocks = [{ id: "b1", type: "resume", title: "Resume" }];
      supabase.queueFrom("content_blocks", { data: blocks, error: null });
      const res = await GET(mockGetRequest("/api/data"));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ data: blocks });
    });

    it("returns 500 on a database error", async () => {
      supabase.queueFrom("content_blocks", {
        data: null,
        error: { code: "500", message: "db down", details: "", hint: "" },
      });
      const res = await GET(mockGetRequest("/api/data"));
      expect(res.status).toBe(500);
    });
  });

  describe("POST", () => {
    it("returns 401 when unauthenticated", async () => {
      mockGetUser.mockResolvedValue(null);
      const req = mockJsonRequest("/api/data", {
        type: "story",
        title: "T",
        body_text: "B",
      });
      const res = await POST(req);
      expect(res.status).toBe(401);
    });

    it("returns 401 for a non-owner user", async () => {
      mockIsOwner.mockReturnValue(false);
      const req = mockJsonRequest("/api/data", {
        type: "story",
        title: "T",
        body_text: "B",
      });
      const res = await POST(req);
      expect(res.status).toBe(401);
    });

    it("returns 400 when required fields are missing", async () => {
      const req = mockJsonRequest("/api/data", { type: "story" });
      const res = await POST(req);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({
        error: "Missing required fields: type, title, body_text",
      });
    });

    it("returns 400 for an invalid type", async () => {
      const req = mockJsonRequest("/api/data", {
        type: "invalid",
        title: "T",
        body_text: "B",
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("Invalid type");
    });

    it("defaults is_important to true when type is 'resume'", async () => {
      supabase.queueFrom("content_blocks", {
        data: { id: "b1", type: "resume", is_important: true },
        error: null,
      });
      const req = mockJsonRequest("/api/data", {
        type: "resume",
        title: "My Resume",
        body_text: "Body",
      });
      const res = await POST(req);
      expect(res.status).toBe(201);

      const insertCall = supabase
        .queryCalls("content_blocks")
        .find((c) => c.method === "insert");
      expect(insertCall?.args[0]).toMatchObject({ is_important: true });
    });

    it("defaults is_important to false for non-resume types", async () => {
      supabase.queueFrom("content_blocks", {
        data: { id: "b1", type: "story", is_important: false },
        error: null,
      });
      const req = mockJsonRequest("/api/data", {
        type: "story",
        title: "A Story",
        body_text: "Body",
      });
      const res = await POST(req);
      expect(res.status).toBe(201);

      const insertCall = supabase
        .queryCalls("content_blocks")
        .find((c) => c.method === "insert");
      expect(insertCall?.args[0]).toMatchObject({ is_important: false });
    });

    it("returns 500 when the insert fails", async () => {
      supabase.queueFrom("content_blocks", {
        data: null,
        error: { code: "500", message: "insert failed", details: "", hint: "" },
      });
      const req = mockJsonRequest("/api/data", {
        type: "story",
        title: "T",
        body_text: "B",
      });
      const res = await POST(req);
      expect(res.status).toBe(500);
    });
  });
});
