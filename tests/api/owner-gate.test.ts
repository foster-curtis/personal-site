/**
 * Cross-cutting owner-gate sweep.
 *
 * Iterates every owner-only route handler and asserts each returns 401 for both an
 * unauthenticated request and a request from an authenticated non-owner user. This is
 * cheap to write and catches the single worst possible regression: an admin-only
 * endpoint accidentally becoming public.
 *
 * KNOWN LIMITATION: this list is manually maintained, not auto-discovered from the
 * filesystem. A newly added owner-only route (or a newly added owner-only method on an
 * existing route) will NOT be picked up automatically — it has to be added below by hand.
 * Routes covered by this sweep (method + path):
 *   - POST /api/embed, GET /api/embed
 *   - GET /api/data, POST /api/data
 *   - GET/PATCH/DELETE /api/data/[id]
 *   - GET /api/feedback/analysis/[requestId]
 *   - POST /api/feedback/analysis/run
 *   - GET /api/feedback/requests, POST /api/feedback/requests
 *   - GET /api/feedback/requests/[id]
 *   - GET /api/files, POST /api/files
 *   - GET/DELETE /api/files/[id]
 *   - GET /api/prompts, POST /api/prompts
 *   - POST /api/prompts/generate
 *   - POST /api/prompts/refresh
 *   - POST /api/about (GET /api/about is intentionally public, not covered here)
 */
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
  generateContent: vi.fn(),
  generateWithContext: vi.fn(),
  embedText: vi.fn(),
  chunkText: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUser, isOwner } from "@/lib/auth";
import { mockGetRequest, mockJsonRequest, mockParams } from "@/tests/helpers/request";
import { createMockSupabaseClient, asSupabaseClient } from "@/tests/helpers/supabase-mock";
import type { User } from "@supabase/supabase-js";

import { GET as embedGET, POST as embedPOST } from "@/app/api/embed/route";
import { GET as dataGET, POST as dataPOST } from "@/app/api/data/route";
import {
  GET as dataIdGET,
  PATCH as dataIdPATCH,
  DELETE as dataIdDELETE,
} from "@/app/api/data/[id]/route";
import { GET as analysisRequestIdGET } from "@/app/api/feedback/analysis/[requestId]/route";
import { POST as analysisRunPOST } from "@/app/api/feedback/analysis/run/route";
import {
  GET as feedbackRequestsGET,
  POST as feedbackRequestsPOST,
} from "@/app/api/feedback/requests/route";
import { GET as feedbackRequestIdGET } from "@/app/api/feedback/requests/[id]/route";
import { GET as filesGET, POST as filesPOST } from "@/app/api/files/route";
import {
  GET as filesIdGET,
  DELETE as filesIdDELETE,
} from "@/app/api/files/[id]/route";
import { GET as promptsGET, POST as promptsPOST } from "@/app/api/prompts/route";
import { POST as promptsGeneratePOST } from "@/app/api/prompts/generate/route";
import { POST as promptsRefreshPOST } from "@/app/api/prompts/refresh/route";
import { POST as aboutPOST } from "@/app/api/about/route";

const mockCreateClient = vi.mocked(createClient);
const mockCreateAdminClient = vi.mocked(createAdminClient);
const mockGetUser = vi.mocked(getUser);
const mockIsOwner = vi.mocked(isOwner);

const NON_OWNER: User = { id: "someone-else", email: "not-owner@example.com" } as User;

interface RouteCase {
  name: string;
  call: () => Promise<Response>;
}

const cases: RouteCase[] = [
  { name: "GET /api/embed", call: () => embedGET() },
  { name: "POST /api/embed", call: () => embedPOST(mockJsonRequest("/api/embed", {})) },

  { name: "GET /api/data", call: () => dataGET(mockGetRequest("/api/data")) },
  { name: "POST /api/data", call: () => dataPOST(mockJsonRequest("/api/data", {})) },

  {
    name: "GET /api/data/[id]",
    call: () => dataIdGET(mockGetRequest("/api/data/x"), mockParams({ id: "x" })),
  },
  {
    name: "PATCH /api/data/[id]",
    call: () =>
      dataIdPATCH(
        mockJsonRequest("/api/data/x", {}, { method: "PATCH" }),
        mockParams({ id: "x" })
      ),
  },
  {
    name: "DELETE /api/data/[id]",
    call: () => dataIdDELETE(mockGetRequest("/api/data/x"), mockParams({ id: "x" })),
  },

  {
    name: "GET /api/feedback/analysis/[requestId]",
    call: () =>
      analysisRequestIdGET(
        mockGetRequest("/api/feedback/analysis/x"),
        mockParams({ requestId: "x" })
      ),
  },
  {
    name: "POST /api/feedback/analysis/run",
    call: () =>
      analysisRunPOST(mockJsonRequest("/api/feedback/analysis/run", {})),
  },

  { name: "GET /api/feedback/requests", call: () => feedbackRequestsGET() },
  {
    name: "POST /api/feedback/requests",
    call: () => feedbackRequestsPOST(mockJsonRequest("/api/feedback/requests", {})),
  },
  {
    name: "GET /api/feedback/requests/[id]",
    call: () =>
      feedbackRequestIdGET(
        mockGetRequest("/api/feedback/requests/x"),
        mockParams({ id: "x" })
      ),
  },

  { name: "GET /api/files", call: () => filesGET() },
  { name: "POST /api/files", call: () => filesPOST(mockJsonRequest("/api/files", {})) },
  {
    name: "GET /api/files/[id]",
    call: () => filesIdGET(mockGetRequest("/api/files/x"), mockParams({ id: "x" })),
  },
  {
    name: "DELETE /api/files/[id]",
    call: () => filesIdDELETE(mockGetRequest("/api/files/x"), mockParams({ id: "x" })),
  },

  { name: "GET /api/prompts", call: () => promptsGET(mockGetRequest("/api/prompts")) },
  {
    name: "POST /api/prompts",
    call: () => promptsPOST(mockJsonRequest("/api/prompts", {})),
  },
  {
    name: "POST /api/prompts/generate",
    call: () => promptsGeneratePOST(mockJsonRequest("/api/prompts/generate", {})),
  },
  {
    name: "POST /api/prompts/refresh",
    call: () => promptsRefreshPOST(mockJsonRequest("/api/prompts/refresh", {})),
  },

  { name: "POST /api/about", call: () => aboutPOST() },
];

describe("owner-gate sweep", () => {
  beforeEach(() => {
    const server = createMockSupabaseClient();
    const admin = createMockSupabaseClient();
    mockCreateClient.mockResolvedValue(asSupabaseClient(server));
    mockCreateAdminClient.mockReturnValue(asSupabaseClient(admin));
  });

  describe.each(cases)("$name", ({ call }) => {
    it("returns 401 when unauthenticated", async () => {
      mockGetUser.mockResolvedValue(null);
      mockIsOwner.mockReturnValue(false);
      const res = await call();
      expect(res.status).toBe(401);
    });

    it("returns 401 for an authenticated non-owner user", async () => {
      mockGetUser.mockResolvedValue(NON_OWNER);
      mockIsOwner.mockReturnValue(false);
      const res = await call();
      expect(res.status).toBe(401);
    });
  });
});
