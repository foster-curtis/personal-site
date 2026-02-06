"use client";

import { useState, useEffect } from "react";
import { Prompt } from "@/lib/db/types";
import { trackPromptAnswered, trackPromptsRefreshed } from "@/lib/analytics";

export default function PromptsPage() {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activePrompt, setActivePrompt] = useState<Prompt | null>(null);
  const [answer, setAnswer] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    fetchPrompts();
  }, []);

  const fetchPrompts = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/prompts");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPrompts(data.prompts || []);

      // Auto-generate prompts if none exist
      if (data.prompts?.length === 0) {
        await generatePrompts(3);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load prompts");
    } finally {
      setIsLoading(false);
    }
  };

  const generatePrompts = async (count: number = 1) => {
    setIsGenerating(true);
    try {
      const res = await fetch("/api/prompts/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count }),
      });
      if (res.ok) {
        await fetchPrompts();
      }
    } catch (err) {
      console.error("Failed to generate prompts:", err);
    } finally {
      setIsGenerating(false);
    }
  };

  const refreshPrompts = async () => {
    if (!confirm("Replace current questions with new ones?")) return;

    setIsRefreshing(true);
    setError(null);
    try {
      const res = await fetch("/api/prompts/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: 3 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      // Track prompts refreshed
      trackPromptsRefreshed();

      await fetchPrompts();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to refresh prompts"
      );
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleAnswer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePrompt || !answer.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          promptId: activePrompt.id,
          answerText: answer,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      // Track prompt answered
      trackPromptAnswered();

      setActivePrompt(null);
      setAnswer("");
      await fetchPrompts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit answer");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="text-center text-zinc-500 dark:text-zinc-400">
          Loading prompts...
        </div>
      </div>
    );
  }

  // Answer form view
  if (activePrompt) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <button
          onClick={() => {
            setActivePrompt(null);
            setAnswer("");
          }}
          className="text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300 mb-6"
        >
          &larr; Back to prompts
        </button>

        <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-lg border border-zinc-200 dark:border-zinc-800 p-6">
          <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-100 mb-4">
            {activePrompt.prompt_text}
          </h2>

          {error && (
            <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 rounded-lg text-red-700 dark:text-red-300 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleAnswer}>
            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Share your experience, story, or thoughts..."
              rows={8}
              className="w-full px-4 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y mb-4"
              disabled={isSubmitting}
              autoFocus
            />
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4">
              Be detailed! Your answer will be used to improve AI responses
              about you.
            </p>
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={isSubmitting || !answer.trim()}
                className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
              >
                {isSubmitting ? "Saving..." : "Submit Answer"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setActivePrompt(null);
                  setAnswer("");
                }}
                disabled={isSubmitting}
                className="px-6 py-2 bg-zinc-200 dark:bg-zinc-700 text-zinc-800 dark:text-zinc-200 rounded-lg hover:bg-zinc-300 dark:hover:bg-zinc-600 disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // Prompts list view
  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            Strengthen Your Profile
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            Answer these questions to help the AI better represent you.
          </p>
        </div>
        <div className="flex gap-2">
          {prompts.length > 0 && (
            <button
              onClick={refreshPrompts}
              disabled={isRefreshing || isGenerating}
              className="px-4 py-2 bg-zinc-200 dark:bg-zinc-700 text-zinc-800 dark:text-zinc-200 rounded-lg hover:bg-zinc-300 dark:hover:bg-zinc-600 disabled:opacity-50 transition-colors text-sm"
              title="Replace current questions with new ones"
            >
              {isRefreshing ? "Refreshing..." : "Refresh Questions"}
            </button>
          )}
          {prompts.length < 3 && (
            <button
              onClick={() => generatePrompts(3 - prompts.length)}
              disabled={isGenerating || isRefreshing}
              className="px-4 py-2 bg-zinc-200 dark:bg-zinc-700 text-zinc-800 dark:text-zinc-200 rounded-lg hover:bg-zinc-300 dark:hover:bg-zinc-600 disabled:opacity-50 transition-colors text-sm"
            >
              {isGenerating ? "Generating..." : "Get More Questions"}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 rounded-lg text-red-700 dark:text-red-300 text-sm">
          {error}
        </div>
      )}

      {prompts.length === 0 ? (
        <div className="text-center py-12 bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800">
          <p className="text-zinc-500 dark:text-zinc-400 mb-4">
            {isGenerating
              ? "Generating personalized questions..."
              : "No prompts available."}
          </p>
          {!isGenerating && (
            <button
              onClick={() => generatePrompts(3)}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium"
            >
              Generate Questions
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {prompts.map((prompt) => (
            <div
              key={prompt.id}
              className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 p-6 hover:border-blue-300 dark:hover:border-blue-700 transition-colors"
            >
              <p className="text-zinc-900 dark:text-zinc-100 mb-4">
                {prompt.prompt_text}
              </p>
              <button
                onClick={() => setActivePrompt(prompt)}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm font-medium"
              >
                Answer This
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-8 p-4 bg-zinc-100 dark:bg-zinc-800 rounded-lg">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          <strong>Tip:</strong> When you answer a question, it&apos;s saved as
          part of your profile and used by the AI to answer questions about you.
          A new question will appear to replace the one you answered.
        </p>
      </div>
    </div>
  );
}
