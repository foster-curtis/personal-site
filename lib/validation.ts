/**
 * Input Validation Utilities
 *
 * Provides validation functions for user input across the application.
 * Helps prevent abuse and ensures data quality.
 */

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate a string field
 */
export function validateString(
  value: unknown,
  fieldName: string,
  options: {
    required?: boolean;
    minLength?: number;
    maxLength?: number;
    pattern?: RegExp;
    patternMessage?: string;
  } = {}
): ValidationResult {
  const errors: string[] = [];

  // Check if value exists
  if (value === undefined || value === null || value === "") {
    if (options.required) {
      errors.push(`${fieldName} is required`);
    }
    return { valid: errors.length === 0, errors };
  }

  // Check type
  if (typeof value !== "string") {
    errors.push(`${fieldName} must be a string`);
    return { valid: false, errors };
  }

  const trimmed = value.trim();

  // Check min length
  if (options.minLength !== undefined && trimmed.length < options.minLength) {
    errors.push(
      `${fieldName} must be at least ${options.minLength} characters`
    );
  }

  // Check max length
  if (options.maxLength !== undefined && trimmed.length > options.maxLength) {
    errors.push(`${fieldName} must be at most ${options.maxLength} characters`);
  }

  // Check pattern
  if (options.pattern && !options.pattern.test(trimmed)) {
    errors.push(options.patternMessage || `${fieldName} has an invalid format`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate feedback form submission
 */
export function validateFeedbackSubmission(body: unknown): ValidationResult {
  const errors: string[] = [];

  if (!body || typeof body !== "object") {
    return { valid: false, errors: ["Invalid request body"] };
  }

  const data = body as Record<string, unknown>;

  // Validate token
  const tokenResult = validateString(data.token, "token", {
    required: true,
    minLength: 20,
    maxLength: 100,
  });
  errors.push(...tokenResult.errors);

  // Validate metadata (optional object)
  if (data.metadata !== undefined && data.metadata !== null) {
    if (typeof data.metadata !== "object") {
      errors.push("metadata must be an object");
    } else {
      const metadata = data.metadata as Record<string, unknown>;

      // Validate individual metadata fields if present
      if (metadata.relationship !== undefined) {
        const relResult = validateString(
          metadata.relationship,
          "relationship",
          {
            maxLength: 100,
          }
        );
        errors.push(...relResult.errors);
      }

      if (metadata.worked_from !== undefined) {
        const fromResult = validateString(metadata.worked_from, "worked_from", {
          maxLength: 50,
        });
        errors.push(...fromResult.errors);
      }

      if (metadata.worked_to !== undefined) {
        const toResult = validateString(metadata.worked_to, "worked_to", {
          maxLength: 50,
        });
        errors.push(...toResult.errors);
      }
    }
  }

  // Validate content (optional object with text fields)
  if (data.content !== undefined && data.content !== null) {
    if (typeof data.content !== "object") {
      errors.push("content must be an object");
    } else {
      const content = data.content as Record<string, unknown>;

      // Validate each content field - max 10000 chars per field to prevent abuse
      const maxContentLength = 10000;
      for (const [key, value] of Object.entries(content)) {
        if (value !== undefined && value !== null) {
          const fieldResult = validateString(value, key, {
            maxLength: maxContentLength,
          });
          errors.push(...fieldResult.errors);
        }
      }

      // Ensure total content isn't excessively large (50KB limit)
      const totalContentSize = JSON.stringify(content).length;
      if (totalContentSize > 50000) {
        errors.push("Total feedback content is too large");
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Sanitize a string for safe storage (trim whitespace, limit length)
 */
export function sanitizeString(
  value: unknown,
  maxLength: number = 10000
): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().slice(0, maxLength);
}

/**
 * Sanitize an object's string values
 */
export function sanitizeStringObject(
  obj: Record<string, unknown>,
  maxLength: number = 10000
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "string" && value.trim()) {
      result[key] = sanitizeString(value, maxLength);
    }
  }

  return result;
}
