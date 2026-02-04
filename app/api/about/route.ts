import { NextResponse } from "next/server";
import {
  getAboutSummary,
  getLastContentUpdate,
  regenerateAboutSummary,
} from "@/lib/about";
import { getUser, isOwner } from "@/lib/auth";
import { logger, LogEvents } from "@/lib/logging";

/**
 * GET /api/about
 * Returns the about summary, using cache if available and valid.
 * Public endpoint - no auth required.
 */
export async function GET() {
  const startTime = performance.now();

  try {
    // Get the owner name from environment or use default
    const ownerName = process.env.OWNER_NAME || "Foster Curtis";

    // Get the about summary (uses cache if valid)
    const summary = await getAboutSummary(ownerName);

    // Get the last content update timestamp
    const lastContentUpdate = await getLastContentUpdate();

    const durationMs = Math.round(performance.now() - startTime);
    logger.info(LogEvents.ABOUT_PAGE_REQUEST, "About page data served", {
      duration_ms: durationMs,
      cached: summary.generatedAt !== new Date().toISOString().split("T")[0],
    });

    return NextResponse.json({
      ...summary,
      ownerName,
      lastContentUpdate,
    });
  } catch (error) {
    logger.error(LogEvents.API_ERROR, error, "Failed to get about summary");
    return NextResponse.json(
      { error: "Failed to get about summary" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/about
 * Force regenerate the about summary (clears cache).
 * Owner-only endpoint.
 */
export async function POST() {
  const startTime = performance.now();

  try {
    // Check authentication
    const user = await getUser();
    if (!user || !isOwner(user)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get the owner name from environment or use default
    const ownerName = process.env.OWNER_NAME || "Foster Curtis";

    // Force regenerate the summary
    const summary = await regenerateAboutSummary(ownerName);

    // Get the last content update timestamp
    const lastContentUpdate = await getLastContentUpdate();

    const durationMs = Math.round(performance.now() - startTime);
    logger.info(
      LogEvents.ABOUT_SUMMARY_GENERATED,
      "About summary regenerated",
      {
        duration_ms: durationMs,
      }
    );

    return NextResponse.json({
      ...summary,
      ownerName,
      lastContentUpdate,
      message: "About summary regenerated successfully",
    });
  } catch (error) {
    logger.error(
      LogEvents.API_ERROR,
      error,
      "Failed to regenerate about summary"
    );
    return NextResponse.json(
      { error: "Failed to regenerate about summary" },
      { status: 500 }
    );
  }
}
