/**
 * LLM Abstraction Layer
 *
 * This module provides a provider-agnostic interface for text generation.
 * Currently uses Gemini, but designed to be swappable with other providers.
 */

import { generateContent } from "@/lib/gemini/client";

export interface GenerateTextOptions {
  prompt: string;
  /** Optional system instruction to prepend */
  systemInstruction?: string;
  /** Optional max tokens (not all providers support this) */
  maxTokens?: number;
}

export interface GenerateTextResult {
  text: string;
  /** Provider name for debugging/logging */
  provider: string;
}

/**
 * Generate text using the configured LLM provider.
 * Currently uses Gemini, but can be swapped by changing this implementation.
 */
export async function generateText(
  options: GenerateTextOptions
): Promise<GenerateTextResult> {
  const { prompt, systemInstruction } = options;

  // Build the full prompt with optional system instruction
  const fullPrompt = systemInstruction
    ? `${systemInstruction}\n\n${prompt}`
    : prompt;

  const text = await generateContent(fullPrompt);

  return {
    text,
    provider: "gemini",
  };
}

/**
 * Generate structured JSON output from the LLM.
 * Parses the response and returns typed data.
 */
export async function generateJSON<T>(
  options: GenerateTextOptions & { schema?: string }
): Promise<T> {
  const { prompt, systemInstruction, schema } = options;

  // Add JSON formatting instructions
  const jsonInstruction = schema
    ? `You must respond with valid JSON matching this schema:\n${schema}\n\nDo not include any text outside the JSON object.`
    : `You must respond with valid JSON only. Do not include any text outside the JSON object.`;

  const fullSystemInstruction = systemInstruction
    ? `${systemInstruction}\n\n${jsonInstruction}`
    : jsonInstruction;

  const result = await generateText({
    prompt,
    systemInstruction: fullSystemInstruction,
  });

  // Extract JSON from the response (handle potential markdown code blocks)
  let jsonText = result.text.trim();

  // Remove markdown code blocks if present
  if (jsonText.startsWith("```json")) {
    jsonText = jsonText.slice(7);
  } else if (jsonText.startsWith("```")) {
    jsonText = jsonText.slice(3);
  }
  if (jsonText.endsWith("```")) {
    jsonText = jsonText.slice(0, -3);
  }
  jsonText = jsonText.trim();

  try {
    return JSON.parse(jsonText) as T;
  } catch (error) {
    console.error("Failed to parse LLM JSON response:", jsonText);
    throw new Error(`Failed to parse LLM response as JSON: ${error}`);
  }
}
