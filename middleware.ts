import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Middleware for authentication and security headers.
 *
 * Rate Limiting Strategy:
 * - For production deployments on Vercel, use Vercel's built-in rate limiting
 *   or Edge Middleware with KV storage for distributed rate limiting.
 * - The current implementation adds informational headers that can be used
 *   by upstream load balancers or monitoring tools.
 *
 * Security Headers:
 * - Added for public API endpoints to improve security posture.
 */
export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refreshing the auth token
  await supabase.auth.getUser();

  // Add security headers for API routes
  const pathname = request.nextUrl.pathname;
  if (pathname.startsWith("/api/")) {
    // Standard security headers
    supabaseResponse.headers.set("X-Content-Type-Options", "nosniff");
    supabaseResponse.headers.set("X-Frame-Options", "DENY");

    // Rate limit guidance headers (informational - actual enforcement via Vercel/CDN)
    // These values indicate recommended limits for clients
    if (
      pathname.startsWith("/api/feedback/submit") ||
      pathname.startsWith("/api/chat")
    ) {
      // More restrictive for submission endpoints
      supabaseResponse.headers.set("X-RateLimit-Limit", "10");
      supabaseResponse.headers.set("X-RateLimit-Window", "60");
    } else {
      // Standard rate limits for read endpoints
      supabaseResponse.headers.set("X-RateLimit-Limit", "60");
      supabaseResponse.headers.set("X-RateLimit-Window", "60");
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * Feel free to modify this pattern to include more paths.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
