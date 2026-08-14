import { NextRequest } from "next/server";

const DEFAULT_BASE_URL = "http://localhost:3000";

function toUrl(path: string): string {
  return path.startsWith("http") ? path : `${DEFAULT_BASE_URL}${path}`;
}

/** Build a `NextRequest` with a JSON body, e.g. for POST/PATCH route handlers. */
export function mockJsonRequest(
  path: string,
  body: unknown,
  init: { method?: string; headers?: Record<string, string> } = {}
): NextRequest {
  return new NextRequest(toUrl(path), {
    method: init.method ?? "POST",
    headers: { "content-type": "application/json", ...init.headers },
    body: JSON.stringify(body),
  });
}

/** Build a `NextRequest` for a GET with query-string params. */
export function mockGetRequest(
  path: string,
  searchParams: Record<string, string> = {},
  init: { headers?: Record<string, string> } = {}
): NextRequest {
  const url = new URL(toUrl(path));
  for (const [key, value] of Object.entries(searchParams)) {
    url.searchParams.set(key, value);
  }
  return new NextRequest(url, { method: "GET", headers: init.headers });
}

/** Build a `NextRequest` with a `multipart/form-data` body, e.g. for the file upload route. */
export function mockFormDataRequest(
  path: string,
  formData: FormData,
  init: { method?: string; headers?: Record<string, string> } = {}
): NextRequest {
  return new NextRequest(toUrl(path), {
    method: init.method ?? "POST",
    headers: init.headers,
    body: formData,
  });
}

/**
 * Wrap route params in the async Promise Next.js 15+ dynamic routes expect
 * (see `RouteParams` in app/api/data/[id]/route.ts).
 */
export function mockParams<T extends Record<string, string>>(params: T): { params: Promise<T> } {
  return { params: Promise.resolve(params) };
}
