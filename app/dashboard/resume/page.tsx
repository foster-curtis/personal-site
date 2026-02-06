"use client";

import { useState, useEffect } from "react";
import { ContentBlock, ContentBlockType } from "@/lib/db/types";
import { trackImportanceToggled } from "@/lib/analytics";

type EditorMode = "list" | "create" | "edit";

export default function ResumePage() {
  const [blocks, setBlocks] = useState<ContentBlock[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<EditorMode>("list");
  const [editingBlock, setEditingBlock] = useState<ContentBlock | null>(null);
  const [filterType, setFilterType] = useState<ContentBlockType | "all">("all");

  // Form state
  const [formType, setFormType] = useState<ContentBlockType>("resume");
  const [formTitle, setFormTitle] = useState("");
  const [formBody, setFormBody] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [autoEmbed, setAutoEmbed] = useState(true);
  const [updatingImportance, setUpdatingImportance] = useState<string | null>(null);

  useEffect(() => {
    fetchBlocks();
  }, [filterType]);

  const fetchBlocks = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const url =
        filterType === "all" ? "/api/data" : `/api/data?type=${filterType}`;
      const res = await fetch(url);
      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || "Failed to fetch");
      }

      setBlocks(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load content");
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setFormType("resume");
    setFormTitle("");
    setFormBody("");
    setEditingBlock(null);
    setMode("list");
  };

  const handleCreate = () => {
    resetForm();
    setMode("create");
  };

  const handleEdit = (block: ContentBlock) => {
    setEditingBlock(block);
    setFormType(block.type);
    setFormTitle(block.title);
    setFormBody(block.body_text);
    setMode("edit");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);

    try {
      let blockId: string | null = null;

      if (mode === "create") {
        const res = await fetch("/api/data", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: formType,
            title: formTitle,
            body_text: formBody,
          }),
        });

        if (!res.ok) {
          const json = await res.json();
          throw new Error(json.error || "Failed to create");
        }

        const json = await res.json();
        blockId = json.data?.id;
      } else if (mode === "edit" && editingBlock) {
        const res = await fetch(`/api/data/${editingBlock.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: formType,
            title: formTitle,
            body_text: formBody,
          }),
        });

        if (!res.ok) {
          const json = await res.json();
          throw new Error(json.error || "Failed to update");
        }

        blockId = editingBlock.id;
      }

      // Auto-embed if enabled and we have a block ID
      if (autoEmbed && blockId) {
        try {
          await fetch("/api/embed", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content_block_id: blockId }),
          });
        } catch (embedError) {
          console.error("Failed to auto-embed:", embedError);
          // Don't fail the save if embedding fails
        }
      }

      resetForm();
      fetchBlocks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this content block?")) {
      return;
    }

    try {
      const res = await fetch(`/api/data/${id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || "Failed to delete");
      }

      fetchBlocks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    }
  };

  const toggleImportance = async (blockId: string, newValue: boolean) => {
    // Find the block to get its type for tracking
    const block = blocks.find((b) => b.id === blockId);

    setUpdatingImportance(blockId);
    try {
      const res = await fetch(`/api/data/${blockId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_important: newValue }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update");
      }

      // Track importance toggle
      if (block) {
        trackImportanceToggled(block.type, newValue);
      }

      // Update local state
      setBlocks((prev) =>
        prev.map((b) =>
          b.id === blockId ? { ...b, is_important: newValue } : b
        )
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to update importance"
      );
    } finally {
      setUpdatingImportance(null);
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

  // Form view
  if (mode === "create" || mode === "edit") {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-6">
          <button
            onClick={resetForm}
            className="text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"
          >
            &larr; Back to list
          </button>
        </div>

        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-6">
          {mode === "create" ? "Add New Content" : "Edit Content"}
        </h1>

        {error && (
          <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 rounded-lg text-red-700 dark:text-red-300 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
              Type
            </label>
            <select
              value={formType}
              onChange={(e) => setFormType(e.target.value as ContentBlockType)}
              className="w-full px-4 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isSaving}
            >
              <option value="resume">
                Resume (work experience, education, skills)
              </option>
              <option value="story">
                Story (projects, achievements, anecdotes)
              </option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
              Title
            </label>
            <input
              type="text"
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              placeholder="e.g., Senior Software Engineer at Acme Corp"
              required
              className="w-full px-4 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isSaving}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
              Content
            </label>
            <textarea
              value={formBody}
              onChange={(e) => setFormBody(e.target.value)}
              placeholder="Describe your experience, skills, or story..."
              required
              rows={10}
              className="w-full px-4 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
              disabled={isSaving}
            />
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Be detailed! This content will be used by the AI to answer
              questions about you.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="autoEmbed"
              checked={autoEmbed}
              onChange={(e) => setAutoEmbed(e.target.checked)}
              className="w-4 h-4 rounded border-zinc-300 dark:border-zinc-700 text-blue-500 focus:ring-blue-500"
              disabled={isSaving}
            />
            <label
              htmlFor="autoEmbed"
              className="text-sm text-zinc-700 dark:text-zinc-300"
            >
              Generate AI embeddings after saving
            </label>
          </div>

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={isSaving}
              className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
            >
              {isSaving
                ? "Saving..."
                : mode === "create"
                ? "Create"
                : "Save Changes"}
            </button>
            <button
              type="button"
              onClick={resetForm}
              disabled={isSaving}
              className="px-6 py-2 bg-zinc-200 dark:bg-zinc-700 text-zinc-800 dark:text-zinc-200 rounded-lg hover:bg-zinc-300 dark:hover:bg-zinc-600 disabled:opacity-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    );
  }

  // List view
  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            Resume & Stories
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            Add your work experience, education, skills, and stories.
          </p>
        </div>
        <button
          onClick={handleCreate}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium"
        >
          + Add Content
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-6">
        {(["all", "resume", "story"] as const).map((type) => (
          <button
            key={type}
            onClick={() => setFilterType(type)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filterType === type
                ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"
            }`}
          >
            {type === "all" ? "All" : typeLabels[type]}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 rounded-lg text-red-700 dark:text-red-300 text-sm">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-12 text-zinc-500 dark:text-zinc-400">
          Loading...
        </div>
      ) : blocks.length === 0 ? (
        <div className="text-center py-12 bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800">
          <p className="text-zinc-500 dark:text-zinc-400 mb-4">
            No content yet. Add your first piece of content to get started!
          </p>
          <button
            onClick={handleCreate}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium"
          >
            + Add Content
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {blocks.map((block) => (
            <div
              key={block.id}
              className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 p-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-medium ${
                        typeColors[block.type]
                      }`}
                    >
                      {typeLabels[block.type]}
                    </span>
                    <span className="text-xs text-zinc-400">
                      {new Date(block.created_at).toLocaleDateString()}
                    </span>
                    {block.is_important && (
                      <span className="text-xs px-1.5 py-0.5 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 rounded">
                        Priority
                      </span>
                    )}
                  </div>
                  <h3 className="font-medium text-zinc-900 dark:text-zinc-100 mb-1">
                    {block.title}
                  </h3>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400 line-clamp-2">
                    {block.body_text}
                  </p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={() => toggleImportance(block.id, !block.is_important)}
                    disabled={updatingImportance === block.id}
                    className={`px-2 py-1 text-xs rounded transition-colors ${
                      block.is_important
                        ? "bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:hover:bg-amber-900/50"
                        : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
                    } disabled:opacity-50`}
                    title={
                      block.is_important
                        ? "Click to remove priority (will be less prominent in AI responses)"
                        : "Click to prioritize (will be more prominent in AI responses)"
                    }
                  >
                    {updatingImportance === block.id
                      ? "..."
                      : block.is_important
                      ? "Prioritized"
                      : "Prioritize"}
                  </button>
                  <button
                    onClick={() => handleEdit(block)}
                    className="px-3 py-1 text-sm bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(block.id)}
                    className="px-3 py-1 text-sm bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
