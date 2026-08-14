import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PromptMarquee from "@/components/chat/PromptMarquee";

const promptRows = [
  ["What is Foster's background?", "What companies has Foster worked at?"],
  ["What are Foster's strongest skills?"],
];

describe("PromptMarquee", () => {
  it("renders 2N buttons per row (each row duplicated for the marquee effect)", () => {
    render(<PromptMarquee promptRows={promptRows} onPromptClick={vi.fn()} />);

    const rows = screen.getAllByRole("group");
    expect(rows).toHaveLength(promptRows.length);

    rows.forEach((row, index) => {
      const buttons = row.querySelectorAll("button");
      expect(buttons).toHaveLength(promptRows[index].length * 2);
    });
  });

  it("renders nothing when disabled", () => {
    const { container } = render(
      <PromptMarquee promptRows={promptRows} onPromptClick={vi.fn()} disabled />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("calls onPromptClick with the exact prompt string when a button is clicked", async () => {
    const user = userEvent.setup();
    const onPromptClick = vi.fn();
    render(<PromptMarquee promptRows={promptRows} onPromptClick={onPromptClick} />);

    await user.click(
      screen.getAllByRole("button", { name: `Ask: ${promptRows[0][0]}` })[0]
    );

    expect(onPromptClick).toHaveBeenCalledTimes(1);
    expect(onPromptClick).toHaveBeenCalledWith(promptRows[0][0]);
  });

  describe("accessibility contract", () => {
    it("wraps everything in a nav labelled 'Suggested questions'", () => {
      render(<PromptMarquee promptRows={promptRows} onPromptClick={vi.fn()} />);
      expect(
        screen.getByRole("navigation", { name: "Suggested questions" })
      ).toBeInTheDocument();
    });

    it("gives each row role=group with its own aria-label", () => {
      render(<PromptMarquee promptRows={promptRows} onPromptClick={vi.fn()} />);
      expect(
        screen.getByRole("group", { name: "Question suggestions row 1" })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("group", { name: "Question suggestions row 2" })
      ).toBeInTheDocument();
    });

    it("labels every button as 'Ask: <prompt>'", () => {
      render(<PromptMarquee promptRows={promptRows} onPromptClick={vi.fn()} />);
      for (const prompt of promptRows.flat()) {
        expect(
          screen.getAllByRole("button", { name: `Ask: ${prompt}` }).length
        ).toBeGreaterThan(0);
      }
    });

    it("hides the decorative fade edges from screen readers", () => {
      const { container } = render(
        <PromptMarquee promptRows={promptRows} onPromptClick={vi.fn()} />
      );
      const hidden = container.querySelectorAll('[aria-hidden="true"]');
      // Two fade edges per row.
      expect(hidden.length).toBe(promptRows.length * 2);
    });
  });
});
