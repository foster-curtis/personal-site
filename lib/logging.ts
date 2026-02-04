/**
 * Structured Logging Utility
 *
 * Provides consistent, structured logging for observability across the application.
 * Logs are formatted as JSON for easy parsing by log aggregation tools.
 */

type LogLevel = "info" | "warn" | "error" | "debug";

interface LogContext {
  [key: string]: unknown;
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  event: string;
  message?: string;
  context?: LogContext;
  duration_ms?: number;
}

/**
 * Create a structured log entry
 */
function createLogEntry(
  level: LogLevel,
  event: string,
  message?: string,
  context?: LogContext,
  durationMs?: number
): LogEntry {
  return {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...(message && { message }),
    ...(context && { context }),
    ...(durationMs !== undefined && { duration_ms: durationMs }),
  };
}

/**
 * Output a log entry
 */
function outputLog(entry: LogEntry): void {
  const logString = JSON.stringify(entry);

  switch (entry.level) {
    case "error":
      console.error(logString);
      break;
    case "warn":
      console.warn(logString);
      break;
    case "debug":
      if (process.env.NODE_ENV === "development") {
        console.debug(logString);
      }
      break;
    default:
      console.log(logString);
  }
}

/**
 * Main logger object
 */
export const logger = {
  info(event: string, message?: string, context?: LogContext): void {
    outputLog(createLogEntry("info", event, message, context));
  },

  warn(event: string, message?: string, context?: LogContext): void {
    outputLog(createLogEntry("warn", event, message, context));
  },

  error(
    event: string,
    error: unknown,
    message?: string,
    context?: LogContext
  ): void {
    const errorContext: LogContext = {
      ...context,
      error:
        error instanceof Error
          ? {
              name: error.name,
              message: error.message,
              stack:
                process.env.NODE_ENV === "development"
                  ? error.stack
                  : undefined,
            }
          : String(error),
    };
    outputLog(createLogEntry("error", event, message, errorContext));
  },

  debug(event: string, message?: string, context?: LogContext): void {
    outputLog(createLogEntry("debug", event, message, context));
  },

  /**
   * Log with timing - useful for measuring operation duration
   */
  timed<T>(
    event: string,
    operation: () => T | Promise<T>,
    context?: LogContext
  ): T | Promise<T> {
    const start = performance.now();

    const logCompletion = (success: boolean, result?: unknown) => {
      const durationMs = Math.round(performance.now() - start);
      outputLog(
        createLogEntry(
          success ? "info" : "error",
          event,
          success ? "completed" : "failed",
          { ...context, success },
          durationMs
        )
      );
      return result;
    };

    try {
      const result = operation();

      if (result instanceof Promise) {
        return result
          .then((r) => {
            logCompletion(true);
            return r;
          })
          .catch((err) => {
            logCompletion(false, err);
            throw err;
          }) as Promise<T>;
      }

      logCompletion(true);
      return result;
    } catch (err) {
      logCompletion(false, err);
      throw err;
    }
  },
};

/**
 * Predefined event names for consistency
 */
export const LogEvents = {
  // Feedback events
  FEEDBACK_SUBMISSION: "feedback.submission",
  FEEDBACK_SUBMISSION_FAILED: "feedback.submission.failed",
  FEEDBACK_ANALYSIS_RUN: "feedback.analysis.run",
  FEEDBACK_LINK_VALIDATED: "feedback.link.validated",
  FEEDBACK_LINK_INVALID: "feedback.link.invalid",

  // About page events
  ABOUT_PAGE_REQUEST: "about.page.request",
  ABOUT_SUMMARY_GENERATED: "about.summary.generated",
  ABOUT_CACHE_HIT: "about.cache.hit",

  // Chat events
  CHAT_REQUEST: "chat.request",
  CHAT_RESPONSE: "chat.response",

  // Auth events
  AUTH_LOGIN: "auth.login",
  AUTH_LOGOUT: "auth.logout",

  // API errors
  API_ERROR: "api.error",
  VALIDATION_ERROR: "validation.error",
  RATE_LIMIT_EXCEEDED: "rate.limit.exceeded",
} as const;
