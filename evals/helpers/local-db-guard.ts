const LOCAL_HOST_PATTERN = /^https?:\/\/(127\.0\.0\.1|localhost|host\.docker\.internal)(:\d+)?/i;

/**
 * Refuses to run against a non-local Supabase project unless explicitly overridden.
 *
 * `match_embeddings` (supabase/migrations/006_match_embeddings.sql) has no owner scoping —
 * it searches every row in `content_embeddings` regardless of who owns it (see the
 * single-owner assumption in docs/architecture.md). Seeding fixture content_blocks against
 * the hosted project would mix synthetic eval data into the real chat assistant's retrieval
 * results. Point NEXT_PUBLIC_SUPABASE_URL at a local `supabase start` stack (see
 * plans/06-db-integration.md) before running anything that writes fixture data.
 */
export function assertLocalSupabase(): void {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const override = process.env.EVAL_ALLOW_REMOTE_SEED === "true";

  if (!LOCAL_HOST_PATTERN.test(url) && !override) {
    throw new Error(
      `evals/: refusing to seed/delete fixture content against a non-local Supabase URL ` +
        `("${url}"). Point NEXT_PUBLIC_SUPABASE_URL at a local \`supabase start\` stack, or ` +
        `set EVAL_ALLOW_REMOTE_SEED=true if you deliberately mean to target this project.`
    );
  }
}
