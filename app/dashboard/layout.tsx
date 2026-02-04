import { getUser, isOwner } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getUser();

  if (!user) {
    // Not logged in - redirect to login
    redirect("/login");
  }

  if (!isOwner(user)) {
    // Logged in but not owner - redirect to access denied
    redirect("/access-denied");
  }

  // Owner is authenticated - render dashboard
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <div className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        <div className="max-w-6xl mx-auto px-4 py-3">
          <div className="flex items-center gap-6">
            <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              Dashboard
            </span>
            <nav className="flex items-center gap-4">
              <a
                href="/dashboard"
                className="text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
              >
                Overview
              </a>
              <a
                href="/dashboard/resume"
                className="text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
              >
                Resume
              </a>
              <a
                href="/dashboard/prompts"
                className="text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
              >
                Prompts
              </a>
              <a
                href="/dashboard/feedback"
                className="text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
              >
                Feedback
              </a>
              <a
                href="/dashboard/data"
                className="text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
              >
                Data
              </a>
            </nav>
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}
