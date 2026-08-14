/**
 * Pure display-formatting helpers shared by client components.
 */

import { createElement, ReactElement } from "react";
import { FeedbackRequestWithStats } from "@/lib/db/types";

export function formatFileSize(bytes: number | null): string {
  if (!bytes) return "Unknown size";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function getFileIcon(mimeType: string): string {
  if (mimeType === "application/pdf") return "📄";
  if (mimeType.startsWith("image/")) return "🖼️";
  if (mimeType === "text/plain") return "📝";
  return "📎";
}

export function getSentimentColor(score: number | null): string {
  if (score === null) return "text-zinc-400";
  if (score >= 7) return "text-green-600 dark:text-green-400";
  if (score >= 4) return "text-yellow-600 dark:text-yellow-400";
  return "text-red-600 dark:text-red-400";
}

export function getStatusBadge(
  request: FeedbackRequestWithStats
): ReactElement {
  if (!request.is_active) {
    return createElement(
      "span",
      {
        className:
          "px-2 py-0.5 text-xs rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400",
      },
      "Inactive"
    );
  }
  if (request.expires_at && new Date(request.expires_at) < new Date()) {
    return createElement(
      "span",
      {
        className:
          "px-2 py-0.5 text-xs rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300",
      },
      "Expired"
    );
  }
  return createElement(
    "span",
    {
      className:
        "px-2 py-0.5 text-xs rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300",
    },
    "Active"
  );
}

export function getMatchColor(match: string): string {
  switch (match) {
    case "strong":
      return "text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30";
    case "moderate":
      return "text-yellow-600 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-900/30";
    default:
      return "text-orange-600 dark:text-orange-400 bg-orange-100 dark:bg-orange-900/30";
  }
}

export function getScoreColor(score: number): string {
  if (score >= 70) return "text-green-600 dark:text-green-400";
  if (score >= 50) return "text-yellow-600 dark:text-yellow-400";
  return "text-orange-600 dark:text-orange-400";
}
