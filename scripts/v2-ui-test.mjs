import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1050 },
  locale: "fr-CH",
  acceptDownloads: true,
});
const page = await context.newPage();
page.setDefaultTimeout(12000);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const output = "output/playwright/v2";
await mkdir(output, { recursive: true });
async function capture(name) {
  await page.screenshot({ path: `${output}/${name}.png`, fullPage: true });
}
async function state() {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const r = indexedDB.open("easy-salaires-preview", 1);
        r.onsuccess = () => {
          const db = r.result;
          const tx = db.transaction("demo", "readonly");
          const q = tx.objectStore("demo").get("state");
          q.onsuccess = () => resolve(q.result);
          q.onerror = () => reject(q.error);
          tx.oncomplete = () => db.close();
        };
      }),
  );
}
async function saved() {
  await page.locator(".busy-indicator").waitFor({ state: "hidden" });
}
try {
  await page.goto(process.env.UI_URL || "http://127.0.0.1:1420");
  await page
    .getByRole("button", { name: "Essayer la démonstration", exact: true })
    .click();
  await page.getByRole("heading", { name: "Les salaires." }).waitFor();
  assert.equal(await page.locator(".year-grid tbody tr").count(), 12);
  await capture("01-kiwi");
  const first = await state();
  const id = first.employees[0].id;
  const original = JSON.stringify(first.revisions);
  await page
    .getByRole("button", { name: "Informations de l’employé", exact: true })
    .click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nom", { exact: true }).fill("Global");
  await dialog
    .getByRole("button", { name: "Enregistrer l’employé", exact: true })
    .click();
  await saved();
  await page
    .getByRole("heading", { name: "Camille Global", exact: true })
    .waitFor();
  let current = await state();
  assert(
    current.payrolls
      .filter((p) => p.employeeId === id)
      .every((p) => p.employee.lastName === "Global"),
  );
  assert.equal(JSON.stringify(current.revisions), original);
  assert(
    current.payrolls
      .filter((p) => p.employeeId === id && p.period < "2026-10")
      .every((p) => p.paidDate),
  );
  const jan = page.getByLabel("Salaire de base janvier", { exact: true });
  await jan.fill("5500");
  await jan.press("Tab");
  await saved();
  current = await state();
  assert.equal(
    current.payrolls.find((p) => p.employeeId === id && p.period === "2026-01")
      .terms.salary,
    "5500",
  );
  const feb = page.getByLabel("Salaire de base février", { exact: true });
  assert.equal(await feb.inputValue(), "5200");
  await page
    .getByRole("button", { name: "Compléments janvier", exact: true })
    .click();
  await dialog
    .getByLabel("Prime / ajustement brut (CHF)", { exact: true })
    .fill("100");
  await dialog
    .getByLabel("Remboursement de frais (CHF)", { exact: true })
    .fill("80");
  await dialog
    .getByRole("button", { name: "Enregistrer", exact: true })
    .click();
  await saved();
  current = await state();
  const p = current.payrolls.find(
    (p) => p.employeeId === id && p.period === "2026-01",
  );
  assert.equal(p.result.gross, 560000);
  assert.equal(p.result.reimbursements, 8000);
  await page
    .getByRole("button", { name: "Paiement janvier", exact: true })
    .click();
  await dialog.getByLabel("Montant payé", { exact: true }).fill("1000");
  await dialog
    .getByLabel("Date du paiement", { exact: true })
    .fill("2026-01-29");
  await dialog
    .getByRole("button", { name: "Enregistrer", exact: true })
    .click();
  await saved();
  current = await state();
  assert.equal(
    current.payrolls.find((p) => p.employeeId === id && p.period === "2026-01")
      .paidAmount,
    100000,
  );
  await page.getByRole("button", { name: "PDF janvier", exact: true }).click();
  await saved();
  current = await state();
  assert.equal(current.revisions.length, first.revisions.length + 1);
  assert.equal(
    JSON.stringify(current.revisions.slice(0, first.revisions.length)),
    original,
  );
  await page
    .getByRole("button", {
      name: "Appliquer aux mois suivants novembre",
      exact: true,
    })
    .click();
  await dialog.getByLabel("Salaire de base", { exact: true }).fill("5700");
  await dialog
    .getByRole("button", { name: "Appliquer aux mois suivants", exact: true })
    .click();
  await saved();
  assert.equal(
    await page
      .getByLabel("Salaire de base décembre", { exact: true })
      .inputValue(),
    "5700",
  );
  assert.equal(
    await page
      .getByLabel("Salaire de base octobre", { exact: true })
      .inputValue(),
    "5200",
  );
  for (const [name, value] of [
    ["Océan", "ocean"],
    ["Lavande", "lavender"],
    ["Terracotta", "terracotta"],
    ["Kiwi", "kiwi"],
  ]) {
    await page.getByRole("button", { name, exact: true }).click();
    assert.equal(await page.locator("html").getAttribute("data-theme"), value);
    await capture(`theme-${value}`);
  }
  await page.getByRole("button", { name: "Océan", exact: true }).click();
  await page.reload();
  await page.getByRole("heading", { name: "Les salaires." }).waitFor();
  assert.equal(await page.locator("html").getAttribute("data-theme"), "ocean");
  await page.getByRole("button", { name: "Paramètres", exact: true }).click();
  await page
    .getByRole("tab", { name: "Cotisations et assurances", exact: true })
    .click();
  await capture("settings-desktop");
  await page.getByRole("button", { name: "Employés", exact: true }).click();
  await capture("employees-desktop");
  await page
    .getByRole("button", { name: "Récapitulatif annuel", exact: true })
    .click();
  await capture("summary-desktop");
  await page.getByRole("button", { name: "Les salaires", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await capture("mobile-annual");
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page
    .getByRole("button", { name: "Informations de l’employé", exact: true })
    .click();
  await dialog
    .getByRole("tab", { name: "Contrat et salaire", exact: true })
    .click();
  await capture("mobile-contract");
  assert.equal(
    await dialog.evaluate((el) => el.scrollWidth > el.clientWidth),
    false,
  );
  await page.keyboard.press("Escape");
  assert.deepEqual(errors, []);
  await writeFile(
    `${output}/result.json`,
    JSON.stringify(
      {
        passed: true,
        errors,
        checks: [
          "12 months",
          "global rename",
          "immutable PDFs",
          "payment preservation",
          "monthly override",
          "bonus and expenses",
          "partial payment",
          "PDF regeneration",
          "following months",
          "4 themes",
          "theme persistence",
          "settings",
          "employees",
          "annual summary",
          "desktop 1440x1050",
          "mobile 390x844",
        ],
      },
      null,
      2,
    ),
  );
  console.log("V2 UI checks passed");
} catch (e) {
  await capture("failure");
  throw e;
} finally {
  await browser.close();
}
