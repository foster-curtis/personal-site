import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import ChatMessage from "@/components/chat/ChatMessage";

describe("ChatMessage", () => {
  it("renders a user message as literal plain text, not parsed markdown", () => {
    render(<ChatMessage message={{ role: "user", content: "**bold**" }} />);

    // The literal asterisks should be visible text, not a <strong> element.
    expect(screen.getByText("**bold**")).toBeInTheDocument();
    expect(screen.queryByText("bold", { selector: "strong" })).not.toBeInTheDocument();
    expect(screen.getByText("**bold**").tagName).toBe("P");
  });

  it("renders an assistant message's markdown, e.g. **bold** becomes <strong>", () => {
    render(
      <ChatMessage message={{ role: "assistant", content: "**bold**" }} />
    );

    const strong = screen.getByText("bold");
    expect(strong.tagName).toBe("STRONG");
  });

  it("renders assistant links with target=_blank and rel=noopener noreferrer", () => {
    render(
      <ChatMessage
        message={{
          role: "assistant",
          content: "[Foster's site](https://example.com)",
        }}
      />
    );

    const link = screen.getByRole("link", { name: "Foster's site" });
    expect(link).toHaveAttribute("href", "https://example.com");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });
});
