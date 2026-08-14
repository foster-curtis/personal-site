import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { User } from "@supabase/supabase-js";
import { isOwner } from "@/lib/auth";

function makeUser(email: string | undefined): User {
  return { email } as User;
}

describe("isOwner", () => {
  const originalOwnerEmail = process.env.OWNER_EMAIL;

  beforeEach(() => {
    process.env.OWNER_EMAIL = "owner@example.com";
  });

  afterEach(() => {
    process.env.OWNER_EMAIL = originalOwnerEmail;
    vi.restoreAllMocks();
  });

  it("returns false when user is null", () => {
    expect(isOwner(null)).toBe(false);
  });

  it("returns false when user.email is falsy", () => {
    expect(isOwner(makeUser(undefined))).toBe(false);
    expect(isOwner(makeUser(""))).toBe(false);
  });

  it("returns false and warns when OWNER_EMAIL is unset", () => {
    delete process.env.OWNER_EMAIL;
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = isOwner(makeUser("owner@example.com"));
    expect(result).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(
      "OWNER_EMAIL environment variable is not set"
    );
  });

  it("returns true for a case-insensitive exact email match", () => {
    expect(isOwner(makeUser("owner@example.com"))).toBe(true);
    expect(isOwner(makeUser("OWNER@EXAMPLE.COM"))).toBe(true);
    expect(isOwner(makeUser("Owner@Example.Com"))).toBe(true);
  });

  it("returns false for a non-matching email", () => {
    expect(isOwner(makeUser("someone-else@example.com"))).toBe(false);
  });
});
