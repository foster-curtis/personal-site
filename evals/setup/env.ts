/**
 * Loads real credentials from `.env.local` for the eval suite and fails fast if they're
 * missing. Evals call real Gemini and (for retrieval-quality) a real Supabase project —
 * never the fake sentinel values `tests/setup/env.ts` uses for the mocked unit/api/component
 * suite (see docs/dev-setup.md for how to populate `.env.local`).
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const envLocalPath = path.join(repoRoot, ".env.local");

if (existsSync(envLocalPath)) {
  process.loadEnvFile(envLocalPath);
}

const REQUIRED_ENV_VARS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "GEMINI_API_KEY",
  "OWNER_EMAIL",
] as const;

const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
if (missing.length > 0) {
  throw new Error(
    `evals/: missing required environment variables: ${missing.join(", ")}. ` +
      `Evals need real credentials in .env.local (see docs/dev-setup.md) — they never run ` +
      `against the fake env tests/setup/env.ts provides for the mocked test suite.`
  );
}

if (process.env.GEMINI_API_KEY === "fake-gemini-api-key") {
  throw new Error(
    "evals/: GEMINI_API_KEY is set to the fake sentinel value from tests/setup/env.ts. " +
      "Set a real key in .env.local to run evals."
  );
}
