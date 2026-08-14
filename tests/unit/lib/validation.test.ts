import { describe, it, expect } from "vitest";
import {
  validateString,
  validateFeedbackSubmission,
  sanitizeString,
  sanitizeStringObject,
} from "@/lib/validation";
import { isValidTokenFormat } from "@/lib/feedback/tokens";

describe("validateString", () => {
  it("passes for a valid string within bounds", () => {
    const result = validateString("hello", "name", {
      required: true,
      minLength: 2,
      maxLength: 10,
    });
    expect(result).toEqual({ valid: true, errors: [] });
  });

  it("requires a value when required is true and value is undefined/null/empty", () => {
    expect(validateString(undefined, "name", { required: true })).toEqual({
      valid: false,
      errors: ["name is required"],
    });
    expect(validateString(null, "name", { required: true })).toEqual({
      valid: false,
      errors: ["name is required"],
    });
    expect(validateString("", "name", { required: true })).toEqual({
      valid: false,
      errors: ["name is required"],
    });
  });

  it("does not error on missing value when required is false/omitted", () => {
    expect(validateString(undefined, "name")).toEqual({
      valid: true,
      errors: [],
    });
  });

  // Characterization test: the empty-string short-circuit at line 30 returns
  // before minLength is ever checked, so minLength is silently never enforced
  // against an empty string. This documents current (buggy) behavior.
  it("BUG: does not enforce minLength against an empty string", () => {
    const result = validateString("", "name", {
      required: false,
      minLength: 5,
    });
    expect(result).toEqual({ valid: true, errors: [] });
  });

  it("short-circuits with a type error for non-string values without running other checks", () => {
    const result = validateString(42, "name", {
      minLength: 1,
      maxLength: 2,
      pattern: /^[a-z]+$/,
    });
    expect(result).toEqual({ valid: false, errors: ["name must be a string"] });
  });

  it("accumulates multiple errors when a value fails more than one check", () => {
    const result = validateString("a", "name", {
      minLength: 5,
      maxLength: 10,
      pattern: /^[0-9]+$/,
      patternMessage: "name must be numeric",
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual([
      "name must be at least 5 characters",
      "name must be numeric",
    ]);
  });

  it("enforces maxLength", () => {
    const result = validateString("this is way too long", "name", {
      maxLength: 5,
    });
    expect(result).toEqual({
      valid: false,
      errors: ["name must be at most 5 characters"],
    });
  });

  it("uses a default pattern message when patternMessage is not supplied", () => {
    const result = validateString("abc", "code", { pattern: /^[0-9]+$/ });
    expect(result.errors).toEqual(["code has an invalid format"]);
  });

  it("trims the value before evaluating length checks", () => {
    const result = validateString("  hi  ", "name", { minLength: 2 });
    expect(result).toEqual({ valid: true, errors: [] });
  });
});

describe("validateFeedbackSubmission", () => {
  it("rejects a non-object body", () => {
    expect(validateFeedbackSubmission(null)).toEqual({
      valid: false,
      errors: ["Invalid request body"],
    });
    expect(validateFeedbackSubmission("nope")).toEqual({
      valid: false,
      errors: ["Invalid request body"],
    });
  });

  it("requires a token between 20 and 100 characters", () => {
    const tooShort = validateFeedbackSubmission({ token: "short" });
    expect(tooShort.valid).toBe(false);
    expect(tooShort.errors).toContain(
      "token must be at least 20 characters"
    );

    const tooLong = validateFeedbackSubmission({ token: "a".repeat(101) });
    expect(tooLong.valid).toBe(false);
    expect(tooLong.errors).toContain("token must be at most 100 characters");

    const missing = validateFeedbackSubmission({});
    expect(missing.valid).toBe(false);
    expect(missing.errors).toContain("token is required");
  });

  it("accepts a token within the 20-100 char range", () => {
    const result = validateFeedbackSubmission({ token: "a".repeat(43) });
    expect(result.valid).toBe(true);
  });

  // This pins a real, documented inconsistency rather than silently choosing
  // one bound to test: validateFeedbackSubmission accepts tokens as short as
  // 20 chars, but isValidTokenFormat (lib/feedback/tokens.ts) requires >= 32.
  // A 25-char token can pass this validator yet fail isValidTokenFormat.
  it("DOCUMENTS INCONSISTENCY: accepts a 25-char token that isValidTokenFormat would reject", () => {
    const token = "a".repeat(25);
    const result = validateFeedbackSubmission({ token });
    expect(result.valid).toBe(true);
    expect(isValidTokenFormat(token)).toBe(false);
  });

  it("rejects a non-object metadata", () => {
    const result = validateFeedbackSubmission({
      token: "a".repeat(43),
      metadata: "nope",
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("metadata must be an object");
  });

  it("validates individual metadata fields when present", () => {
    const result = validateFeedbackSubmission({
      token: "a".repeat(43),
      metadata: { relationship: "a".repeat(101) },
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      "relationship must be at most 100 characters"
    );
  });

  it("validates the worked_from metadata field", () => {
    const result = validateFeedbackSubmission({
      token: "a".repeat(43),
      metadata: { worked_from: "a".repeat(51) },
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      "worked_from must be at most 50 characters"
    );
  });

  it("validates the worked_to metadata field", () => {
    const result = validateFeedbackSubmission({
      token: "a".repeat(43),
      metadata: { worked_to: "a".repeat(51) },
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      "worked_to must be at most 50 characters"
    );
  });

  it("rejects a non-object content", () => {
    const result = validateFeedbackSubmission({
      token: "a".repeat(43),
      content: 5,
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("content must be an object");
  });

  it("caps each content field at 10,000 characters", () => {
    const result = validateFeedbackSubmission({
      token: "a".repeat(43),
      content: { worker_description: "a".repeat(10001) },
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      "worker_description must be at most 10000 characters"
    );
  });

  it("accepts a content field at exactly the 10,000 char boundary", () => {
    const result = validateFeedbackSubmission({
      token: "a".repeat(43),
      content: { worker_description: "a".repeat(10000) },
    });
    expect(result.valid).toBe(true);
  });

  it("caps total serialized content size at 50,000 bytes", () => {
    // Two fields under the individual 10,000-char cap but whose combined
    // JSON.stringify length exceeds 50,000.
    const result = validateFeedbackSubmission({
      token: "a".repeat(43),
      content: {
        worker_description: "a".repeat(9999),
        character_comments: "b".repeat(9999),
        teamwork_comments: "c".repeat(9999),
        skills_comments: "d".repeat(9999),
        weaknesses: "e".repeat(9999),
        additional_comments: "f".repeat(9999),
      },
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Total feedback content is too large");
  });
});

describe("sanitizeString", () => {
  it("trims and truncates to maxLength", () => {
    expect(sanitizeString("  hello world  ", 5)).toBe("hello");
  });

  it("returns an empty string for non-string input", () => {
    expect(sanitizeString(42)).toBe("");
    expect(sanitizeString(null)).toBe("");
    expect(sanitizeString(undefined)).toBe("");
  });

  it("defaults maxLength to 10000", () => {
    const long = "a".repeat(10005);
    expect(sanitizeString(long)).toHaveLength(10000);
  });
});

describe("sanitizeStringObject", () => {
  // Pinning intentional-looking-but-undocumented behavior: non-string values
  // and whitespace-only strings are silently dropped from the result rather
  // than being included as empty strings or errors.
  it("PINS BEHAVIOR: silently drops non-string values", () => {
    const result = sanitizeStringObject({
      name: "Alice",
      age: 30,
      active: true,
      meta: { nested: true },
    });
    expect(result).toEqual({ name: "Alice" });
  });

  it("PINS BEHAVIOR: silently drops whitespace-only strings", () => {
    const result = sanitizeStringObject({
      name: "Alice",
      blank: "   ",
      empty: "",
    });
    expect(result).toEqual({ name: "Alice" });
  });

  it("sanitizes remaining string values with the given maxLength", () => {
    const result = sanitizeStringObject(
      { bio: "  a very long bio indeed  " },
      10
    );
    expect(result).toEqual({ bio: "a very lon" });
  });
});
