import { describe, it, expect } from "vitest";
import { buildAboutPrompt } from "@/lib/about";
import { ContentBlock } from "@/lib/db/types";

function makeBlock(overrides: Partial<ContentBlock> = {}): ContentBlock {
  return {
    id: "block-1",
    owner_id: "owner-1",
    type: "resume",
    title: "Senior Engineer at Acme",
    body_text: "Led the widget team.",
    source_question_id: null,
    is_important: false,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("buildAboutPrompt", () => {
  it("formats a single block as '## title\\nType: type\\n\\nbody_text'", () => {
    const prompt = buildAboutPrompt(
      [makeBlock({ title: "Senior Engineer", type: "resume", body_text: "Led the widget team." })],
      "Jane Doe"
    );
    expect(prompt).toContain(
      "## Senior Engineer\nType: resume\n\nLed the widget team."
    );
  });

  it("joins multiple blocks with the exact '\\n\\n---\\n\\n' separator", () => {
    const prompt = buildAboutPrompt(
      [
        makeBlock({ title: "Block A", body_text: "Text A" }),
        makeBlock({ title: "Block B", body_text: "Text B" }),
      ],
      "Jane Doe"
    );
    expect(prompt).toContain(
      "## Block A\nType: resume\n\nText A\n\n---\n\n## Block B\nType: resume\n\nText B"
    );
  });

  it("includes ownerName in both the instructions and content section", () => {
    const prompt = buildAboutPrompt([makeBlock()], "Jane Doe");
    expect(prompt).toContain(
      "Based on the following resume and story content about Jane Doe"
    );
    expect(prompt).toContain("Content about Jane Doe:");
  });

  it("produces an empty context section without throwing for an empty blocks array", () => {
    const prompt = buildAboutPrompt([], "Jane Doe");
    expect(prompt).toContain(
      "Content about Jane Doe:\n\n\n\nGenerate a JSON response"
    );
  });

  it("includes the expected JSON structure instructions", () => {
    const prompt = buildAboutPrompt([makeBlock()], "Jane Doe");
    expect(prompt).toContain('"summary":');
    expect(prompt).toContain('"headline":');
    expect(prompt).toContain('"highlights":');
    expect(prompt).toContain('"skills":');
    expect(prompt).toContain('"interests":');
  });
});
