import { test, expect } from "@playwright/test";

const TOKEN = "e2e-test-token-123";

test("feedback form flow: fill out a seeded link and see the thank-you state", async ({
  page,
}) => {
  // Intercept both calls at the network boundary with a mocked, valid link —
  // no real Supabase row is read or written, so this test is also safe to
  // run repeatedly without the token ever getting consumed/invalidated.
  await page.route(`**/api/feedback/form/${TOKEN}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        request: {
          id: "11111111-1111-1111-1111-111111111111",
          title: "Feedback for Foster",
          notes: null,
        },
        link: {
          id: "22222222-2222-2222-2222-222222222222",
          token: TOKEN,
          expires_at: null,
          max_submissions: null,
          submission_count: 0,
        },
      }),
    });
  });

  await page.route("**/api/feedback/submit", async (route) => {
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        message: "Thank you for your feedback!",
      }),
    });
  });

  await page.goto(`/feedback/${TOKEN}`);

  await page
    .getByLabel("What was your working relationship?")
    .selectOption("coworker");
  await page
    .getByLabel("How would you describe them as a worker?")
    .fill("Reliable, thoughtful, and great to collaborate with.");

  await page.getByRole("button", { name: "Submit Feedback" }).click();

  await expect(page.getByRole("heading", { name: "Thank You!" })).toBeVisible();
});
