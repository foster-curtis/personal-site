import { test, expect } from "@playwright/test";

test.describe("Home page", () => {
  test("renders the hero", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: /hi, i'm foster curtis/i })
    ).toBeVisible();
  });

  test("'Chat with AI' CTA navigates to /chat", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Chat with AI" }).click();
    await expect(page).toHaveURL(/\/chat$/);
  });

  test("'Analyze Job Fit' CTA navigates to /job-analysis", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Analyze Job Fit" }).click();
    await expect(page).toHaveURL(/\/job-analysis$/);
  });
});
