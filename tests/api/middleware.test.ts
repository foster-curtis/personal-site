import { describe, it, expect, vi } from "vitest";

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
    },
  })),
}));

import { NextRequest } from "next/server";
import { middleware } from "@/middleware";

function request(path: string) {
  return new NextRequest(`http://localhost:3000${path}`);
}

describe("middleware", () => {
  it("adds nosniff and frame-deny security headers to /api/* paths", async () => {
    const res = await middleware(request("/api/data"));
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
  });

  it("uses the restrictive rate-limit headers (10/60) for /api/feedback/submit", async () => {
    const res = await middleware(request("/api/feedback/submit"));
    expect(res.headers.get("X-RateLimit-Limit")).toBe("10");
    expect(res.headers.get("X-RateLimit-Window")).toBe("60");
  });

  it("uses the restrictive rate-limit headers (10/60) for /api/chat", async () => {
    const res = await middleware(request("/api/chat"));
    expect(res.headers.get("X-RateLimit-Limit")).toBe("10");
    expect(res.headers.get("X-RateLimit-Window")).toBe("60");
  });

  it("uses the standard rate-limit headers (60/60) for other /api/* paths", async () => {
    const res = await middleware(request("/api/data"));
    expect(res.headers.get("X-RateLimit-Limit")).toBe("60");
    expect(res.headers.get("X-RateLimit-Window")).toBe("60");
  });

  it("does not add any security or rate-limit headers to non-/api/ paths", async () => {
    const res = await middleware(request("/dashboard"));
    expect(res.headers.get("X-Content-Type-Options")).toBeNull();
    expect(res.headers.get("X-Frame-Options")).toBeNull();
    expect(res.headers.get("X-RateLimit-Limit")).toBeNull();
    expect(res.headers.get("X-RateLimit-Window")).toBeNull();
  });
});
