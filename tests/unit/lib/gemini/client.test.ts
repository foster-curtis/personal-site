import { describe, it, expect, vi } from "vitest";

const embedContentMock = vi.fn();
const getGenerativeModelMock = vi.fn(() => ({ embedContent: embedContentMock }));

vi.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: class {
    getGenerativeModel = getGenerativeModelMock;
  },
}));

import { chunkText, embedText } from "@/lib/gemini/client";

// Regression test: text-embedding-004 (the model this used previously) was retired by
// Google and started 404ing — confirmed against the live API's ListModels. Pins the
// replacement model and the outputDimensionality param that keeps its output compatible
// with the existing content_embeddings.embedding vector(768) column.
describe("embedText", () => {
  it("requests gemini-embedding-001 with outputDimensionality 768", async () => {
    embedContentMock.mockResolvedValue({ embedding: { values: [0.1, 0.2, 0.3] } });

    await embedText("hello world");

    expect(getGenerativeModelMock).toHaveBeenCalledWith({ model: "gemini-embedding-001" });
    expect(embedContentMock).toHaveBeenCalledWith({
      content: { role: "user", parts: [{ text: "hello world" }] },
      outputDimensionality: 768,
    });
  });

  it("returns the embedding values from the response", async () => {
    embedContentMock.mockResolvedValue({ embedding: { values: [1, 2, 3] } });

    const result = await embedText("hello world");

    expect(result).toEqual([1, 2, 3]);
  });
});

describe("chunkText", () => {
  it("splits on blank-line-separated paragraphs and drops blank paragraphs", () => {
    // "\n\n" between "A" and "   " and between "   " and "B" both match the
    // paragraph separator; the whitespace-only middle segment is dropped.
    const result = chunkText("A\n\n   \n\nB", 1000);
    expect(result).toEqual(["A", "B"]);
  });

  it("collapses runs of 3+ newlines as a single paragraph separator", () => {
    const result = chunkText("First.\n\n\n\nSecond.", 1000);
    expect(result).toEqual(["First.", "Second."]);
  });

  it("pushes a paragraph at or under maxChunkLength as-is, trimmed", () => {
    const result = chunkText("  Hello world  \n\n  Second paragraph  ", 1000);
    expect(result).toEqual(["Hello world", "Second paragraph"]);
  });

  it("greedily packs sentences of an over-length paragraph, flushing on overflow", () => {
    // Each sentence is 3 chars; maxChunkLength 10 allows two per chunk
    // ("X. Y." = 7 chars) but not three.
    const result = chunkText("Hi. Yo. Ok. Go.", 10);
    expect(result).toEqual(["Hi. Yo.", "Ok. Go."]);
  });

  it("splits sentences by punctuation boundary (.!?) followed by whitespace", () => {
    const result = chunkText("This is one. This is two.", 15);
    expect(result).toEqual(["This is one.", "This is two."]);
  });

  // Known bug, characterization test (not an assertion of correct behavior):
  // a single word longer than maxChunkLength is pushed as its own
  // over-length chunk (lib/gemini/client.ts ~line 121) instead of being
  // truncated or hard-split further.
  it("BUG: pushes a single over-length word as its own over-length chunk instead of splitting it", () => {
    const longWord = "Supercalifragilisticexpialidocious"; // 35 chars
    const result = chunkText(longWord, 10);
    expect(result).toEqual([longWord]);
    expect(result[0].length).toBeGreaterThan(10);
  });

  // Known bug, characterization test: currentChunk is not reset after the
  // inner word-split loop for an over-length sentence, so its leftover
  // fragment leaks into and gets concatenated with the packing of the next
  // sentence, mixing word-level and sentence-level chunk granularity.
  it("BUG: leftover word-split state leaks into the next sentence's packing", () => {
    // "Aaaaaaaaaaaaaaaaaaaa bb." (24 chars) is a single over-length
    // "sentence" that gets word-split; "bb." is left over as currentChunk
    // and then silently merges with the next sentence "Short one." instead
    // of starting a fresh chunk.
    const paragraph = "Aaaaaaaaaaaaaaaaaaaa bb. Short one.";
    const result = chunkText(paragraph, 20);
    expect(result).toEqual(["Aaaaaaaaaaaaaaaaaaaa", "bb. Short one."]);
  });

  it("returns [] for whitespace-only input", () => {
    expect(chunkText("   \n\n  \t  ")).toEqual([]);
    expect(chunkText("")).toEqual([]);
  });

  // The "no paragraphs found" fallback (lib/gemini/client.ts ~137-158) is
  // guarded by `chunks.length === 0 && text.trim().length > 0`. Code
  // inspection shows this is unreachable via the public API: when text has
  // no "\n\n" run, `text.split(/\n\n+/)` returns `[text]` verbatim (standard
  // JS behavior for a non-matching separator), and the paragraph filter
  // always keeps that single segment whenever text.trim() is non-empty — so
  // any non-whitespace text is always processed by the main paragraph loop
  // above, which always pushes at least one chunk. These tests exercise
  // plain (non-paragraph) text through that same paragraph-loop logic, since
  // there is no input that reaches the dedicated fallback block.
  it("handles plain non-paragraph text at or under maxChunkLength as a single chunk", () => {
    expect(chunkText("Just one short blob of text.", 1000)).toEqual([
      "Just one short blob of text.",
    ]);
  });

  it("word-splits plain non-paragraph text that exceeds maxChunkLength", () => {
    const result = chunkText(
      "one two three four five six seven eight",
      15
    );
    // Greedy word packing under the paragraph-loop's sentence/word-split
    // logic (this text has no sentence punctuation, so it's one "sentence"
    // that immediately falls through to word-splitting).
    expect(result).toEqual(["one two three", "four five six", "seven eight"]);
  });
});
