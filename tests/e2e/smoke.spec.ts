import { expect, test } from "@playwright/test";

/** End-to-end smoke for the post-revamp UI. Catches the integration
 * failures the unit tests can't see: SSR/CSR mismatches, hook-order
 * errors, missing client directives, broken sidebar nav, and the
 * Auto-fill (was: Generate Meal Plan) flow. */
test.describe("macro-calculator happy path", () => {
  test("renders the calculator with daily targets", async ({ page }) => {
    await page.goto("/");
    // Sidebar shows the section names as buttons; topbar shows the title.
    await expect(
      page.getByRole("button", { name: "Calculator" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Meal Plan" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Calculator" }),
    ).toBeVisible();
    // The Daily Targets panel renders with BMR / TDEE / Target.
    await expect(page.getByText("Daily Targets")).toBeVisible();
    await expect(page.getByText("BMR", { exact: true })).toBeVisible();
    await expect(page.getByText("TDEE", { exact: true })).toBeVisible();
    await expect(page.getByText("Target", { exact: true })).toBeVisible();
  });

  test("food search shows the Built-in source badge", async ({ page }) => {
    await page.goto("/");
    // Navigate via sidebar.
    await page.getByRole("button", { name: "Meal Plan" }).click();
    await page.getByPlaceholder(/Search for a food/i).fill("chicken");
    await expect(page.getByText(/Built-in/).first()).toBeVisible({
      timeout: 5_000,
    });
  });

  test("Auto-fill populates meals from macro targets", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Meal Plan" }).click();
    // The Generate button was renamed Auto-fill. Click whichever is visible.
    await page
      .getByRole("button", { name: /Auto-fill/i })
      .first()
      .click();
    // At least one well-known builtin food should appear in the rendered plan.
    await expect(
      page
        .locator("body")
        .filter({ hasText: /Chicken|Salmon|Oats|Rice|Eggs/ })
        .first(),
    ).toBeVisible({ timeout: 15_000 });
  });
});
