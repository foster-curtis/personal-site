import { test, expect } from "@playwright/test";

test("job analysis flow: paste a job description and see a rendered analysis", async ({
  page,
}) => {
  // Intercept at the /api/job-compare boundary so this test never reaches Gemini.
  await page.route("**/api/job-compare", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        analysis: {
          overallMatch: "strong",
          matchScore: 88,
          summary: "Strong alignment with the role's core requirements.",
          strengths: [
            {
              area: "TypeScript",
              evidence: "5 years building production apps",
              relevance: "Directly applicable to this role",
            },
          ],
          partialMatches: [],
          gaps: [],
          recommendation: {
            hire: true,
            confidence: "high",
            reasoning: "Candidate meets nearly all requirements.",
            interviewFocus: ["System design"],
          },
        },
      }),
    });
  });

  await page.goto("/job-analysis");

  await page
    .getByPlaceholder("Paste the full job description here...")
    .fill("We need a TypeScript engineer with 5 years of experience.");
  await page.getByRole("button", { name: "Analyze Job Fit" }).click();

  await expect(
    page.getByText("Strong alignment with the role's core requirements.")
  ).toBeVisible();
  await expect(page.getByText("88%")).toBeVisible();
});
