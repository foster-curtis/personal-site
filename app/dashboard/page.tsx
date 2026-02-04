import { getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import Link from "next/link";
import SyncButton from "./SyncButton";

export default async function DashboardPage() {
  const user = await getUser();
  const supabase = await createClient();

  // Fetch content block count
  const { count: contentCount } = await supabase
    .from("content_blocks")
    .select("*", { count: "exact", head: true })
    .eq("owner_id", user?.id || "");

  // Fetch embedding count
  let embeddingCount = 0;
  if (user?.id) {
    const { data: userBlocks } = await supabase
      .from("content_blocks")
      .select("id")
      .eq("owner_id", user.id);

    if (userBlocks && userBlocks.length > 0) {
      const blockIds = userBlocks.map((b) => b.id);
      const adminSupabase = createAdminClient();
      const { count } = await adminSupabase
        .from("content_embeddings")
        .select("*", { count: "exact", head: true })
        .in("content_block_id", blockIds);

      embeddingCount = count || 0;
    }
  }

  // Fetch pending prompts count
  const { count: promptCount } = await supabase
    .from("prompts")
    .select("*", { count: "exact", head: true })
    .eq("owner_id", user?.id || "")
    .eq("status", "pending");

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">
          Welcome back!
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          Signed in as {user?.email}
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* Quick stats cards */}
        <Link
          href="/dashboard/resume"
          className="bg-white dark:bg-zinc-900 rounded-lg shadow border border-zinc-200 dark:border-zinc-800 p-6 hover:border-blue-300 dark:hover:border-blue-700 transition-colors"
        >
          <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-2">
            Resume & Stories
          </h3>
          <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            {contentCount || 0}
          </p>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            Content blocks stored
          </p>
        </Link>

        <Link
          href="/dashboard/prompts"
          className="bg-white dark:bg-zinc-900 rounded-lg shadow border border-zinc-200 dark:border-zinc-800 p-6 hover:border-blue-300 dark:hover:border-blue-700 transition-colors"
        >
          <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-2">
            Pending Prompts
          </h3>
          <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            {promptCount || 0}
          </p>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            Questions to answer
          </p>
        </Link>

        <div className="bg-white dark:bg-zinc-900 rounded-lg shadow border border-zinc-200 dark:border-zinc-800 p-6">
          <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-2">
            Embeddings
          </h3>
          <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            {embeddingCount}
          </p>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            Vector chunks indexed
          </p>
        </div>
      </div>

      {/* Sync Section */}
      <div className="mt-6 bg-white dark:bg-zinc-900 rounded-lg shadow border border-zinc-200 dark:border-zinc-800 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              Sync Embeddings
            </h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
              Generate vector embeddings for all your content to power AI chat
              and job analysis.
            </p>
          </div>
          <SyncButton />
        </div>
      </div>

      <div className="mt-8 bg-white dark:bg-zinc-900 rounded-lg shadow border border-zinc-200 dark:border-zinc-800 p-6">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-4">
          Getting Started
        </h2>
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                (contentCount || 0) > 0
                  ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300"
                  : "bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400"
              }`}
            >
              {(contentCount || 0) > 0 ? "✓" : "1"}
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                Add your resume content
              </p>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Go to{" "}
                <Link
                  href="/dashboard/resume"
                  className="text-blue-500 hover:underline"
                >
                  Resume
                </Link>{" "}
                to add your work experience, education, and skills.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                embeddingCount > 0
                  ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300"
                  : "bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400"
              }`}
            >
              {embeddingCount > 0 ? "✓" : "2"}
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                Sync your content
              </p>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Click &quot;Sync All&quot; above to generate embeddings for
                AI-powered features.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center text-xs font-medium text-zinc-600 dark:text-zinc-400">
              3
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                Answer AI-generated prompts
              </p>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Strengthen your profile by answering personalized questions.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
