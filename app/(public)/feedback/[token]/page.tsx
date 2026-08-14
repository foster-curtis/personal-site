"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import {
  FEEDBACK_QUESTIONS,
  getMetadataQuestions,
  getContentQuestions,
  FeedbackQuestion,
} from "@/lib/feedback/questions";
import { trackFeedbackSubmitted } from "@/lib/analytics";

interface FormData {
  request: {
    id: string;
    title: string | null;
    notes: string | null;
  };
  link: {
    id: string;
    token: string;
    expires_at: string | null;
    max_submissions: number | null;
    submission_count: number;
  };
}

export default function FeedbackFormPage() {
  const params = useParams();
  const token = params.token as string;

  const [formData, setFormData] = useState<FormData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  // Form values
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchFormData();
  }, [token]);

  const fetchFormData = async () => {
    try {
      const res = await fetch(`/api/feedback/form/${token}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Invalid or expired link");
      }

      setFormData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load form");
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (id: string, value: string) => {
    setValues((prev) => ({ ...prev, [id]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    // Separate metadata from content
    const metadataIds = getMetadataQuestions().map((q) => q.id);
    const contentIds = getContentQuestions().map((q) => q.id);

    const metadata: Record<string, string> = {};
    const content: Record<string, string> = {};

    Object.entries(values).forEach(([key, value]) => {
      if (value.trim()) {
        if (metadataIds.includes(key)) {
          metadata[key] = value;
        } else if (contentIds.includes(key)) {
          content[key] = value;
        }
      }
    });

    try {
      const res = await fetch("/api/feedback/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          metadata,
          content,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to submit feedback");
      }

      // Track feedback submitted (with relationship type if provided)
      trackFeedbackSubmitted(metadata.relationship);

      setIsSubmitted(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to submit feedback"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderQuestion = (question: FeedbackQuestion) => {
    const value = values[question.id] || "";
    const inputId = `question-${question.id}`;
    const describedById = question.helpText ? `${inputId}-help` : undefined;

    switch (question.type) {
      case "select":
        return (
          <select
            id={inputId}
            value={value}
            onChange={(e) => handleChange(question.id, e.target.value)}
            required={question.required}
            aria-describedby={describedById}
            className="w-full px-4 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Select an option...</option>
            {question.options?.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        );

      case "textarea":
        return (
          <textarea
            id={inputId}
            value={value}
            onChange={(e) => handleChange(question.id, e.target.value)}
            placeholder={question.placeholder}
            required={question.required}
            aria-describedby={describedById}
            rows={4}
            className="w-full px-4 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
          />
        );

      default:
        return (
          <input
            id={inputId}
            type="text"
            value={value}
            onChange={(e) => handleChange(question.id, e.target.value)}
            placeholder={question.placeholder}
            required={question.required}
            aria-describedby={describedById}
            className="w-full px-4 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        );
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-black">
        <div className="max-w-2xl mx-auto px-4 py-16">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-zinc-200 dark:bg-zinc-800 rounded w-2/3"></div>
            <div className="h-4 bg-zinc-200 dark:bg-zinc-800 rounded w-full"></div>
            <div className="h-32 bg-zinc-200 dark:bg-zinc-800 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error && !formData) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-black">
        <div className="max-w-2xl mx-auto px-4 py-16">
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-8 text-center">
            <h1 className="text-2xl font-bold text-red-700 dark:text-red-400 mb-2">
              Unable to Load Form
            </h1>
            <p className="text-red-600 dark:text-red-300">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  // Success state
  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-black">
        <div className="max-w-2xl mx-auto px-4 py-16">
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-8 text-center">
            <div className="text-5xl mb-4">🎉</div>
            <h1 className="text-2xl font-bold text-green-700 dark:text-green-400 mb-2">
              Thank You!
            </h1>
            <p className="text-green-600 dark:text-green-300 mb-4">
              Your feedback has been submitted successfully.
            </p>
            <p className="text-sm text-green-600 dark:text-green-400">
              Your response is completely anonymous. Thank you for taking the
              time to help!
            </p>
          </div>
        </div>
      </div>
    );
  }

  const metadataQuestions = getMetadataQuestions();
  const contentQuestions = getContentQuestions();
  const ownerName = process.env.NEXT_PUBLIC_OWNER_NAME || "this person";

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">
            {formData?.request.title || "Share Your Feedback"}
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            You&apos;ve been asked to provide feedback about someone
            you&apos;ve worked with. Your response is{" "}
            <strong>completely anonymous</strong>.
          </p>
          {formData?.request.notes && (
            <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <p className="text-sm text-blue-800 dark:text-blue-200">
                {formData.request.notes}
              </p>
            </div>
          )}
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 rounded-lg text-red-700 dark:text-red-300 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Metadata Section */}
          <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-lg border border-zinc-200 dark:border-zinc-800 p-6">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-4">
              About Your Working Relationship
            </h2>
            <div className="space-y-4">
              {metadataQuestions.map((question) => (
                <div key={question.id}>
                  <label
                    htmlFor={`question-${question.id}`}
                    className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1"
                  >
                    {question.label}
                    {question.required && (
                      <span className="text-red-500 ml-1" aria-hidden="true">
                        *
                      </span>
                    )}
                  </label>
                  {renderQuestion(question)}
                  {question.helpText && (
                    <p
                      id={`question-${question.id}-help`}
                      className="mt-1 text-xs text-zinc-500 dark:text-zinc-400"
                    >
                      {question.helpText}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Content Section */}
          <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-lg border border-zinc-200 dark:border-zinc-800 p-6">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-4">
              Your Feedback
            </h2>
            <div className="space-y-6">
              {contentQuestions.map((question) => (
                <div key={question.id}>
                  <label
                    htmlFor={`question-${question.id}`}
                    className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1"
                  >
                    {question.label}
                    {question.required && (
                      <span className="text-red-500 ml-1" aria-hidden="true">
                        *
                      </span>
                    )}
                  </label>
                  {renderQuestion(question)}
                  {question.helpText && (
                    <p
                      id={`question-${question.id}-help`}
                      className="mt-1 text-xs text-zinc-500 dark:text-zinc-400"
                    >
                      {question.helpText}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Privacy Notice */}
          <div
            className="bg-zinc-100 dark:bg-zinc-800 rounded-lg p-4 space-y-3"
            role="region"
            aria-label="Privacy information"
          >
            <div className="flex items-start gap-3">
              <span
                className="text-green-600 dark:text-green-400 text-xl"
                aria-hidden="true"
              >
                🔒
              </span>
              <div>
                <p className="font-medium text-zinc-700 dark:text-zinc-300">
                  Your Privacy is Protected
                </p>
                <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
                  Your response is <strong>completely anonymous</strong>.
                  Here&apos;s what that means:
                </p>
              </div>
            </div>
            <ul className="text-sm text-zinc-600 dark:text-zinc-400 space-y-1 ml-9">
              <li className="flex items-start gap-2">
                <span className="text-green-500" aria-hidden="true">
                  ✓
                </span>
                <span>
                  We do not collect your name, email, or any contact information
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-500" aria-hidden="true">
                  ✓
                </span>
                <span>
                  We do not store your IP address or browser fingerprint
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-500" aria-hidden="true">
                  ✓
                </span>
                <span>
                  Only AI-generated summaries (never raw responses) are shared
                  publicly
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-500" aria-hidden="true">
                  ✓
                </span>
                <span>
                  Summaries require at least 2 respondents to prevent
                  identification
                </span>
              </li>
            </ul>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium text-lg"
          >
            {isSubmitting ? "Submitting..." : "Submit Feedback"}
          </button>
        </form>
      </div>
    </div>
  );
}
