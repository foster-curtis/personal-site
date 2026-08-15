import { NextRequest } from "next/server";

const BASE_URL = "http://localhost:3000";

/**
 * Builds a real `NextRequest` for invoking a route handler's exported `POST` directly, the
 * same way `tests/helpers/request.ts` does for the mocked test suite — except everything
 * downstream of the route (Supabase, Gemini) is real here, not mocked. Kept as its own copy
 * rather than importing `tests/helpers/request.ts` so `evals/` has no dependency on the
 * mocked-test-suite helpers, which are free to change for test-only reasons.
 */
export function jsonRequest(path: string, body: unknown): NextRequest {
  return new NextRequest(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
