import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const output = "output/playwright/decimal-format";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  locale: "fr-CH",
});
const page = await context.newPage();
page.setDefaultTimeout(60000);
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const saved = () =>
  page.locator(".busy-indicator").waitFor({ state: "hidden" });
async function noDecimalCommas() {
  assert.doesNotMatch(await page.locator("main").innerText(), /\d,\d/);
}
try {
  await page.goto(process.env.UI_URL || "http://127.0.0.1:1420");
  await page
    .getByRole("button", { name: "Essayer la démonstration", exact: true })
    .click();
  await page.getByRole("heading", { name: "Les salaires." }).waitFor();
  await saved();
  await noDecimalCommas();
  const salary = page.getByLabel("Salaire de base janvier", { exact: true });
  await salary.fill("5200,30");
  assert.equal(await salary.inputValue(), "5200,30");
  await salary.press("Tab");
  await saved();
  assert.equal(await salary.inputValue(), "5200.30");
  await page.reload();
  await page.getByRole("heading", { name: "Les salaires." }).waitFor();
  assert.equal(await salary.inputValue(), "5200.30");
  await page
    .getByRole("button", { name: "Paiement janvier", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  const amount = dialog.getByLabel("Montant payé", { exact: true });
  await amount.fill("62,50");
  assert.equal(await amount.inputValue(), "62,50");
  await amount.press("Tab");
  assert.equal(await amount.inputValue(), "62.50");
  await dialog
    .getByRole("button", { name: "Enregistrer", exact: true })
    .click();
  await saved();
  assert.match(
    await page.locator('.year-grid tr[data-period$="-01"]').innerText(),
    /62\.50/,
  );
  await noDecimalCommas();
  await page.screenshot({ path: `${output}/desktop.png`, fullPage: true });
  await page
    .getByRole("button", { name: "Informations de l’employé", exact: true })
    .click();
  await dialog
    .getByRole("tab", { name: "Contrat et salaire", exact: true })
    .click();
  const contractSalary = dialog.locator('input[inputmode="decimal"]').nth(1);
  await contractSalary.fill("5300,45");
  assert.equal(await contractSalary.inputValue(), "5300,45");
  await contractSalary.press("Tab");
  assert.equal(await contractSalary.inputValue(), "5300.45");
  assert.match(
    await dialog.locator(".salary-confirmation").innerText(),
    /5300\.45/,
  );
  await page.screenshot({ path: `${output}/contract.png`, fullPage: true });
  // Close without saving the contract; the numeric field behavior is the target.
  await page.keyboard.press("Escape");
  await dialog
    .getByRole("button", { name: "Quitter sans enregistrer", exact: true })
    .click();
  await dialog.waitFor({ state: "hidden" });
  for (const name of [
    "Salaires du mois",
    "Employés",
    "Récapitulatif annuel",
    "Paramètres",
  ]) {
    await page.getByRole("button", { name, exact: true }).click();
    await noDecimalCommas();
  }
  await page
    .getByRole("tab", { name: "Cotisations et assurances", exact: true })
    .click();
  for (const value of await page
    .locator('input[inputmode="decimal"]')
    .evaluateAll((inputs) => inputs.map((input) => input.value))) {
    assert.doesNotMatch(value, /\d,\d/);
  }
  await page.getByRole("button", { name: "Les salaires", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await noDecimalCommas();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.screenshot({ path: `${output}/mobile.png`, fullPage: true });
  assert.deepEqual(errors, []);
  await writeFile(
    `${output}/result.json`,
    JSON.stringify(
      {
        passed: true,
        errors,
        checks: [
          "decimal dots",
          "comma typing",
          "normalize on blur",
          "saved salary after reload",
          "payment 62.50",
          "contract salary",
          "desktop and mobile",
        ],
      },
      null,
      2,
    ),
  );
  console.log("Decimal UI checks passed");
} finally {
  await browser.close();
}
