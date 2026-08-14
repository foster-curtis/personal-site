// @vitest-environment jsdom
//
// This suite needs both a "has window" and a "no window" branch of
// isAnalyticsEnabled() (lib/analytics.ts) exercised in the same file. The
// `unit` project otherwise runs under `node` (no window at all), so this
// file opts into jsdom via the per-file environment pragma above and then
// uses vi.stubGlobal to simulate the "no window" (SSR/node) case on demand.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("posthog-js", () => ({
  default: { capture: vi.fn() },
}));

import posthog from "posthog-js";
import {
  isAnalyticsEnabled,
  trackEvent,
  trackChatMessage,
  trackChatResponse,
  trackPromptAnswered,
  trackPromptsRefreshed,
  trackJobAnalysis,
  trackFeedbackSubmitted,
  trackImportanceToggled,
} from "@/lib/analytics";

const mockCapture = vi.mocked(posthog.capture);

describe("isAnalyticsEnabled / trackEvent", () => {
  const originalKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "fake-posthog-key";
    mockCapture.mockClear();
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = originalKey;
    vi.unstubAllGlobals();
  });

  it("is disabled and never calls posthog.capture when window is undefined (node/SSR branch)", () => {
    vi.stubGlobal("window", undefined);
    expect(isAnalyticsEnabled()).toBe(false);
    trackEvent("some_event", { a: 1 });
    expect(mockCapture).not.toHaveBeenCalled();
  });

  it("is disabled and never calls posthog.capture when NEXT_PUBLIC_POSTHOG_KEY is unset (window present)", () => {
    delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
    expect(isAnalyticsEnabled()).toBe(false);
    trackEvent("some_event", { a: 1 });
    expect(mockCapture).not.toHaveBeenCalled();
  });

  it("is enabled when window is present and NEXT_PUBLIC_POSTHOG_KEY is set", () => {
    expect(isAnalyticsEnabled()).toBe(true);
    trackEvent("some_event", { a: 1 });
    expect(mockCapture).toHaveBeenCalledWith("some_event", { a: 1 });
  });
});

describe("tracking wrapper payload shapes", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "fake-posthog-key";
    mockCapture.mockClear();
  });

  it("trackChatMessage", () => {
    trackChatMessage(42);
    expect(mockCapture).toHaveBeenCalledWith("chat_message_sent", {
      message_length: 42,
    });
  });

  it("trackChatResponse", () => {
    trackChatResponse(100, 3);
    expect(mockCapture).toHaveBeenCalledWith("chat_response_received", {
      response_length: 100,
      source_count: 3,
    });
  });

  it("trackPromptAnswered", () => {
    trackPromptAnswered();
    expect(mockCapture).toHaveBeenCalledWith("prompt_answered", undefined);
  });

  it("trackPromptsRefreshed", () => {
    trackPromptsRefreshed();
    expect(mockCapture).toHaveBeenCalledWith(
      "prompts_refreshed",
      undefined
    );
  });

  it("trackJobAnalysis", () => {
    trackJobAnalysis();
    expect(mockCapture).toHaveBeenCalledWith("job_analysis_run", undefined);
  });

  it("trackFeedbackSubmitted with a relationship", () => {
    trackFeedbackSubmitted("coworker");
    expect(mockCapture).toHaveBeenCalledWith("feedback_submitted", {
      relationship: "coworker",
    });
  });

  it("trackFeedbackSubmitted without a relationship", () => {
    trackFeedbackSubmitted();
    expect(mockCapture).toHaveBeenCalledWith("feedback_submitted", {
      relationship: undefined,
    });
  });

  it("trackImportanceToggled", () => {
    trackImportanceToggled("resume", true);
    expect(mockCapture).toHaveBeenCalledWith("importance_toggled", {
      block_type: "resume",
      is_important: true,
    });
  });
});
