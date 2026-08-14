import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockUseParams = vi.fn();
vi.mock("next/navigation", () => ({
  useParams: () => mockUseParams(),
}));

vi.mock("@/lib/analytics", () => ({
  trackFeedbackSubmitted: vi.fn(),
}));

import FeedbackFormPage from "@/app/(public)/feedback/[token]/page";
import { trackFeedbackSubmitted } from "@/lib/analytics";

const TOKEN = "test-token-123";

const formResponse = {
  request: { id: "req-1", title: "Feedback for Foster", notes: null },
  link: {
    id: "link-1",
    token: TOKEN,
    expires_at: null,
    max_submissions: null,
    submission_count: 0,
  },
};

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

describe("FeedbackFormPage", () => {
  beforeEach(() => {
    mockUseParams.mockReturnValue({ token: TOKEN });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("shows a loading skeleton, then the form once the fetch resolves", async () => {
    const gate = deferred<Response>();
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(gate.promise));

    const { container } = render(<FeedbackFormPage />);

    expect(container.querySelector(".animate-pulse")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /submit feedback/i })
    ).not.toBeInTheDocument();

    gate.resolve(jsonResponse(formResponse));

    await screen.findByRole("button", { name: /submit feedback/i });
    expect(container.querySelector(".animate-pulse")).not.toBeInTheDocument();
  });

  it("shows an error state (not the form) when the fetch fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(jsonResponse({ error: "Invalid or expired link" }, false))
    );

    render(<FeedbackFormPage />);

    await screen.findByText("Unable to Load Form");
    expect(screen.getByText("Invalid or expired link")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /submit feedback/i })
    ).not.toBeInTheDocument();
  });

  it("splits values into metadata vs content by question category, drops blanks, tracks submission, and shows the success state", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/feedback/form/")) {
        return Promise.resolve(jsonResponse(formResponse));
      }
      if (url === "/api/feedback/submit") {
        return Promise.resolve(jsonResponse({ success: true }));
      }
      throw new Error(`Unexpected fetch call: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<FeedbackFormPage />);

    await screen.findByRole("button", { name: /submit feedback/i });

    // Metadata: fill relationship (required) and worked_from; leave worked_to blank.
    await user.selectOptions(
      screen.getByLabelText(/what was your working relationship/i),
      "coworker"
    );
    await user.type(
      screen.getByLabelText(/when did you start working with them/i),
      "January 2022"
    );

    // Type then clear "role" — this must be dropped as blank, not sent as "".
    const roleInput = screen.getByLabelText(/what was your role\/title/i);
    await user.type(roleInput, "Temp");
    await user.clear(roleInput);

    // Content: fill the required worker_description; leave the rest blank.
    await user.type(
      screen.getByLabelText(/how would you describe them as a worker/i),
      "Reliable and sharp."
    );

    await user.click(screen.getByRole("button", { name: /submit feedback/i }));

    await screen.findByText("Thank You!");

    const submitCall = fetchMock.mock.calls.find(
      ([url]) => url === "/api/feedback/submit"
    );
    expect(submitCall).toBeDefined();
    const body = JSON.parse(submitCall![1].body);

    expect(body).toEqual({
      token: TOKEN,
      metadata: { relationship: "coworker", worked_from: "January 2022" },
      content: { worker_description: "Reliable and sharp." },
    });

    expect(trackFeedbackSubmitted).toHaveBeenCalledWith("coworker");
  });
});
