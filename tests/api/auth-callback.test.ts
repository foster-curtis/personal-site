import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { GET } from "@/app/(auth)/callback/route";
import { mockGetRequest } from "@/tests/helpers/request";
import {
  createMockSupabaseClient,
  asSupabaseClient,
  type MockSupabaseClient,
} from "@/tests/helpers/supabase-mock";

const mockCreateClient = vi.mocked(createClient);

describe("GET /(auth)/callback", () => {
  let supabase: MockSupabaseClient;

  beforeEach(() => {
    supabase = createMockSupabaseClient();
    mockCreateClient.mockResolvedValue(asSupabaseClient(supabase));
  });

  it("redirects to /dashboard when the code exchanges successfully for the owner", async () => {
    supabase.auth.setSession({
      user: { email: "owner@example.com" },
    });
    const req = mockGetRequest("/callback", { code: "valid-code" });
    const res = await GET(req);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3000/dashboard");
  });

  it("redirects to /access-denied when the code exchanges successfully for a non-owner", async () => {
    supabase.auth.setSession({
      user: { email: "someone-else@example.com" },
    });
    const req = mockGetRequest("/callback", { code: "valid-code" });
    const res = await GET(req);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(
      "http://localhost:3000/access-denied"
    );
  });

  it("redirects to /login?error=auth_failed when no code is present", async () => {
    const req = mockGetRequest("/callback");
    const res = await GET(req);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(
      "http://localhost:3000/login?error=auth_failed"
    );
  });

  it("redirects to /login?error=auth_failed when the code exchange fails to produce a session", async () => {
    // Default mock session is null with no error, standing in for both an
    // exchange error and an exchange that simply returns no session — the
    // route treats both identically (see app/(auth)/callback/route.ts:12).
    const req = mockGetRequest("/callback", { code: "bad-code" });
    const res = await GET(req);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(
      "http://localhost:3000/login?error=auth_failed"
    );
  });
});
