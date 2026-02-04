"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface PublicSummary {
  available: boolean;
  summary_text?: string;
  highlights?: {
    strengths: string[];
    growth_areas: string[];
    themes: string[];
  };
  responder_count?: number;
  generated_at?: string;
  message?: string;
}

export default function ReferencesPage() {
  const [data, setData] = useState<PublicSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const ownerName = process.env.NEXT_PUBLIC_OWNER_NAME || "this person";

  useEffect(() => {
    fetchSummary();
  }, []);

  const fetchSummary = async () => {
    try {
      const res = await fetch("/api/feedback/public-summary");
      if (!res.ok) {
        throw new Error("Failed to fetch summary");
      }
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsLoading(false);
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-black">
        <div className="max-w-4xl mx-auto px-4 py-16">
          <div className="animate-pulse space-y-8">
            <div className="h-10 bg-zinc-200 dark:bg-zinc-800 rounded w-1/2"></div>
            <div className="h-6 bg-zinc-200 dark:bg-zinc-800 rounded w-3/4"></div>
            <div className="space-y-3">
              <div className="h-4 bg-zinc-200 dark:bg-zinc-800 rounded"></div>
              <div className="h-4 bg-zinc-200 dark:bg-zinc-800 rounded"></div>
              <div className="h-4 bg-zinc-200 dark:bg-zinc-800 rounded w-5/6"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-black">
        <div className="max-w-4xl mx-auto px-4 py-16">
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-8 text-center">
            <h1 className="text-2xl font-bold text-red-700 dark:text-red-400 mb-2">
              Unable to Load References
            </h1>
            <p className="text-red-600 dark:text-red-300">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  // No data available yet
  if (!data?.available) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-black">
        <div className="max-w-4xl mx-auto px-4 py-16">
          <div className="text-center">
            <h1 className="text-4xl font-bold text-zinc-900 dark:text-zinc-100 mb-4">
              Peer Feedback
            </h1>
            <p className="text-xl text-zinc-600 dark:text-zinc-400 mb-8">
              What others say about working with {ownerName}
            </p>
            <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-lg border border-zinc-200 dark:border-zinc-800 p-8">
              <div className="text-5xl mb-4">📋</div>
              <p className="text-zinc-500 dark:text-zinc-400">
                {data?.message ||
                  "Peer feedback is being collected. Check back soon!"}
              </p>
            </div>
          </div>

          {/* CTA to chat */}
          <div className="mt-12 text-center">
            <p className="text-zinc-600 dark:text-zinc-400 mb-4">
              In the meantime, learn more through the AI assistant.
            </p>
            <Link
              href="/chat"
              className="inline-block px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium"
            >
              Chat with AI
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      {/* Hero */}
      <section className="max-w-4xl mx-auto px-4 py-16">
        <h1 className="text-4xl md:text-5xl font-bold text-zinc-900 dark:text-zinc-100 mb-4">
          What Others Say
        </h1>
        <p className="text-xl text-zinc-600 dark:text-zinc-400 mb-2">
          Anonymous feedback from people who have worked with {ownerName}
        </p>
        <p className="text-sm text-zinc-500 dark:text-zinc-500">
          Based on feedback from {data.responder_count} colleague
          {data.responder_count !== 1 ? "s" : ""}
        </p>
      </section>

      {/* Summary */}
      <section className="max-w-4xl mx-auto px-4 pb-8">
        <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-lg border border-zinc-200 dark:border-zinc-800 p-8">
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-4">
            Overall Impression
          </h2>
          <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed whitespace-pre-wrap">
            {data.summary_text}
          </p>
        </div>
      </section>

      {/* Highlights */}
      {data.highlights && (
        <section className="max-w-4xl mx-auto px-4 pb-8">
          <div className="grid md:grid-cols-2 gap-6">
            {/* Strengths */}
            {data.highlights.strengths &&
              data.highlights.strengths.length > 0 && (
                <div className="bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-200 dark:border-green-800 p-6">
                  <h3 className="text-lg font-semibold text-green-800 dark:text-green-200 mb-4 flex items-center gap-2">
                    <span>✓</span> Strengths
                  </h3>
                  <ul className="space-y-2">
                    {data.highlights.strengths.map((strength, index) => (
                      <li
                        key={index}
                        className="text-green-700 dark:text-green-300 flex items-start gap-2"
                      >
                        <span className="text-green-500 mt-1">•</span>
                        <span>{strength}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

            {/* Themes */}
            {data.highlights.themes && data.highlights.themes.length > 0 && (
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800 p-6">
                <h3 className="text-lg font-semibold text-blue-800 dark:text-blue-200 mb-4 flex items-center gap-2">
                  <span>◆</span> Key Themes
                </h3>
                <ul className="space-y-2">
                  {data.highlights.themes.map((theme, index) => (
                    <li
                      key={index}
                      className="text-blue-700 dark:text-blue-300 flex items-start gap-2"
                    >
                      <span className="text-blue-500 mt-1">•</span>
                      <span>{theme}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Growth Areas (only show if there are any) */}
          {data.highlights.growth_areas &&
            data.highlights.growth_areas.length > 0 && (
              <div className="mt-6 bg-orange-50 dark:bg-orange-900/20 rounded-xl border border-orange-200 dark:border-orange-800 p-6">
                <h3 className="text-lg font-semibold text-orange-800 dark:text-orange-200 mb-4 flex items-center gap-2">
                  <span>↗</span> Areas for Growth
                </h3>
                <ul className="space-y-2">
                  {data.highlights.growth_areas.map((area, index) => (
                    <li
                      key={index}
                      className="text-orange-700 dark:text-orange-300 flex items-start gap-2"
                    >
                      <span className="text-orange-500 mt-1">•</span>
                      <span>{area}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
        </section>
      )}

      {/* CTA Section */}
      <section className="max-w-4xl mx-auto px-4 py-12">
        <div className="bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl p-8 text-center">
          <h2 className="text-2xl font-bold text-white mb-4">
            Want to know more?
          </h2>
          <p className="text-blue-100 mb-6">
            Ask the AI assistant about specific aspects of working with{" "}
            {ownerName}, or explore their experience and skills.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/chat"
              className="px-6 py-3 bg-white text-blue-600 rounded-lg hover:bg-blue-50 transition-colors font-medium"
            >
              Chat with AI
            </Link>
            <Link
              href="/about"
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium border border-blue-400"
            >
              View About Page
            </Link>
          </div>
        </div>
      </section>

      {/* Privacy note */}
      <section className="max-w-4xl mx-auto px-4 pb-8">
        <div className="text-center text-sm text-zinc-500 dark:text-zinc-500">
          <p>
            This summary is generated from anonymous peer feedback. Individual
            responses are never shown.
          </p>
          {data.generated_at && (
            <p className="mt-1">
              Last updated:{" "}
              {new Date(data.generated_at).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
