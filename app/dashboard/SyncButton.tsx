"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SyncButton() {
  const [isSyncing, setIsSyncing] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const router = useRouter();

  const handleSync = async () => {
    setIsSyncing(true);
    setResult(null);

    try {
      const res = await fetch("/api/embed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sync_all: true }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to sync");
      }

      setResult(
        `Synced ${data.embedded} block(s), ${data.chunks} chunks created`
      );
      router.refresh();
    } catch (error) {
      setResult(error instanceof Error ? error.message : "Sync failed");
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      {result && (
        <span className="text-sm text-zinc-600 dark:text-zinc-400">
          {result}
        </span>
      )}
      <button
        onClick={handleSync}
        disabled={isSyncing}
        className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium text-sm whitespace-nowrap"
      >
        {isSyncing ? "Syncing..." : "Sync All"}
      </button>
    </div>
  );
}
