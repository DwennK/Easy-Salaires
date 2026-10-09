import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import assert from "node:assert/strict";

const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  locale: "fr-CH",
});
const page = await context.newPage();
page.setDefaultTimeout(10000);
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const output = "output/playwright/year-navigation";
await mkdir(output, { recursive: true });
const annual = () =>
  page
    .getByRole("button", { name: "Récapitulatif annuel", exact: true })
    .click();
const year = () => page.getByRole("combobox", { name: "Année", exact: true });
const options = () => year().locator("option").allTextContents();
async function snapshot(name) {
  await page.screenshot({ path: `${output}/${name}.png`, fullPage: true });
}
async function storedRules() {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open("easy-salaires-preview", 1);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction("demo", "readonly");
          const query = tx.objectStore("demo").get("state");
          query.onsuccess = () => resolve(query.result.rules);
          query.onerror = () => reject(query.error);
          tx.oncomplete = () => db.close();
        };
        request.onerror = () => reject(request.error);
      }),
  );
}
async function settings() {
  await page.getByRole("button", { name: "Paramètres", exact: true }).click();
  await page
    .getByRole("tab", { name: "Cotisations et assurances", exact: true })
    .click();
}
async function discardRules() {
  await page
    .getByRole("button", {
      name: "Annuler les modifications des cotisations",
      exact: true,
    })
    .click();
}
try {
  await page.goto(process.env.UI_URL || "http://127.0.0.1:1421");
  await page
    .getByRole("button", { name: "Essayer la démonstration", exact: true })
    .click();
  await annual();
  assert((await options()).includes("2025"));
  await year().selectOption("2025");
  assert.equal(await year().inputValue(), "2025");
  await page.getByRole("button", { name: "Les salaires", exact: true }).click();
  await page
    .getByRole("button", { name: "Informations de l’employé", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("tab", { name: "Contrat et salaire", exact: true })
    .click();
  await dialog.getByLabel("Date d’entrée", { exact: true }).fill("2022-06-01");
  await dialog
    .getByRole("button", { name: "Enregistrer l’employé", exact: true })
    .click();
  await dialog.waitFor({ state: "hidden" });
  await page.locator(".busy-indicator").waitFor({ state: "hidden" });
  await annual();
  for (const value of ["2022", "2023", "2024", "2025"]) {
    assert((await options()).includes(value), `Missing employee year ${value}`);
  }
  await year().selectOption("2025");
  await page.locator("details.notice").click();
  assert.match(
    await page.locator("details.notice p").innerText(),
    /Camille Favre · 2025-01/,
  );
  assert.equal(
    await page.getByRole("button", { name: "CSV", exact: true }).isEnabled(),
    false,
  );
  await snapshot("desktop-2025");
  await year().selectOption("2022");
  assert.equal(await year().inputValue(), "2022");
  await page
    .getByRole("navigation", { name: "Navigation" })
    .getByRole("button", { name: "Salaires du mois", exact: true })
    .click();
  assert.equal(await year().inputValue(), "2022");
  await year().selectOption("2025");
  await page.reload();
  await annual();
  assert((await options()).includes("2022"), "Employee date survives reload");
  await year().selectOption("2025");
  await year().selectOption("2024");
  await year().selectOption("2026");
  assert((await page.locator("table tbody tr").count()) > 0);
  await page.setViewportSize({ width: 390, height: 844 });
  await year().selectOption("2025");
  assert.equal(await year().inputValue(), "2025");
  const bounds = await year().boundingBox();
  assert(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 390);
  await snapshot("mobile-2025");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await settings();
  const originalRules = await storedRules();
  assert((await options()).includes("2022"));
  await page
    .getByRole("button", { name: "Configurer l’année précédente", exact: true })
    .click();
  assert.equal(await year().inputValue(), "2025");
  assert(
    await year().isDisabled(),
    "Unsaved draft cannot be lost by changing years",
  );
  assert.equal(
    await page
      .getByLabel("Plafond AC annuel CHF", { exact: true })
      .inputValue(),
    "",
  );
  assert.equal(
    await page
      .getByLabel(
        "J’ai vérifié les règles de cette année auprès des sources officielles.",
        { exact: true },
      )
      .isChecked(),
    false,
  );
  await snapshot("settings-desktop-2025");
  await discardRules();
  assert.equal(await year().inputValue(), "2026");
  assert.deepEqual(await storedRules(), originalRules);
  // Direct selection must create the same draft as the previous-year button.
  await year().selectOption("2025");
  await page
    .getByRole("button", { name: "Enregistrer les cotisations", exact: true })
    .click();
  await page.locator(".busy-indicator").waitFor({ state: "hidden" });
  assert(await year().isEnabled());
  const savedRules = await storedRules();
  assert.deepEqual(
    savedRules.filter((r) => r.year === 2026),
    originalRules,
  );
  const previous = savedRules.find((r) => r.year === 2025);
  assert(previous && !previous.verified);
  assert.equal(previous.effective, "2025-01");
  assert(
    previous.contributions.every(
      (c) => c.employee === null && c.employer === null,
    ),
  );
  await year().selectOption("2026");
  await page
    .getByRole("button", { name: "Configurer l’année précédente", exact: true })
    .click();
  assert.equal(await year().inputValue(), "2025");
  assert(
    await year().isEnabled(),
    "Existing year loads without creating another draft",
  );
  await page.reload();
  await settings();
  assert.equal(await year().inputValue(), "2025");
  await year().selectOption("2026");
  await page
    .getByRole("button", { name: "Configurer l’année suivante", exact: true })
    .click();
  assert.equal(await year().inputValue(), "2027");
  await discardRules();
  await year().selectOption("2022");
  assert.equal(await year().inputValue(), "2022");
  await discardRules();
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Configurer l’année précédente", exact: true })
    .click();
  assert.equal(await year().inputValue(), "2025");
  await snapshot("settings-mobile-2025");
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: annual/monthly/settings year navigation, previous/next/direct selection, draft save/discard, preserved 2026 rules, reload, desktop/mobile, no page errors",
  );
} finally {
  await browser.close();
}
