import { randomBytes } from "crypto";

/**
 * Generate a secure random token for feedback links.
 * Uses crypto.randomBytes for cryptographically secure randomness.
 */
export function generateFeedbackToken(): string {
  // Generate 32 bytes (256 bits) of random data, encode as base64url
  // This gives us a URL-safe token that's hard to guess
  const bytes = randomBytes(32);
  return bytes.toString("base64url");
}

/**
 * Validate token format (basic check)
 */
export function isValidTokenFormat(token: string): boolean {
  // Base64url tokens should be alphanumeric plus - and _
  // Length check: 32 bytes = 43 base64url characters (with padding)
  return /^[A-Za-z0-9_-]{32,}$/.test(token);
}
