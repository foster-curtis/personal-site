"use client";

import { useState } from "react";
import { trackJobAnalysis } from "@/lib/analytics";
import { getMatchColor, getScoreColor } from "@/lib/format";

interface Strength {
  area: string;
  evidence: string;
  relevance: string;
}

interface PartialMatch {
  requirement: string;
  candidateExperience: string;
  gap: string;
  transferability: string;
}

interface Gap {
  requirement: string;
  assessment: string;
  mitigation: string;
}

interface Recommendation {
  hire: boolean;
  confidence: "high" | "medium" | "low";
  reasoning: string;
  interviewFocus: string[];
}

interface Analysis {
  overallMatch: "strong" | "moderate" | "developing";
  matchScore: number;
  summary: string;
  strengths: Strength[];
  partialMatches: PartialMatch[];
  gaps: Gap[];
  recommendation: Recommendation;
}

export default function JobAnalysisPage() {
  const [jobDescription, setJobDescription] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!jobDescription.trim() || isLoading) return;

    setIsLoading(true);
    setError(null);
    setAnalysis(null);

    try {
      const res = await fetch("/api/job-compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobDescription }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to analyze");
      }

      if (data.analysis) {
        setAnalysis(data.analysis);
        // Track job analysis completed
        trackJobAnalysis();
      } else if (data.rawResponse) {
        setError(
          "Analysis completed but couldn't be formatted. Raw response available in console."
        );
        console.log("Raw response:", data.rawResponse);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">
          Job Fit Analysis
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          Paste a job description to see how Foster&apos;s experience aligns
          with the requirements.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="mb-8">
        <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-lg border border-zinc-200 dark:border-zinc-800 p-6">
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
            Job Description
          </label>
          <textarea
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
            placeholder="Paste the full job description here..."
            rows={10}
            className="w-full px-4 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y mb-4"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !jobDescription.trim()}
            className="w-full py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
          >
            {isLoading ? "Analyzing..." : "Analyze Job Fit"}
          </button>
        </div>
      </form>

      {error && (
        <div className="mb-8 p-4 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 rounded-lg text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {analysis && (
        <div className="space-y-6">
          {/* Overall Match */}
          <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-lg border border-zinc-200 dark:border-zinc-800 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
                Overall Assessment
              </h2>
              <div className="flex items-center gap-4">
                <span
                  className={`px-3 py-1 rounded-full text-sm font-medium capitalize ${getMatchColor(
                    analysis.overallMatch
                  )}`}
                >
                  {analysis.overallMatch} Match
                </span>
                <span
                  className={`text-2xl font-bold ${getScoreColor(
                    analysis.matchScore
                  )}`}
                >
                  {analysis.matchScore}%
                </span>
              </div>
            </div>
            <p className="text-zinc-600 dark:text-zinc-400">
              {analysis.summary}
            </p>
          </div>

          {/* Strengths */}
          {analysis.strengths.length > 0 && (
            <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-lg border border-zinc-200 dark:border-zinc-800 p-6">
              <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-4 flex items-center gap-2">
                <span className="text-green-500">✓</span> Strengths
              </h2>
              <div className="space-y-4">
                {analysis.strengths.map((s, i) => (
                  <div key={i} className="border-l-4 border-green-500 pl-4">
                    <h3 className="font-medium text-zinc-900 dark:text-zinc-100">
                      {s.area}
                    </h3>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
                      {s.evidence}
                    </p>
                    <p className="text-sm text-green-600 dark:text-green-400 mt-1">
                      {s.relevance}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Partial Matches */}
          {analysis.partialMatches.length > 0 && (
            <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-lg border border-zinc-200 dark:border-zinc-800 p-6">
              <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-4 flex items-center gap-2">
                <span className="text-yellow-500">◐</span> Related Experience
              </h2>
              <div className="space-y-4">
                {analysis.partialMatches.map((p, i) => (
                  <div key={i} className="border-l-4 border-yellow-500 pl-4">
                    <h3 className="font-medium text-zinc-900 dark:text-zinc-100">
                      {p.requirement}
                    </h3>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
                      <span className="font-medium">Experience:</span>{" "}
                      {p.candidateExperience}
                    </p>
                    <p className="text-sm text-zinc-500 dark:text-zinc-500 mt-1">
                      <span className="font-medium">Gap:</span> {p.gap}
                    </p>
                    <p className="text-sm text-yellow-600 dark:text-yellow-400 mt-1">
                      <span className="font-medium">Transferability:</span>{" "}
                      {p.transferability}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Gaps */}
          {analysis.gaps.length > 0 && (
            <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-lg border border-zinc-200 dark:border-zinc-800 p-6">
              <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-4 flex items-center gap-2">
                <span className="text-orange-500">○</span> Areas for Growth
              </h2>
              <div className="space-y-4">
                {analysis.gaps.map((g, i) => (
                  <div key={i} className="border-l-4 border-orange-500 pl-4">
                    <h3 className="font-medium text-zinc-900 dark:text-zinc-100">
                      {g.requirement}
                    </h3>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
                      {g.assessment}
                    </p>
                    <p className="text-sm text-blue-600 dark:text-blue-400 mt-1">
                      <span className="font-medium">Mitigation:</span>{" "}
                      {g.mitigation}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recommendation */}
          <div
            className={`bg-white dark:bg-zinc-900 rounded-lg shadow-lg border-2 p-6 ${
              analysis.recommendation.hire
                ? "border-green-500"
                : "border-orange-500"
            }`}
          >
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-4">
              Recommendation
            </h2>
            <div className="flex items-center gap-4 mb-4">
              <span
                className={`px-4 py-2 rounded-lg text-lg font-bold ${
                  analysis.recommendation.hire
                    ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300"
                    : "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300"
                }`}
              >
                {analysis.recommendation.hire
                  ? "Recommended"
                  : "Consider with Caveats"}
              </span>
              <span className="text-sm text-zinc-500 dark:text-zinc-400">
                Confidence:{" "}
                <span className="font-medium capitalize">
                  {analysis.recommendation.confidence}
                </span>
              </span>
            </div>
            <p className="text-zinc-600 dark:text-zinc-400 mb-4">
              {analysis.recommendation.reasoning}
            </p>

            {analysis.recommendation.interviewFocus.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                  Suggested Interview Topics:
                </h3>
                <ul className="list-disc list-inside text-sm text-zinc-600 dark:text-zinc-400 space-y-1">
                  {analysis.recommendation.interviewFocus.map((topic, i) => (
                    <li key={i}>{topic}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
