import posthog from "posthog-js";

/**
 * Analytics utility functions for tracking custom events.
 * PostHog automatically tracks page views when configured.
 * Use these helpers for custom event tracking.
 */

/**
 * Check if analytics is enabled (PostHog key is configured)
 */
export function isAnalyticsEnabled(): boolean {
  return (
    typeof window !== "undefined" && !!process.env.NEXT_PUBLIC_POSTHOG_KEY
  );
}

/**
 * Track a custom event
 */
export function trackEvent(
  eventName: string,
  properties?: Record<string, unknown>
) {
  if (isAnalyticsEnabled()) {
    posthog.capture(eventName, properties);
  }
}

// Pre-defined event helpers for common actions

/**
 * Track when a user sends a chat message
 */
export function trackChatMessage(messageLength: number) {
  trackEvent("chat_message_sent", { message_length: messageLength });
}

/**
 * Track when a user receives a chat response
 */
export function trackChatResponse(responseLength: number, sourceCount: number) {
  trackEvent("chat_response_received", {
    response_length: responseLength,
    source_count: sourceCount,
  });
}

/**
 * Track when a user answers a prompt
 */
export function trackPromptAnswered() {
  trackEvent("prompt_answered");
}

/**
 * Track when a user refreshes prompts
 */
export function trackPromptsRefreshed() {
  trackEvent("prompts_refreshed");
}

/**
 * Track when a job analysis is run
 */
export function trackJobAnalysis() {
  trackEvent("job_analysis_run");
}

/**
 * Track when feedback is submitted
 */
export function trackFeedbackSubmitted(relationship?: string) {
  trackEvent("feedback_submitted", { relationship });
}

/**
 * Track when a content block importance is toggled
 */
export function trackImportanceToggled(
  blockType: string,
  newValue: boolean
) {
  trackEvent("importance_toggled", {
    block_type: blockType,
    is_important: newValue,
  });
}
