"use client";

import { useMemo } from "react";

interface PromptMarqueeProps {
  /** Array of prompt rows to display */
  promptRows: string[][];
  /** Callback when a prompt is clicked */
  onPromptClick: (prompt: string) => void;
  /** Whether to disable the marquee (e.g., when chat is active) */
  disabled?: boolean;
}

/**
 * A horizontally scrolling marquee of clickable prompt suggestions.
 * Displays multiple rows with alternating scroll directions.
 * Respects reduced motion preferences via CSS.
 *
 * Accessibility features:
 * - Uses semantic nav element with aria-label
 * - All buttons are keyboard focusable
 * - Focus indicators are clearly visible
 * - Animation pauses on hover (in CSS) and respects prefers-reduced-motion
 * - Each prompt button has descriptive aria-label
 */
export default function PromptMarquee({
  promptRows,
  onPromptClick,
  disabled = false,
}: PromptMarqueeProps) {
  // Duplicate each row for seamless infinite scroll
  const duplicatedRows = useMemo(() => {
    return promptRows.map((row) => [...row, ...row]);
  }, [promptRows]);

  if (disabled) {
    return null;
  }

  return (
    <nav
      aria-label="Suggested questions"
      className="w-full overflow-hidden py-4 space-y-3"
    >
      {duplicatedRows.map((row, rowIndex) => (
        <div
          key={rowIndex}
          className="marquee-container relative overflow-hidden"
          role="group"
          aria-label={`Question suggestions row ${rowIndex + 1}`}
        >
          {/* Fade edges - decorative, hidden from screen readers */}
          <div
            className="absolute left-0 top-0 bottom-0 w-12 bg-gradient-to-r from-white dark:from-zinc-950 to-transparent z-10 pointer-events-none"
            aria-hidden="true"
          />
          <div
            className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-white dark:from-zinc-950 to-transparent z-10 pointer-events-none"
            aria-hidden="true"
          />

          {/* Scrolling content */}
          <div
            className={`flex gap-3 w-max ${
              rowIndex % 2 === 0
                ? "animate-marquee-left"
                : "animate-marquee-right"
            }`}
          >
            {row.map((prompt, promptIndex) => (
              <button
                key={`${rowIndex}-${promptIndex}`}
                onClick={() => onPromptClick(prompt)}
                aria-label={`Ask: ${prompt}`}
                type="button"
                className="flex-shrink-0 px-4 py-2 text-sm rounded-full 
                  bg-zinc-100 dark:bg-zinc-800 
                  text-zinc-700 dark:text-zinc-300
                  hover:bg-zinc-200 dark:hover:bg-zinc-700
                  hover:text-zinc-900 dark:hover:text-zinc-100
                  border border-zinc-200 dark:border-zinc-700
                  hover:border-zinc-300 dark:hover:border-zinc-600
                  transition-colors duration-200
                  whitespace-nowrap cursor-pointer
                  focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-zinc-950"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}
