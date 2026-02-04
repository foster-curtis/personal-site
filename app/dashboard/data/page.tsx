"use client";

import { useState, useEffect, useRef } from "react";
import {
  ContentBlock,
  ContentBlockType,
  Prompt,
  FileRecord,
} from "@/lib/db/types";

type TabType = "all" | "resume" | "story" | "qa" | "files";

interface ContentBlockWithPrompt extends ContentBlock {
  prompt?: Prompt | null;
}

export default function DataPage() {
  const [blocks, setBlocks] = useState<ContentBlockWithPrompt[]>([]);
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [prompts, setPrompts] = useState<Map<string, Prompt>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>("all");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Fetch content blocks, all prompts (for Q&A context), and files in parallel
      const [blocksRes, promptsRes, filesRes] = await Promise.all([
        fetch("/api/data"),
        fetch("/api/prompts?all=true").catch(() => ({
          ok: false,
          json: () => ({ prompts: [] }),
        })),
        fetch("/api/files").catch(() => ({
          ok: false,
          json: () => ({ data: [] }),
        })),
      ]);

      const blocksData = await blocksRes.json();
      if (!blocksRes.ok)
        throw new Error(blocksData.error || "Failed to fetch content");

      // Try to get all prompts (including answered ones) for Q&A context
      // Fall back to empty if endpoint doesn't support all param
      let allPrompts: Prompt[] = [];
      try {
        const promptsData = await promptsRes.json();
        allPrompts = promptsData.prompts || [];
      } catch {
        // Ignore - prompts are optional for display
      }

      // Build prompts map by ID for quick lookup
      const promptsMap = new Map<string, Prompt>();
      allPrompts.forEach((p: Prompt) => promptsMap.set(p.id, p));
      setPrompts(promptsMap);

      // Attach prompt info to Q&A blocks
      const blocksWithPrompts: ContentBlockWithPrompt[] = (
        blocksData.data || []
      ).map((block: ContentBlock) => {
        if (block.type === "qa" && block.source_question_id) {
          return {
            ...block,
            prompt: promptsMap.get(block.source_question_id) || null,
          };
        }
        return block;
      });
      setBlocks(blocksWithPrompts);

      // Fetch files
      try {
        const filesData = await filesRes.json();
        setFiles(filesData.data || []);
      } catch {
        setFiles([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/files", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");

      // Refresh files list
      const filesRes = await fetch("/api/files");
      const filesData = await filesRes.json();
      setFiles(filesData.data || []);

      // Clear input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileDelete = async (fileId: string) => {
    if (!confirm("Are you sure you want to delete this file?")) return;

    try {
      const res = await fetch(`/api/files/${fileId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Delete failed");
      }
      setFiles((prev) => prev.filter((f) => f.id !== fileId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete file");
    }
  };

  const handleFileDownload = async (fileId: string, fileName: string) => {
    try {
      const res = await fetch(`/api/files/${fileId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to get download URL");

      // Open download URL in new tab
      window.open(data.downloadUrl, "_blank");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to download file");
    }
  };

  const typeLabels: Record<ContentBlockType, string> = {
    resume: "Resume",
    story: "Story",
    qa: "Q&A",
    file_metadata: "File",
  };

  const typeColors: Record<ContentBlockType, string> = {
    resume: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    story:
      "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
    qa: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    file_metadata:
      "bg-zinc-100 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-300",
  };

  const filteredBlocks =
    activeTab === "all" || activeTab === "files"
      ? blocks
      : blocks.filter((b) => b.type === activeTab);

  const groupedBlocks = {
    resume: blocks.filter((b) => b.type === "resume"),
    story: blocks.filter((b) => b.type === "story"),
    qa: blocks.filter((b) => b.type === "qa"),
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return "Unknown size";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType === "application/pdf") return "📄";
    if (mimeType.startsWith("image/")) return "🖼️";
    if (mimeType === "text/plain") return "📝";
    return "📎";
  };

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="text-center text-zinc-500 dark:text-zinc-400">
          Loading your data...
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">
          Stored Data
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          View all your content and files in one place. This data powers the AI
          chat and job analysis.
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 rounded-lg text-red-700 dark:text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {(["all", "resume", "story", "qa", "files"] as TabType[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab
                ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"
            }`}
          >
            {tab === "all"
              ? `All (${blocks.length})`
              : tab === "files"
              ? `Files (${files.length})`
              : tab === "qa"
              ? `Q&A (${groupedBlocks.qa.length})`
              : `${typeLabels[tab as ContentBlockType]} (${
                  groupedBlocks[tab as keyof typeof groupedBlocks]?.length || 0
                })`}
          </button>
        ))}
      </div>

      {/* Files Tab */}
      {activeTab === "files" && (
        <div className="space-y-6">
          {/* Upload Section */}
          <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 p-6">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-4">
              Upload File
            </h2>
            <div className="flex items-center gap-4">
              <label className="sr-only" htmlFor="file-upload">
                Choose a file to upload
              </label>
              <input
                id="file-upload"
                ref={fileInputRef}
                type="file"
                onChange={handleFileUpload}
                accept=".pdf,.png,.jpg,.jpeg,.gif,.txt"
                disabled={isUploading}
                aria-label="Choose a file to upload"
                className="block w-full text-sm text-zinc-500 dark:text-zinc-400
                  file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0
                  file:text-sm file:font-medium
                  file:bg-blue-50 file:text-blue-700
                  dark:file:bg-blue-900/30 dark:file:text-blue-300
                  hover:file:bg-blue-100 dark:hover:file:bg-blue-900/50
                  disabled:opacity-50"
              />
              {isUploading && (
                <span className="text-sm text-zinc-500 dark:text-zinc-400">
                  Uploading...
                </span>
              )}
            </div>
            <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
              Supported: PDF, PNG, JPG, GIF, TXT (max 50MB)
            </p>
            {uploadError && (
              <p className="mt-2 text-sm text-red-600 dark:text-red-400">
                {uploadError}
              </p>
            )}
          </div>

          {/* Files List */}
          {files.length === 0 ? (
            <div className="text-center py-12 bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800">
              <p className="text-zinc-500 dark:text-zinc-400">
                No files uploaded yet. Upload your first file above.
              </p>
            </div>
          ) : (
            <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-200 dark:divide-zinc-800">
              {files.map((file) => (
                <div
                  key={file.id}
                  className="p-4 flex items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-2xl">
                      {getFileIcon(file.mime_type)}
                    </span>
                    <div className="min-w-0">
                      <p className="font-medium text-zinc-900 dark:text-zinc-100 truncate">
                        {file.name}
                      </p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        {formatFileSize(file.size_bytes)} •{" "}
                        {new Date(file.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleFileDownload(file.id, file.name)}
                      className="px-3 py-1 text-sm bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors"
                    >
                      Download
                    </button>
                    <button
                      onClick={() => handleFileDelete(file.id)}
                      className="px-3 py-1 text-sm bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Content Blocks (All, Resume, Story, Q&A tabs) */}
      {activeTab !== "files" && (
        <>
          {activeTab === "all" ? (
            // Grouped view for "All" tab
            <div className="space-y-8">
              {/* Resume Section */}
              {groupedBlocks.resume.length > 0 && (
                <section>
                  <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-4 flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-medium ${typeColors.resume}`}
                    >
                      Resume
                    </span>
                    <span className="text-sm text-zinc-500 dark:text-zinc-400 font-normal">
                      ({groupedBlocks.resume.length} items)
                    </span>
                  </h2>
                  <div className="space-y-3">
                    {groupedBlocks.resume.map((block) => (
                      <ContentBlockCard
                        key={block.id}
                        block={block}
                        typeColors={typeColors}
                      />
                    ))}
                  </div>
                </section>
              )}

              {/* Stories Section */}
              {groupedBlocks.story.length > 0 && (
                <section>
                  <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-4 flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-medium ${typeColors.story}`}
                    >
                      Stories
                    </span>
                    <span className="text-sm text-zinc-500 dark:text-zinc-400 font-normal">
                      ({groupedBlocks.story.length} items)
                    </span>
                  </h2>
                  <div className="space-y-3">
                    {groupedBlocks.story.map((block) => (
                      <ContentBlockCard
                        key={block.id}
                        block={block}
                        typeColors={typeColors}
                      />
                    ))}
                  </div>
                </section>
              )}

              {/* Q&A Section */}
              {groupedBlocks.qa.length > 0 && (
                <section>
                  <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-4 flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-medium ${typeColors.qa}`}
                    >
                      Q&A
                    </span>
                    <span className="text-sm text-zinc-500 dark:text-zinc-400 font-normal">
                      ({groupedBlocks.qa.length} items)
                    </span>
                  </h2>
                  <div className="space-y-3">
                    {groupedBlocks.qa.map((block) => (
                      <QABlockCard
                        key={block.id}
                        block={block}
                        typeColors={typeColors}
                      />
                    ))}
                  </div>
                </section>
              )}

              {blocks.length === 0 && (
                <div className="text-center py-12 bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800">
                  <p className="text-zinc-500 dark:text-zinc-400 mb-4">
                    No content yet. Add resume content or answer prompts to
                    build your profile.
                  </p>
                  <div className="flex gap-3 justify-center">
                    <a
                      href="/dashboard/resume"
                      className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium"
                    >
                      Add Resume Content
                    </a>
                    <a
                      href="/dashboard/prompts"
                      className="px-4 py-2 bg-zinc-200 dark:bg-zinc-700 text-zinc-800 dark:text-zinc-200 rounded-lg hover:bg-zinc-300 dark:hover:bg-zinc-600 transition-colors"
                    >
                      Answer Prompts
                    </a>
                  </div>
                </div>
              )}
            </div>
          ) : activeTab === "qa" ? (
            // Q&A specific view
            <div className="space-y-3">
              {filteredBlocks.length === 0 ? (
                <div className="text-center py-12 bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800">
                  <p className="text-zinc-500 dark:text-zinc-400 mb-4">
                    No Q&A entries yet. Answer prompts to add content.
                  </p>
                  <a
                    href="/dashboard/prompts"
                    className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium inline-block"
                  >
                    Answer Prompts
                  </a>
                </div>
              ) : (
                filteredBlocks.map((block) => (
                  <QABlockCard
                    key={block.id}
                    block={block}
                    typeColors={typeColors}
                  />
                ))
              )}
            </div>
          ) : (
            // Resume/Story specific view
            <div className="space-y-3">
              {filteredBlocks.length === 0 ? (
                <div className="text-center py-12 bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800">
                  <p className="text-zinc-500 dark:text-zinc-400 mb-4">
                    No {activeTab} entries yet.
                  </p>
                  <a
                    href="/dashboard/resume"
                    className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium inline-block"
                  >
                    Add Content
                  </a>
                </div>
              ) : (
                filteredBlocks.map((block) => (
                  <ContentBlockCard
                    key={block.id}
                    block={block}
                    typeColors={typeColors}
                  />
                ))
              )}
            </div>
          )}
        </>
      )}

      {/* Summary Footer */}
      <div className="mt-8 p-4 bg-zinc-100 dark:bg-zinc-800 rounded-lg">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          <strong>Summary:</strong> {blocks.length} content blocks (
          {groupedBlocks.resume.length} resume, {groupedBlocks.story.length}{" "}
          stories, {groupedBlocks.qa.length} Q&A) and {files.length} files. This
          data is used by the AI to answer questions about you and compare your
          profile to job descriptions.
        </p>
      </div>
    </div>
  );
}

// Component for displaying a regular content block
function ContentBlockCard({
  block,
  typeColors,
}: {
  block: ContentBlock;
  typeColors: Record<ContentBlockType, string>;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const isLong = block.body_text.length > 300;

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs text-zinc-400">
              {new Date(block.created_at).toLocaleDateString()}
            </span>
          </div>
          <h3 className="font-medium text-zinc-900 dark:text-zinc-100 mb-2">
            {block.title}
          </h3>
          <p className="text-sm text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap">
            {isExpanded || !isLong
              ? block.body_text
              : block.body_text.slice(0, 300) + "..."}
          </p>
          {isLong && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="mt-2 text-sm text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300"
            >
              {isExpanded ? "Show less" : "Show more"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Component for displaying Q&A with the original prompt
function QABlockCard({
  block,
  typeColors,
}: {
  block: ContentBlockWithPrompt;
  typeColors: Record<ContentBlockType, string>;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const isLong = block.body_text.length > 300;

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 p-4">
      {/* Question */}
      {block.prompt && (
        <div className="mb-3 pb-3 border-b border-zinc-200 dark:border-zinc-700">
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-1">
            Question
          </p>
          <p className="text-zinc-900 dark:text-zinc-100 font-medium">
            {block.prompt.prompt_text}
          </p>
        </div>
      )}

      {/* Answer */}
      <div>
        <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-1">
          Answer
        </p>
        <p className="text-sm text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap">
          {isExpanded || !isLong
            ? block.body_text
            : block.body_text.slice(0, 300) + "..."}
        </p>
        {isLong && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="mt-2 text-sm text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300"
          >
            {isExpanded ? "Show less" : "Show more"}
          </button>
        )}
      </div>

      {/* Metadata */}
      <div className="mt-3 pt-3 border-t border-zinc-200 dark:border-zinc-700">
        <p className="text-xs text-zinc-400">
          Answered {new Date(block.created_at).toLocaleDateString()}
        </p>
      </div>
    </div>
  );
}
