"use client";

import posthog from "posthog-js";
import { PostHogProvider as PHProvider } from "posthog-js/react";
import { useEffect } from "react";

export default function PostHogProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    // Only initialize PostHog if the API key is configured
    const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    const posthogHost =
      process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";

    if (posthogKey && typeof window !== "undefined") {
      posthog.init(posthogKey, {
        api_host: posthogHost,
        // Capture pageviews automatically
        capture_pageview: true,
        // Capture pageleave events
        capture_pageleave: true,
        // Respect Do Not Track
        respect_dnt: true,
        // Disable in development unless explicitly enabled
        loaded: () => {
          if (process.env.NODE_ENV === "development") {
            // Uncomment the line below to enable PostHog in development
            // posthog.debug();
          }
        },
      });
    }
  }, []);

  // Only wrap with PHProvider if PostHog is configured
  const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!posthogKey) {
    return <>{children}</>;
  }

  return <PHProvider client={posthog}>{children}</PHProvider>;
}
