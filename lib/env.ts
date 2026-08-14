/**
 * Centralized validation for required server-side environment variables.
 * Importing this module validates immediately (at module load time) and
 * throws a single readable error listing everything missing, instead of
 * each caller failing separately deep inside a request handler.
 *
 * Server-only: do not import from client components. `NEXT_PUBLIC_*` vars
 * are still validated here because the server also depends on them (e.g.
 * the admin Supabase client), not because this module is meant for the browser.
 */

const REQUIRED_SERVER_ENV_VARS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "GEMINI_API_KEY",
  "OWNER_EMAIL",
] as const;

const missing = REQUIRED_SERVER_ENV_VARS.filter((key) => !process.env[key]);

if (missing.length > 0) {
  throw new Error(
    `Missing required environment variables: ${missing.join(", ")}`
  );
}

export const env = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL!,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY!,
  OWNER_EMAIL: process.env.OWNER_EMAIL!,
};
