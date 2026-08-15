import OpenAI from "openai";
import { init } from "autoevals";

/**
 * autoevals' LLM-judge scorers (Factuality, AnswerRelevancy, ContextRecall, ...) default to
 * calling OpenAI's API (or Braintrust's proxy) directly. Route them through Gemini's
 * OpenAI-compatible endpoint instead, so grading uses the same provider and credential
 * (GEMINI_API_KEY) as the rest of this app rather than requiring a second API key —
 * see https://ai.google.dev/gemini-api/docs/openai for the compatibility surface.
 *
 * Importing this module (for its side effect) once per eval file that uses an autoevals
 * scorer is enough; `init()` sets global client state and is safe to call more than once.
 */
init({
  client: new OpenAI({
    apiKey: process.env.GEMINI_API_KEY,
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
  }),
});

/** Same model-resolution convention as lib/gemini/client.ts's getModelName(). */
export const JUDGE_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
