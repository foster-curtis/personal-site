import { describe, it, expect } from "vitest";
import {
  formatFileSize,
  getFileIcon,
  getSentimentColor,
  getStatusBadge,
  getMatchColor,
  getScoreColor,
} from "@/lib/format";
import { FeedbackRequestWithStats } from "@/lib/db/types";
import type { ReactElement } from "react";

function badgeText(element: ReactElement): string {
  return (element.props as { children: string }).children;
}

function makeRequest(
  overrides: Partial<FeedbackRequestWithStats> = {}
): FeedbackRequestWithStats {
  return {
    id: "req-1",
    owner_id: "owner-1",
    created_at: "2026-01-01T00:00:00.000Z",
    expires_at: null,
    title: "Feedback request",
    notes: null,
    is_active: true,
    links: [],
    response_count: 0,
    responder_count: 0,
    ...overrides,
  };
}

describe("formatFileSize", () => {
  it("returns 'Unknown size' for null or 0", () => {
    expect(formatFileSize(null)).toBe("Unknown size");
    expect(formatFileSize(0)).toBe("Unknown size");
  });

  it("formats bytes under 1024 as B", () => {
    expect(formatFileSize(500)).toBe("500 B");
  });

  it("formats bytes under 1MB as KB", () => {
    expect(formatFileSize(2048)).toBe("2.0 KB");
  });

  it("formats bytes at or above 1MB as MB", () => {
    expect(formatFileSize(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});

describe("getFileIcon", () => {
  it("returns the pdf icon for application/pdf", () => {
    expect(getFileIcon("application/pdf")).toBe("📄");
  });

  it("returns the image icon for any image/* mime type", () => {
    expect(getFileIcon("image/png")).toBe("🖼️");
    expect(getFileIcon("image/jpeg")).toBe("🖼️");
  });

  it("returns the text icon for text/plain", () => {
    expect(getFileIcon("text/plain")).toBe("📝");
  });

  it("returns a generic icon for anything else", () => {
    expect(getFileIcon("application/zip")).toBe("📎");
  });
});

describe("getSentimentColor", () => {
  it("returns a neutral color for null", () => {
    expect(getSentimentColor(null)).toBe("text-zinc-400");
  });

  it("returns green for scores >= 7", () => {
    expect(getSentimentColor(7)).toBe("text-green-600 dark:text-green-400");
    expect(getSentimentColor(10)).toBe("text-green-600 dark:text-green-400");
  });

  it("returns yellow for scores >= 4 and < 7", () => {
    expect(getSentimentColor(4)).toBe(
      "text-yellow-600 dark:text-yellow-400"
    );
    expect(getSentimentColor(6)).toBe(
      "text-yellow-600 dark:text-yellow-400"
    );
  });

  it("returns red for scores below 4", () => {
    expect(getSentimentColor(0)).toBe("text-red-600 dark:text-red-400");
    expect(getSentimentColor(3)).toBe("text-red-600 dark:text-red-400");
  });
});

describe("getStatusBadge", () => {
  it("renders 'Inactive' when is_active is false", () => {
    const badge = getStatusBadge(makeRequest({ is_active: false }));
    expect(badgeText(badge)).toBe("Inactive");
  });

  it("renders 'Expired' when expires_at is in the past and request is active", () => {
    const badge = getStatusBadge(
      makeRequest({ is_active: true, expires_at: "2020-01-01T00:00:00.000Z" })
    );
    expect(badgeText(badge)).toBe("Expired");
  });

  it("renders 'Active' when is_active is true and not expired", () => {
    const future = new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString();
    const badge = getStatusBadge(
      makeRequest({ is_active: true, expires_at: future })
    );
    expect(badgeText(badge)).toBe("Active");
  });

  it("renders 'Active' when is_active is true and expires_at is null", () => {
    const badge = getStatusBadge(
      makeRequest({ is_active: true, expires_at: null })
    );
    expect(badgeText(badge)).toBe("Active");
  });
});

describe("getMatchColor", () => {
  it("returns green for 'strong'", () => {
    expect(getMatchColor("strong")).toContain("green");
  });

  it("returns yellow for 'moderate'", () => {
    expect(getMatchColor("moderate")).toContain("yellow");
  });

  it("returns orange for any other value", () => {
    expect(getMatchColor("weak")).toContain("orange");
    expect(getMatchColor("")).toContain("orange");
  });
});

describe("getScoreColor", () => {
  it("returns green for scores >= 70", () => {
    expect(getScoreColor(70)).toBe("text-green-600 dark:text-green-400");
  });

  it("returns yellow for scores >= 50 and < 70", () => {
    expect(getScoreColor(50)).toBe("text-yellow-600 dark:text-yellow-400");
    expect(getScoreColor(69)).toBe("text-yellow-600 dark:text-yellow-400");
  });

  it("returns orange for scores below 50", () => {
    expect(getScoreColor(49)).toBe("text-orange-600 dark:text-orange-400");
  });
});
