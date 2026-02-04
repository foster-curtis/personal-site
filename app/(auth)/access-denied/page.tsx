"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function AccessDeniedPage() {
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleLogout = async () => {
    setIsLoading(true);
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-black p-4">
      <div className="w-full max-w-lg bg-white dark:bg-zinc-900 rounded-lg shadow-lg p-8 text-center">
        {/* Fun illustration area */}
        <div className="mb-6">
          <div className="text-6xl mb-4">🚪</div>
          <div className="text-4xl font-bold text-zinc-300 dark:text-zinc-600">
            403
          </div>
        </div>

        <h1 className="text-2xl font-bold mb-4 text-zinc-900 dark:text-zinc-100">
          Whoa there, friend!
        </h1>

        <p className="text-zinc-600 dark:text-zinc-400 mb-2">
          You&apos;ve wandered into someone else&apos;s digital office.
        </p>

        <p className="text-zinc-500 dark:text-zinc-500 mb-6 text-sm">
          This dashboard belongs to{" "}
          <span className="font-semibold text-zinc-700 dark:text-zinc-300">
            Foster Curtis
          </span>
          , and unless you&apos;ve figured out how to be him (impressive!),
          you&apos;ll need to head back to the public areas.
        </p>

        <div className="bg-zinc-100 dark:bg-zinc-800 rounded-lg p-4 mb-6">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            <span className="font-medium">Looking to learn more?</span>
            <br />
            The{" "}
            <a href="/chat" className="text-blue-500 hover:underline">
              Chat
            </a>{" "}
            and{" "}
            <a href="/job-analysis" className="text-blue-500 hover:underline">
              Job Analysis
            </a>{" "}
            features are open to everyone!
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={handleLogout}
            disabled={isLoading}
            className="px-6 py-2 bg-zinc-200 dark:bg-zinc-700 text-zinc-800 dark:text-zinc-200 rounded-lg hover:bg-zinc-300 dark:hover:bg-zinc-600 disabled:opacity-50 transition-colors font-medium"
          >
            {isLoading ? "Signing out..." : "Sign Out"}
          </button>

          <a
            href="/"
            className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium inline-block"
          >
            Go Home
          </a>
        </div>

        <p className="mt-8 text-xs text-zinc-400 dark:text-zinc-600">
          No hard feelings. The internet is a big place.
        </p>
      </div>
    </div>
  );
}
