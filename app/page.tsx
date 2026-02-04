import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      {/* Hero Section */}
      <section className="max-w-6xl mx-auto px-4 py-16 md:py-24">
        <div className="text-center">
          <h1 className="text-4xl md:text-6xl font-bold text-zinc-900 dark:text-zinc-100 mb-6">
            Hi, I&apos;m Foster Curtis
          </h1>
          <p className="text-xl text-zinc-600 dark:text-zinc-400 mb-8 max-w-2xl mx-auto">
            Software Engineer passionate about building great products. Explore
            my experience through AI-powered conversation or see how my skills
            match your role.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/chat"
              className="px-8 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium text-lg"
            >
              Chat with AI
            </Link>
            <Link
              href="/job-analysis"
              className="px-8 py-3 bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 rounded-lg hover:bg-zinc-300 dark:hover:bg-zinc-700 transition-colors font-medium text-lg"
            >
              Analyze Job Fit
            </Link>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="max-w-6xl mx-auto px-4 py-16">
        <div className="grid md:grid-cols-2 gap-8">
          <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-lg border border-zinc-200 dark:border-zinc-800 p-8">
            <div className="text-3xl mb-4">💬</div>
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-3">
              AI-Powered Chat
            </h2>
            <p className="text-zinc-600 dark:text-zinc-400 mb-4">
              Ask questions about my experience, skills, projects, and
              background. The AI draws from my actual resume and professional
              history to give you accurate answers.
            </p>
            <Link
              href="/chat"
              className="text-blue-500 hover:text-blue-600 font-medium inline-flex items-center gap-1"
            >
              Start chatting →
            </Link>
          </div>

          <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-lg border border-zinc-200 dark:border-zinc-800 p-8">
            <div className="text-3xl mb-4">📋</div>
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-3">
              Job Fit Analysis
            </h2>
            <p className="text-zinc-600 dark:text-zinc-400 mb-4">
              Paste a job description and get an AI-powered analysis of how my
              qualifications align with your requirements—including strengths,
              related experience, and areas for growth.
            </p>
            <Link
              href="/job-analysis"
              className="text-blue-500 hover:text-blue-600 font-medium inline-flex items-center gap-1"
            >
              Try it out →
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="max-w-6xl mx-auto px-4 py-8 border-t border-zinc-200 dark:border-zinc-800">
        <p className="text-center text-sm text-zinc-500 dark:text-zinc-500">
          Built with Next.js, Supabase, and Gemini AI
        </p>
      </footer>
    </div>
  );
}
