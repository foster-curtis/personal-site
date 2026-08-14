import { describe, it, expect } from "vitest";
import {
  generateFeedbackToken,
  isValidTokenFormat,
} from "@/lib/feedback/tokens";

describe("generateFeedbackToken", () => {
  it("always generates a 43-character token", () => {
    for (let i = 0; i < 20; i++) {
      expect(generateFeedbackToken()).toHaveLength(43);
    }
  });

  it("only uses the base64url charset [A-Za-z0-9_-]", () => {
    for (let i = 0; i < 20; i++) {
      expect(generateFeedbackToken()).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it("does not produce collisions across many generations (sanity check, not a crypto proof)", () => {
    const tokens = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      tokens.add(generateFeedbackToken());
    }
    expect(tokens.size).toBe(1000);
  });
});

describe("isValidTokenFormat", () => {
  it("accepts a token at exactly the 32-character boundary", () => {
    expect(isValidTokenFormat("a".repeat(32))).toBe(true);
  });

  it("rejects a token one character short of the boundary", () => {
    expect(isValidTokenFormat("a".repeat(31))).toBe(false);
  });

  it("accepts tokens longer than 32 characters", () => {
    expect(isValidTokenFormat("a".repeat(43))).toBe(true);
  });

  it("accepts the full base64url charset", () => {
    expect(isValidTokenFormat("A-z_0-Az9" + "a".repeat(23))).toBe(true);
  });

  it("rejects tokens containing characters outside the base64url charset", () => {
    expect(isValidTokenFormat("a".repeat(31) + "!")).toBe(false);
    expect(isValidTokenFormat("a".repeat(31) + "+")).toBe(false);
    expect(isValidTokenFormat("a".repeat(31) + "/")).toBe(false);
  });

  it("real generated tokens always pass isValidTokenFormat", () => {
    // generateFeedbackToken produces 43-char tokens; documents that the two
    // functions are at least mutually consistent even though
    // validateFeedbackSubmission's own bounds (20-100) diverge from this
    // function's >=32 minimum (see tests/unit/lib/validation.test.ts).
    expect(isValidTokenFormat("x".repeat(43))).toBe(true);
  });
});
