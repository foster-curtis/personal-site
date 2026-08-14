import { describe, it, expect } from "vitest";
import { getAllPrompts, getPromptsForMarquee } from "@/lib/chat/prompts";

describe("getPromptsForMarquee", () => {
  it("always returns exactly 3 rows", () => {
    const rows = getPromptsForMarquee();
    expect(rows).toHaveLength(3);
  });

  it("distributes every prompt into exactly one row via round-robin (index % 3), exhaustive and disjoint", () => {
    const allPrompts = getAllPrompts();
    const rows = getPromptsForMarquee();

    const flattened = rows.flat();
    // Exhaustive: every prompt appears somewhere in the rows.
    expect(flattened.sort()).toEqual([...allPrompts].sort());
    // Disjoint: no duplicates across rows (flattened count matches source count).
    expect(flattened).toHaveLength(allPrompts.length);

    allPrompts.forEach((prompt, index) => {
      expect(rows[index % 3]).toContain(prompt);
    });
  });
});
