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
page.setDefaultTimeout(12000);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const output = "output/playwright/payroll-easy";
await mkdir(output, { recursive: true });
const dialog = () => page.getByRole("dialog");
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
async function save() {
  await dialog()
    .getByRole("button", { name: "Enregistrer", exact: true })
    .click();
  await dialog().waitFor({ state: "hidden" });
}
async function openPerson(name) {
  await page
    .locator(".month-table .person-cell")
    .filter({ hasText: name })
    .click();
}
try {
  await page.goto(process.env.UI_URL || "http://127.0.0.1:1420");
  await page
    .getByRole("button", { name: "Essayer la démonstration", exact: true })
    .click();
  await page.getByRole("heading", { name: "Les salaires." }).waitFor();
  await page.getByRole("button", { name: "Kiwi", exact: true }).click();
  await page
    .getByRole("button", { name: "Salaires du mois", exact: true })
    .click();
  await page.getByLabel("Année", { exact: true }).selectOption("2026");
  await page.getByLabel("Mois", { exact: true }).selectOption("10");
  const first = await state();
  const alex = first.employees.find((e) => e.firstName === "Alex").id;
  const camille = first.employees.find((e) => e.firstName === "Camille").id;
  const find = (s, employeeId, period = "2026-10") =>
    s.payrolls.find((p) => p.employeeId === employeeId && p.period === period);
  await openPerson("Alex Morel");
  assert.equal(
    await dialog()
      .getByRole("button", { name: "Créer une fiche corrigée", exact: true })
      .count(),
    0,
  );
  await dialog()
    .getByLabel("Heures travaillées ce mois", { exact: true })
    .fill("12");
  await save();
  let s = await state();
  assert.equal(find(s, alex).issued, true);
  assert.equal(find(s, alex).input.hours, "12");
  assert.equal(s.revisions.length, first.revisions.length + 1);
  const afterInitial = s;
  await openPerson("Alex Morel");
  assert.equal(
    await dialog()
      .getByLabel("Heures travaillées ce mois", { exact: true })
      .inputValue(),
    "12",
  );
  assert(
    await dialog()
      .getByRole("button", { name: "Enregistrer", exact: true })
      .isDisabled(),
  );
  assert.equal(
    await dialog().locator(".payroll-history").getAttribute("open"),
    null,
  );
  await dialog()
    .getByLabel("Heures travaillées ce mois", { exact: true })
    .fill("14");
  await page.mouse.move(650, 160);
  await page.screenshot({
    path: `${output}/01-direct-edit-desktop.png`,
    fullPage: true,
    animations: "disabled",
  });
  await save();
  s = await state();
  assert.equal(find(s, alex).issued, true);
  assert.equal(find(s, alex).input.hours, "14");
  assert.equal(s.revisions.length, afterInitial.revisions.length + 1);
  assert.deepEqual(
    s.revisions.slice(0, afterInitial.revisions.length),
    afterInitial.revisions,
  );
  // Payment and salary changes are saved together; the recorded payment is never silently replaced.
  await openPerson("Alex Morel");
  await dialog().getByLabel("Paiement effectué", { exact: true }).check();
  await dialog().getByLabel("Montant payé", { exact: true }).fill("100");
  await dialog()
    .getByLabel("Date du paiement", { exact: true })
    .fill("2026-10-09");
  await save();
  s = await state();
  assert.equal(find(s, alex).paidAmount, 10000);
  assert.equal(find(s, alex).paidDate, "2026-10-09");
  assert.equal(s.revisions.length, afterInitial.revisions.length + 1);
  await openPerson("Alex Morel");
  await dialog()
    .getByLabel("Heures travaillées ce mois", { exact: true })
    .fill("15");
  assert.match(
    await dialog().locator(".payroll-payment").innerText(),
    /Reste à payer/,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: `${output}/02-direct-edit-mobile.png`,
    fullPage: true,
    animations: "disabled",
  });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await save();
  s = await state();
  assert.equal(find(s, alex).paidAmount, 10000);
  assert.equal(find(s, alex).paidDate, "2026-10-09");
  assert.equal(find(s, alex).paymentReview, true);
  assert.equal(find(s, alex).issued, true);
  await page.setViewportSize({ width: 1440, height: 900 });
  // Incomplete edits can still be saved, but never get marked as a valid PDF.
  await openPerson("Alex Morel");
  await dialog()
    .getByLabel("Heures travaillées ce mois", { exact: true })
    .fill("");
  const revisionCount = s.revisions.length;
  await save();
  s = await state();
  assert.equal(find(s, alex).issued, false);
  assert(find(s, alex).result.errors.includes("hoursRequired"));
  assert.equal(s.revisions.length, revisionCount);
  assert.equal(find(s, alex).paidAmount, 10000);
  // Simultaneous salary + payment edits are committed together.
  await openPerson("Camille Favre");
  await dialog()
    .getByLabel("Salaire brut de ce mois (CHF)", { exact: true })
    .fill("5500");
  await dialog().getByLabel("Paiement effectué", { exact: true }).check();
  await dialog().getByLabel("Montant payé", { exact: true }).fill("4000");
  await dialog()
    .getByLabel("Date du paiement", { exact: true })
    .fill("2026-10-09");
  await save();
  s = await state();
  assert.equal(find(s, camille).terms.salary, "5500");
  assert.equal(find(s, camille).paidAmount, 400000);
  assert.equal(find(s, camille).issued, true);
  assert.deepEqual(
    s.revisions.slice(0, first.revisions.length),
    first.revisions,
  );
  // Cancelling a payment edit triggers the same unsaved changes guard as salary edits.
  await openPerson("Camille Favre");
  await dialog().getByLabel("Montant payé", { exact: true }).fill("4200");
  await dialog().getByRole("button", { name: "Fermer", exact: true }).click();
  await dialog()
    .getByRole("button", { name: "Continuer la saisie", exact: true })
    .waitFor();
  await dialog()
    .getByRole("button", { name: "Quitter sans enregistrer", exact: true })
    .click();
  assert.equal(find(await state(), camille).paidAmount, 400000);
  // Clearing a recorded payment is still available through the same single Save.
  await openPerson("Camille Favre");
  await dialog().getByLabel("Paiement effectué", { exact: true }).uncheck();
  await save();
  s = await state();
  assert.equal(find(s, camille).paidAmount, null);
  assert.equal(find(s, camille).paidDate, "");
  // Earlier paid periods can be edited directly, with subsequent amounts recalculated.
  await page.getByLabel("Mois", { exact: true }).selectOption("1");
  await openPerson("Camille Favre");
  const paidJanuary = find(s, camille, "2026-01").paidAmount;
  await dialog()
    .getByLabel("Salaire brut de ce mois (CHF)", { exact: true })
    .fill("5800");
  await save();
  s = await state();
  assert.equal(find(s, camille, "2026-01").paidAmount, paidJanuary);
  assert.equal(find(s, camille, "2026-01").issued, true);
  assert.equal(find(s, camille, "2026-01").paymentReview, true);
  assert.equal(
    s.payrolls.filter((p) => p.employeeId === camille && p.period === "2026-01")
      .length,
    1,
  );
  await page.reload();
  await page.getByRole("heading", { name: "Les salaires." }).waitFor();
  const reloaded = await state();
  assert.equal(find(reloaded, camille, "2026-01").terms.salary, "5800");
  assert.deepEqual(reloaded.revisions, s.revisions);
  assert.deepEqual(errors, []);
  await writeFile(
    `${output}/report.json`,
    JSON.stringify(
      {
        result: "passed",
        errors,
        checks: [
          "direct editing of issued payslip",
          "single save with automatic PDF",
          "no-op and payment-only do not duplicate PDF",
          "historical documents preserved",
          "payment remains unchanged when editing salary",
          "incomplete draft save",
          "atomic salary and payment save",
          "unsaved payment guard",
          "clear payment",
          "past paid month edit",
          "persistence after reload",
          "desktop and mobile",
        ],
      },
      null,
      2,
    ),
  );
  console.log("Easy payroll editor UI checks passed");
} finally {
  await browser.close();
}
