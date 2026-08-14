import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/gemini/client", () => ({
  generateContent: vi.fn(),
}));

import { generateContent } from "@/lib/gemini/client";
import { generateJSON } from "@/lib/llm";

const mockGenerateContent = vi.mocked(generateContent);

describe("generateJSON", () => {
  beforeEach(() => {
    mockGenerateContent.mockReset();
  });

  it("strips a ```json fenced code block cleanly", async () => {
    mockGenerateContent.mockResolvedValue(
      '```json\n{"foo": "bar"}\n```'
    );
    const result = await generateJSON<{ foo: string }>({ prompt: "hi" });
    expect(result).toEqual({ foo: "bar" });
  });

  it("strips a bare ``` fenced code block (no language tag) cleanly", async () => {
    mockGenerateContent.mockResolvedValue('```\n{"foo": "bar"}\n```');
    const result = await generateJSON<{ foo: string }>({ prompt: "hi" });
    expect(result).toEqual({ foo: "bar" });
  });

  it("parses plain (unfenced) JSON", async () => {
    mockGenerateContent.mockResolvedValue('{"foo": "bar"}');
    const result = await generateJSON<{ foo: string }>({ prompt: "hi" });
    expect(result).toEqual({ foo: "bar" });
  });

  // Known bug, characterization test: the fence check is a literal
  // case-sensitive startsWith("```json"), so an uppercase ```JSON fence is
  // not recognized and is left in the string passed to JSON.parse.
  it("BUG: does not recognize an uppercase ```JSON fence", async () => {
    mockGenerateContent.mockResolvedValue('```JSON\n{"foo": "bar"}\n```');
    await expect(
      generateJSON<{ foo: string }>({ prompt: "hi" })
    ).rejects.toThrow("Failed to parse LLM response as JSON");
  });

  // Known bug, characterization test: the stripper only checks
  // startsWith("```json") / startsWith("```"), so any prose preceding the
  // fence prevents stripping entirely and JSON.parse fails.
  it("BUG: does not handle prose preceding the fenced block", async () => {
    mockGenerateContent.mockResolvedValue(
      'Here\'s the JSON:\n```json\n{"foo": "bar"}\n```'
    );
    await expect(
      generateJSON<{ foo: string }>({ prompt: "hi" })
    ).rejects.toThrow("Failed to parse LLM response as JSON");
  });

  it("throws a formatted error when JSON.parse ultimately fails", async () => {
    mockGenerateContent.mockResolvedValue("not json at all");
    await expect(
      generateJSON<{ foo: string }>({ prompt: "hi" })
    ).rejects.toThrow(/^Failed to parse LLM response as JSON: /);
  });

  it("includes the schema in the prompt instructions when provided", async () => {
    mockGenerateContent.mockResolvedValue('{"foo": "bar"}');
    await generateJSON<{ foo: string }>({
      prompt: "hi",
      schema: "{ foo: string }",
    });
    const promptArg = mockGenerateContent.mock.calls[0][0];
    expect(promptArg).toContain("valid JSON matching this schema");
    expect(promptArg).toContain("{ foo: string }");
  });
});
