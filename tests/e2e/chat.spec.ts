import { test, expect } from "@playwright/test";

test("chat flow: ask a question and see a rendered assistant response", async ({
  page,
}) => {
  // Intercept at the /api/chat boundary so this test never reaches Gemini.
  await page.route("**/api/chat", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        response:
          "I have **five years** of experience building production TypeScript applications.",
        sources: [{ title: "Resume", similarity: 0.91 }],
      }),
    });
  });

  await page.goto("/chat");

  await page
    .getByPlaceholder("Type your message...")
    .fill("What's your TypeScript experience?");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(
    page.getByText("five years", { exact: false })
  ).toBeVisible();
});
