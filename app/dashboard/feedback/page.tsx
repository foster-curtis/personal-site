"use client";

import { useState, useEffect } from "react";
import {
  FeedbackRequestWithStats,
  FeedbackAnalysisResult,
} from "@/lib/db/types";
import { getSentimentColor, getStatusBadge } from "@/lib/format";

export default function FeedbackDashboardPage() {
  const [requests, setRequests] = useState<FeedbackRequestWithStats[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  // Form state for creating new request
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newNotes, setNewNotes] = useState("");

  // Analysis state
  const [analyzingRequestId, setAnalyzingRequestId] = useState<string | null>(
    null
  );
  const [analysisResults, setAnalysisResults] = useState<
    Record<string, FeedbackAnalysisResult>
  >({});
  const [expandedRequestId, setExpandedRequestId] = useState<string | null>(
    null
  );

  useEffect(() => {
    fetchRequests();
  }, []);

  const fetchRequests = async () => {
    try {
      const res = await fetch("/api/feedback/requests");
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to fetch requests");
      }

      setRequests(data.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load requests");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);
    setError(null);

    try {
      const res = await fetch("/api/feedback/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTitle || null,
          notes: newNotes || null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to create request");
      }

      // Add the new request to the list
      setRequests((prev) => [data.data, ...prev]);
      setShowCreateForm(false);
      setNewTitle("");
      setNewNotes("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create request");
    } finally {
      setIsCreating(false);
    }
  };

  const copyLinkToClipboard = (token: string) => {
    const baseUrl = window.location.origin;
    const url = `${baseUrl}/feedback/${token}`;
    navigator.clipboard.writeText(url);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  const runAnalysis = async (requestId: string) => {
    setAnalyzingRequestId(requestId);
    setError(null);

    try {
      const res = await fetch("/api/feedback/analysis/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_id: requestId }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to run analysis");
      }

      // Fetch full analysis results
      await fetchAnalysis(requestId);

      if (data.skipped) {
        setError(data.message || "Analysis was skipped");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run analysis");
    } finally {
      setAnalyzingRequestId(null);
    }
  };

  const fetchAnalysis = async (requestId: string) => {
    try {
      const res = await fetch(`/api/feedback/analysis/${requestId}`);
      const data = await res.json();

      if (res.ok) {
        setAnalysisResults((prev) => ({
          ...prev,
          [requestId]: data,
        }));
      }
    } catch (err) {
      console.error("Error fetching analysis:", err);
    }
  };

  const toggleExpanded = (requestId: string) => {
    if (expandedRequestId === requestId) {
      setExpandedRequestId(null);
    } else {
      setExpandedRequestId(requestId);
      // Fetch analysis if not already loaded
      if (!analysisResults[requestId]) {
        fetchAnalysis(requestId);
      }
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-zinc-200 dark:bg-zinc-800 rounded w-1/3"></div>
          <div className="h-4 bg-zinc-200 dark:bg-zinc-800 rounded w-2/3"></div>
          <div className="h-32 bg-zinc-200 dark:bg-zinc-800 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            Feedback Requests
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            Generate links to collect anonymous feedback from colleagues
          </p>
        </div>
        <button
          onClick={() => setShowCreateForm(true)}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium"
        >
          + New Request
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 rounded-lg text-red-700 dark:text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Create Form Modal */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-xl max-w-md w-full p-6">
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-4">
              Create Feedback Request
            </h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Title (optional)
                </label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g., General feedback 2026"
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Notes for respondents (optional)
                </label>
                <textarea
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  placeholder="Any context or instructions for people filling out the form"
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={isCreating}
                  className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 transition-colors font-medium"
                >
                  {isCreating ? "Creating..." : "Create & Get Link"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="px-4 py-2 bg-zinc-200 dark:bg-zinc-700 text-zinc-800 dark:text-zinc-200 rounded-lg hover:bg-zinc-300 dark:hover:bg-zinc-600 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Requests List */}
      {requests.length === 0 ? (
        <div className="text-center py-12 bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800">
          <div className="text-4xl mb-4">📝</div>
          <p className="text-zinc-500 dark:text-zinc-400 mb-4">
            No feedback requests yet
          </p>
          <button
            onClick={() => setShowCreateForm(true)}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium"
          >
            Create your first request
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {requests.map((request) => (
            <div
              key={request.id}
              className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 p-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-medium text-zinc-900 dark:text-zinc-100">
                      {request.title || "Untitled Request"}
                    </h3>
                    {getStatusBadge(request)}
                  </div>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    Created {formatDate(request.created_at)}
                  </p>
                  {request.notes && (
                    <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-2 line-clamp-2">
                      {request.notes}
                    </p>
                  )}
                </div>

                {/* Stats */}
                <div className="flex gap-4 text-center">
                  <div>
                    <div className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
                      {request.response_count}
                    </div>
                    <div className="text-xs text-zinc-500 dark:text-zinc-400">
                      Responses
                    </div>
                  </div>
                  <div>
                    <div className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
                      {request.responder_count}
                    </div>
                    <div className="text-xs text-zinc-500 dark:text-zinc-400">
                      Responders
                    </div>
                  </div>
                </div>
              </div>

              {/* Links */}
              {request.links && request.links.length > 0 && (
                <div className="mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-800">
                  <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-2">
                    Shareable Link
                  </div>
                  {request.links.map((link) => (
                    <div
                      key={link.id}
                      className="flex items-center gap-2 bg-zinc-50 dark:bg-zinc-800 rounded-lg p-2"
                    >
                      <code className="flex-1 text-sm text-zinc-600 dark:text-zinc-400 truncate">
                        {typeof window !== "undefined"
                          ? `${window.location.origin}/feedback/${link.token}`
                          : `/feedback/${link.token}`}
                      </code>
                      <button
                        onClick={() => copyLinkToClipboard(link.token)}
                        className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors whitespace-nowrap"
                      >
                        {copiedToken === link.token ? "Copied!" : "Copy"}
                      </button>
                    </div>
                  ))}
                  <div className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                    {request.links[0].submission_count} /{" "}
                    {request.links[0].max_submissions ?? "∞"} submissions used
                  </div>
                </div>
              )}

              {/* Analysis Section */}
              {request.response_count > 0 && (
                <div className="mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-800">
                  <div className="flex items-center justify-between mb-2">
                    <button
                      onClick={() => toggleExpanded(request.id)}
                      className="text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100"
                    >
                      {expandedRequestId === request.id ? "▼" : "▶"} Analysis
                    </button>
                    <button
                      onClick={() => runAnalysis(request.id)}
                      disabled={analyzingRequestId === request.id}
                      className="px-3 py-1 text-sm bg-purple-500 text-white rounded hover:bg-purple-600 disabled:opacity-50 transition-colors"
                    >
                      {analyzingRequestId === request.id
                        ? "Analyzing..."
                        : analysisResults[request.id]?.summary
                        ? "Update Analysis"
                        : "Run Analysis"}
                    </button>
                  </div>

                  {expandedRequestId === request.id && (
                    <div className="mt-3 space-y-4">
                      {analysisResults[request.id]?.summary ? (
                        <>
                          {/* Summary */}
                          <div className="bg-zinc-50 dark:bg-zinc-800 rounded-lg p-4">
                            <h4 className="text-sm font-medium text-zinc-900 dark:text-zinc-100 mb-2">
                              Summary
                            </h4>
                            <p className="text-sm text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap">
                              {
                                analysisResults[request.id].summary
                                  ?.summary_text
                              }
                            </p>
                          </div>

                          {/* Highlights */}
                          {analysisResults[request.id].summary?.highlights && (
                            <div className="grid md:grid-cols-2 gap-4">
                              {(analysisResults[request.id].summary?.highlights
                                ?.strengths?.length ?? 0) > 0 && (
                                <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
                                  <h4 className="text-sm font-medium text-green-800 dark:text-green-200 mb-2">
                                    Strengths
                                  </h4>
                                  <ul className="text-sm text-green-700 dark:text-green-300 space-y-1">
                                    {analysisResults[
                                      request.id
                                    ].summary?.highlights?.strengths?.map(
                                      (s, i) => (
                                        <li key={i}>• {s}</li>
                                      )
                                    )}
                                  </ul>
                                </div>
                              )}

                              {(analysisResults[request.id].summary?.highlights
                                ?.growth_areas?.length ?? 0) > 0 && (
                                <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-4">
                                  <h4 className="text-sm font-medium text-orange-800 dark:text-orange-200 mb-2">
                                    Growth Areas
                                  </h4>
                                  <ul className="text-sm text-orange-700 dark:text-orange-300 space-y-1">
                                    {analysisResults[
                                      request.id
                                    ].summary?.highlights?.growth_areas?.map(
                                      (g, i) => (
                                        <li key={i}>• {g}</li>
                                      )
                                    )}
                                  </ul>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Response Stats */}
                          <div className="bg-zinc-50 dark:bg-zinc-800 rounded-lg p-4">
                            <h4 className="text-sm font-medium text-zinc-900 dark:text-zinc-100 mb-2">
                              Response Overview
                            </h4>
                            <div className="grid grid-cols-3 gap-4 text-center">
                              <div>
                                <div className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                                  {
                                    analysisResults[request.id].stats
                                      .response_count
                                  }
                                </div>
                                <div className="text-xs text-zinc-500">
                                  Responses
                                </div>
                              </div>
                              <div>
                                <div
                                  className={`text-lg font-bold ${getSentimentColor(
                                    analysisResults[request.id].stats
                                      .average_sentiment
                                  )}`}
                                >
                                  {analysisResults[request.id].stats
                                    .average_sentiment != null
                                    ? analysisResults[
                                        request.id
                                      ].stats.average_sentiment!.toFixed(1)
                                    : "—"}
                                </div>
                                <div className="text-xs text-zinc-500">
                                  Avg Sentiment
                                </div>
                              </div>
                              <div>
                                <div
                                  className={`text-lg font-bold ${
                                    analysisResults[request.id].stats
                                      .flagged_count > 0
                                      ? "text-red-600 dark:text-red-400"
                                      : "text-zinc-900 dark:text-zinc-100"
                                  }`}
                                >
                                  {
                                    analysisResults[request.id].stats
                                      .flagged_count
                                  }
                                </div>
                                <div className="text-xs text-zinc-500">
                                  Flagged
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Individual Responses (minimal info) */}
                          {analysisResults[request.id].responses_summary
                            .length > 0 && (
                            <div>
                              <h4 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                                Individual Responses
                              </h4>
                              <div className="space-y-2">
                                {analysisResults[
                                  request.id
                                ].responses_summary.map((r, i) => (
                                  <div
                                    key={r.id}
                                    className={`flex items-center justify-between p-2 rounded text-sm ${
                                      r.is_flagged
                                        ? "bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800"
                                        : "bg-zinc-50 dark:bg-zinc-800"
                                    }`}
                                  >
                                    <div className="flex items-center gap-3">
                                      <span className="text-zinc-500">
                                        #{i + 1}
                                      </span>
                                      <span className="text-zinc-600 dark:text-zinc-400">
                                        {r.relationship || "Unknown role"}
                                      </span>
                                      {r.is_flagged && (
                                        <span className="px-2 py-0.5 text-xs bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 rounded">
                                          Flagged
                                        </span>
                                      )}
                                    </div>
                                    <span
                                      className={`font-medium ${getSentimentColor(
                                        r.sentiment_score
                                      )}`}
                                    >
                                      {r.sentiment_score ?? "—"}/10
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="text-center py-4 text-zinc-500 dark:text-zinc-400">
                          <p>
                            No analysis yet. Click &quot;Run Analysis&quot; to
                            generate a summary.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Info card */}
      <div className="mt-8 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <h3 className="font-medium text-blue-900 dark:text-blue-100 mb-2">
          How it works
        </h3>
        <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
          <li>1. Create a feedback request and get a shareable link</li>
          <li>2. Send the link to former colleagues, managers, or coworkers</li>
          <li>3. They submit anonymous feedback about working with you</li>
          <li>
            4. View aggregated insights without seeing individual responses
          </li>
        </ul>
      </div>
    </div>
  );
}
