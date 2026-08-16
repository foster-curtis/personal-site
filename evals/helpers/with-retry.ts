/**
 * Retries a real Gemini-backed call on rate limiting. The free tier's per-minute quota
 * (confirmed by hand: `generate_content_free_tier_requests, limit: 5`) is far below what
 * this suite's trialCount-repeated categories need in a single run, so 429s are an expected,
 * not exceptional, occurrence here — retrying is the fix, not a bug workaround.
 *
 * Job-compare and chat route handlers catch every internal error and return a generic 500
 * with no cause attached, so a 429 and a genuine bug are indistinguishable from the eval's
 * side for those paths — retrying on any failure is the pragmatic choice: a real bug keeps
 * failing after retries and still surfaces (just slower), while a rate limit recovers.
 * lib/feedback/analysis.ts doesn't go through a route, so its errors are the raw
 * GoogleGenerativeAI error and do carry a real 429 + retryDelay.
 *
 * Two error classes are deliberately NOT retried, both found by running this suite for
 * real: a **daily** quota (`GenerateRequestsPerDayPerProjectPerModel-FreeTier`, seen capped
 * at 20/day) can't be waited out inside one run — the API's self-reported `retryDelay` for
 * it was sometimes under a second, which just re-fails instantly, and 6 retries of that
 * across a `trialCount`-repeated eval burned nearly two hours before the run's own
 * `testTimeout` started killing individual test cases mid-retry. A 404 ("model not found")
 * is a config/naming problem, not a transient one — retrying it 6 times wastes the same
 * time for zero chance of success. Both fail fast instead, with a message pointing at the
 * actual cause.
 */
function isDailyQuotaExhausted(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /PerDay/i.test(message);
}

function isNotFound(error: unknown): boolean {
  const status = (error as { status?: number } | undefined)?.status;
  const message = error instanceof Error ? error.message : String(error);
  return status === 404 || / \[404 ?\]/.test(message);
}

function extractRetryDelaySeconds(error: unknown): number | null {
  const message = error instanceof Error ? error.message : String(error);
  const match =
    message.match(/"retryDelay":"(\d+(?:\.\d+)?)s"/) ??
    message.match(/retry in ([\d.]+)s/i);
  return match ? Math.ceil(Number(match[1])) : null;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: { maxAttempts?: number; label: string }
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 6;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (isDailyQuotaExhausted(error)) {
        throw new Error(
          `evals/: ${options.label} hit a Gemini **daily** quota (not a per-minute one) — ` +
            `retrying within this run can't fix that. Wait for the quota to reset (check ` +
            `https://ai.dev/rate-limit) or use a key/project with a higher tier. ` +
            `Original error: ${error instanceof Error ? error.message : error}`
        );
      }
      if (isNotFound(error)) {
        throw new Error(
          `evals/: ${options.label} got a 404 (not found) — this is a config/naming problem, ` +
            `not a transient one, so retrying won't help. Original error: ` +
            `${error instanceof Error ? error.message : error}`
        );
      }
      if (attempt === maxAttempts) break;

      const delaySeconds = extractRetryDelaySeconds(error) ?? attempt * 10;
      const message = error instanceof Error ? error.message.slice(0, 200) : String(error);
      console.warn(
        `evals/: ${options.label} failed (attempt ${attempt}/${maxAttempts}), retrying in ` +
          `${delaySeconds}s: ${message}`
      );
      await new Promise((resolve) => setTimeout(resolve, delaySeconds * 1000));
    }
  }

  throw lastError;
}
