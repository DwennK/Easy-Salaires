import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  locale: "fr-CH",
  acceptDownloads: true,
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const output = "output/playwright/monthly-easy";
await mkdir(output, { recursive: true });
try {
  await page.goto(process.env.UI_URL || "http://127.0.0.1:1420");
  await page
    .getByRole("button", { name: "Essayer la démonstration", exact: true })
    .click();
  await page.getByRole("heading", { name: "Les salaires." }).waitFor();
  await page
    .getByRole("button", { name: "Salaires du mois", exact: true })
    .click();
  await page.getByRole("button", { name: "Kiwi", exact: true }).click();
  const month = page.locator(".month-workspace");
  await month.getByLabel("Année", { exact: true }).selectOption("2026");
  await month.getByLabel("Mois", { exact: true }).selectOption("10");
  await month
    .locator(".month-focus")
    .getByRole("button", { name: "Saisir les heures", exact: true })
    .waitFor();
  assert.match(await month.locator(".month-focus").innerText(), /Alex Morel/);
  assert.equal(await month.locator("tbody tr").count(), 3);
  assert.match(
    await month.locator(".month-summary-net").innerText(),
    /7\s?461.80/,
  );
  await page.mouse.move(800, 160);
  await page.screenshot({
    path: `${output}/01-desktop.png`,
    fullPage: true,
    animations: "disabled",
  });
  await month.getByRole("button", { name: "Exporter", exact: true }).click();
  assert(
    await month
      .getByRole("button", { name: "Télécharger les fiches PDF", exact: true })
      .isDisabled(),
  );
  assert(
    await month
      .getByRole("button", {
        name: "Exporter la pièce comptable (CSV)",
        exact: true,
      })
      .isDisabled(),
  );
  assert(await month.locator(".month-export-panel p").first().isVisible());
  await page.keyboard.press("Escape");
  assert.equal(await month.locator(".month-export-panel").count(), 0);
  await month.getByLabel("Charges & coût total", { exact: true }).check();
  assert.equal(await month.locator("thead th").count(), 8);
  await month.getByLabel("Charges & coût total", { exact: true }).uncheck();
  assert.equal(await month.locator("thead th").count(), 6);
  await month
    .locator(".month-focus")
    .getByRole("button", { name: "Saisir les heures", exact: true })
    .click();
  await page.getByRole("dialog").waitFor();
  assert(
    await page
      .getByRole("dialog")
      .getByLabel("Heures travaillées ce mois", { exact: true })
      .isVisible(),
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Fermer", exact: true })
    .click();
  await month
    .getByRole("button", { name: "Mois précédent", exact: true })
    .click();
  assert.equal(
    await month.getByLabel("Mois", { exact: true }).inputValue(),
    "9",
  );
  await month
    .locator(".month-focus")
    .getByRole("button", { name: "Télécharger les fiches PDF", exact: true })
    .waitFor();
  const download = page.waitForEvent("download");
  await month
    .locator(".month-focus")
    .getByRole("button", { name: "Télécharger les fiches PDF", exact: true })
    .click();
  assert.equal((await download).suggestedFilename(), "2026-09_salaires.pdf");
  await month.getByRole("button", { name: "Exporter", exact: true }).click();
  const csv = page.waitForEvent("download");
  await month
    .getByRole("button", {
      name: "Exporter la pièce comptable (CSV)",
      exact: true,
    })
    .click();
  assert.equal((await csv).suggestedFilename(), "2026-09_piece_comptable.csv");
  await month.getByLabel("Mois", { exact: true }).selectOption("12");
  await month
    .getByRole("button", { name: "Mois suivant", exact: true })
    .click();
  assert.equal(
    await month.getByLabel("Année", { exact: true }).inputValue(),
    "2027",
  );
  assert.equal(
    await month.getByLabel("Mois", { exact: true }).inputValue(),
    "1",
  );
  assert(
    await month
      .locator(".month-focus")
      .getByRole("button", { name: "Préparer le mois", exact: true })
      .isVisible(),
  );
  await month
    .getByRole("button", { name: "Mois précédent", exact: true })
    .click();
  assert.equal(
    await month.getByLabel("Année", { exact: true }).inputValue(),
    "2026",
  );
  await month.getByLabel("Mois", { exact: true }).selectOption("10");
  await month.locator(".month-help summary").click();
  assert.equal(await month.locator(".month-workflow li").count(), 4);
  assert(
    await month
      .getByRole("button", { name: "Préparer les fiches du mois", exact: true })
      .isVisible(),
  );
  await month.locator(".month-help summary").click();
  await page.locator(".toast").waitFor({ state: "hidden" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${output}/02-mobile.png`, fullPage: true });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await month.getByRole("button", { name: "Exporter", exact: true }).click();
  const box = await month.locator(".month-export-panel").boundingBox();
  assert(box.x >= 0 && box.x + box.width <= 390);
  await page.screenshot({
    path: `${output}/03-mobile-exports.png`,
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  await writeFile(
    `${output}/report.json`,
    JSON.stringify(
      {
        result: "passed",
        errors,
        checks: [
          "partial totals",
          "contextual hours action",
          "six columns",
          "optional employer costs",
          "disabled export explanations",
          "Escape closes export",
          "payroll editor",
          "ready month PDF download",
          "accounting CSV download",
          "December/January navigation",
          "empty month",
          "workflow disclosure",
          "390px no page overflow",
          "mobile export bounds",
        ],
      },
      null,
      2,
    ),
  );
  console.log("Monthly UI checks passed");
} finally {
  await browser.close();
}
