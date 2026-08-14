import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/lib/analytics", () => ({
  trackChatMessage: vi.fn(),
  trackChatResponse: vi.fn(),
}));

import ChatPage from "@/app/(public)/chat/page";

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body } as unknown as Response;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

async function sendMessage(user: ReturnType<typeof userEvent.setup>, text: string) {
  await user.type(screen.getByPlaceholderText("Type your message..."), text);
  await user.click(screen.getByRole("button", { name: "Send" }));
}

describe("ChatPage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("optimistically appends the user's message before the API response arrives", async () => {
    const user = userEvent.setup();
    const gate = deferred<Response>();
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(gate.promise));

    render(<ChatPage />);
    await sendMessage(user, "Hello there");

    expect(await screen.findByText("Hello there")).toBeInTheDocument();

    gate.resolve(jsonResponse({ response: "Hi!", sources: [] }));
    await screen.findByText("Hi!");
  });

  it("shows the prompt marquee only while there are no messages", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ response: "Hi!", sources: [] }))
    );

    render(<ChatPage />);
    expect(
      screen.getByRole("navigation", { name: "Suggested questions" })
    ).toBeInTheDocument();

    await sendMessage(user, "Hello there");
    await screen.findByText("Hi!");

    expect(
      screen.queryByRole("navigation", { name: "Suggested questions" })
    ).not.toBeInTheDocument();
  });

  it("appends a visible assistant error message when the response is non-ok", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, false)));

    render(<ChatPage />);
    await sendMessage(user, "Hello there");

    expect(
      await screen.findByText(
        "Sorry, I encountered an error. Please try again."
      )
    ).toBeInTheDocument();
  });

  it("appends a visible assistant error message when the fetch rejects outright", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    render(<ChatPage />);
    await sendMessage(user, "Hello there");

    expect(
      await screen.findByText(
        "Sorry, I encountered an error. Please try again."
      )
    ).toBeInTheDocument();
  });

  it("disables input/submit while loading and re-enables (finally) after a success", async () => {
    const user = userEvent.setup();
    const gate = deferred<Response>();
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(gate.promise));

    render(<ChatPage />);
    const input = screen.getByPlaceholderText("Type your message...");
    await user.type(input, "Hello there");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(input).toBeDisabled();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();

    gate.resolve(jsonResponse({ response: "Hi!", sources: [] }));
    await screen.findByText("Hi!");

    expect(input).not.toBeDisabled();
  });

  it("disables input/submit while loading and re-enables (finally) after a failure", async () => {
    const user = userEvent.setup();
    const gate = deferred<Response>();
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(gate.promise));

    render(<ChatPage />);
    const input = screen.getByPlaceholderText("Type your message...");
    await user.type(input, "Hello there");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(input).toBeDisabled();

    gate.resolve(jsonResponse({}, false));
    await screen.findByText("Sorry, I encountered an error. Please try again.");

    expect(input).not.toBeDisabled();
  });
});
