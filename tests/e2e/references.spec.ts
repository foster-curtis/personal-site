import { test, expect } from "@playwright/test";

test("references page: empty state renders when no feedback is available", async ({
  page,
}) => {
  await page.route("**/api/feedback/public-summary", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        available: false,
        message: "No peer feedback available yet",
      }),
    });
  });

  await page.goto("/references");

  await expect(
    page.getByRole("heading", { name: "Peer Feedback" })
  ).toBeVisible();
  await expect(page.getByText("No peer feedback available yet")).toBeVisible();
});
