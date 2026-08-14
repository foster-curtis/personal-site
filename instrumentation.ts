export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      await import("@/lib/env");
    } catch (error) {
      // Next.js logs instrumentation errors but keeps the server alive, serving
      // 500s from every route instead of crashing — defeats the point of failing
      // fast. Exit here so a missing var is impossible to miss at boot.
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    }
  }
}
