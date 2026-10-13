// UI_URL=http://127.0.0.1:1422 pnpm exec tsx scripts/small-salary-ui-test.mjs
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { employeeDefaults, preset2026 } from "../src/domain/defaults.ts";
import {
  emptyState,
  prepareMonth,
  refreshPayrolls,
  upgradeState,
} from "../src/domain/service.ts";
import { payslipPdf } from "../src/lib/documents.ts";

const fixture = upgradeState(emptyState());
Object.assign(fixture.company, {
  name: "Cabinet de test",
  address: "Rue Exemple 1",
  postal: "2000",
  city: "Neuchâtel",
});
const employee = employeeDefaults();
Object.assign(employee, {
  firstName: "Alice",
  lastName: "Exemple",
  birthDate: "1994-01-01",
  start: "2026-01-01",
  end: "2026-03-31",
  address: "Rue Exemple 2",
  postal: "2000",
  city: "Neuchâtel",
});
Object.assign(employee.terms[0], {
  effective: "2026-01",
  salary: "1250",
  lpp: false,
});
fixture.employees = [employee];
fixture.rules = [preset2026()];
fixture.rules[0].contributions.find((c) => c.id === "aap").employer = "1";
fixture.rules[0].contributions.find((c) => c.id === "aanp").employee = "1";
for (const month of ["2026-01", "2026-02", "2026-03"])
  prepareMonth(fixture, month);
refreshPayrolls(fixture);
const output = "output/playwright/small-salary";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  locale: "fr-CH",
});
page.setDefaultTimeout(12000);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
async function state() {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open("easy-salaires-preview", 1);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction("demo", "readonly");
          const q = tx.objectStore("demo").get("state");
          q.onsuccess = () => resolve(q.result);
          q.onerror = () => reject(q.error);
          tx.oncomplete = () => db.close();
        };
      }),
  );
}
async function edit() {
  await page
    .getByRole("button", { name: "Informations de l’employé", exact: true })
    .click();
  await page.getByRole("tab", { name: "Assurances", exact: true }).click();
}
async function save() {
  await page
    .getByRole("button", { name: "Enregistrer l’employé", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
}
try {
  await page.goto(process.env.UI_URL || "http://127.0.0.1:1422");
  await page
    .getByRole("button", { name: "Essayer la démonstration", exact: true })
    .waitFor();
  await page.evaluate(
    (state) =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open("easy-salaires-preview", 1);
        open.onupgradeneeded = () => open.result.createObjectStore("demo");
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction("demo", "readwrite");
          tx.objectStore("demo").put(state, "state");
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    fixture,
  );
  await page.reload();
  await page
    .getByRole("heading", { name: "Alice Exemple", exact: true })
    .waitFor();
  await edit();
  await page
    .getByLabel("Suivre automatiquement le seuil annuel", { exact: true })
    .check();
  await page
    .getByLabel("Lieu / type d’activité", { exact: true })
    .selectOption("ordinary");
  await page
    .getByLabel("L’employé demande à cotiser même sous le seuil", {
      exact: true,
    })
    .uncheck();
  await page.screenshot({ path: `${output}/desktop.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${output}/mobile.png`, fullPage: true });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await save();
  await page.reload();
  await page
    .getByRole("heading", { name: "Alice Exemple", exact: true })
    .waitFor();
  let current = await state();
  assert.equal(current.payrolls[0].result.avsBase, 0);
  assert.equal(current.payrolls[1].result.avsBase, 0);
  assert.equal(current.payrolls[2].result.avsBase, 375000);
  assert.equal(current.payrolls[2].result.smallSalary.catchUp, 250000);
  const load = async (path) => new Uint8Array(await readFile(`public${path}`));
  for (const [name, p] of [
    ["exempt", current.payrolls[0]],
    ["catch-up", current.payrolls[2]],
  ])
    await writeFile(
      `${output}/${name}.pdf`,
      await payslipPdf(p, 1, "fr", load),
    );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .locator('tr[data-period="2026-03"]')
    .getByRole("button", { name: "03 mars", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByText("Seuil annuel dépassé", { exact: false })
    .waitFor();
  await page.screenshot({
    path: `${output}/catch-up-desktop.png`,
    fullPage: true,
    animations: "disabled",
  });
  await page.keyboard.press("Escape");
  await edit();
  await page
    .getByLabel("L’employé demande à cotiser même sous le seuil", {
      exact: true,
    })
    .check();
  await save();
  current = await state();
  assert(current.payrolls.every((p) => p.result.avsBase === 125000));
  await edit();
  await page
    .getByLabel("L’employé demande à cotiser même sous le seuil", {
      exact: true,
    })
    .uncheck();
  await page
    .getByLabel("Lieu / type d’activité", { exact: true })
    .selectOption("domestic");
  await save();
  current = await state();
  assert(current.payrolls.every((p) => p.result.avsBase === 125000));
  assert.deepEqual(errors, []);
  await writeFile(
    `${output}/report.json`,
    JSON.stringify(
      {
        passed: true,
        errors,
        checks: [
          "desktop 1440x1000",
          "mobile 390x844",
          "save/reload",
          "threshold exactly 2500",
          "catch-up",
          "employee request",
          "domestic exclusion",
          "PDF generation",
        ],
      },
      null,
      2,
    ),
  );
  console.log("Small salary UI checks passed.");
} finally {
  await browser.close();
}
