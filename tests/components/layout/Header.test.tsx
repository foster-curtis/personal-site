import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMockSupabaseClient } from "../../helpers/supabase-mock";

const mockPush = vi.fn();
const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}));

const mockSupabase = createMockSupabaseClient();
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => mockSupabase,
}));

import Header from "@/components/layout/Header";

function jsonResponse(body: unknown) {
  return { ok: true, json: async () => body } as unknown as Response;
}

describe("Header", () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockRefresh.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("shows a loading placeholder before the session fetch resolves", () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));
    render(<Header />);
    expect(screen.getByText("...")).toBeInTheDocument();
  });

  it("shows Sign In when signed out", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ user: null, isOwner: false }))
    );
    render(<Header />);

    expect(
      await screen.findByRole("link", { name: "Sign In" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Dashboard" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Sign Out" })
    ).not.toBeInTheDocument();
  });

  it("shows Sign Out but no Dashboard link for a signed-in non-owner", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({ user: { id: "u1", email: "a@b.com" }, isOwner: false })
      )
    );
    render(<Header />);

    expect(
      await screen.findByRole("button", { name: "Sign Out" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Dashboard" })
    ).not.toBeInTheDocument();
  });

  it("shows the Dashboard link for a signed-in owner", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          user: { id: "u1", email: "owner@example.com" },
          isOwner: true,
        })
      )
    );
    render(<Header />);

    expect(
      await screen.findByRole("link", { name: "Dashboard" })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign Out" })).toBeInTheDocument();
  });

  it("logs out via supabase auth and navigates home on Sign Out click", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          user: { id: "u1", email: "owner@example.com" },
          isOwner: true,
        })
      )
    );
    const signOutSpy = vi.spyOn(mockSupabase.auth, "signOut");

    render(<Header />);
    await user.click(await screen.findByRole("button", { name: "Sign Out" }));

    expect(signOutSpy).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith("/");
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });
});
