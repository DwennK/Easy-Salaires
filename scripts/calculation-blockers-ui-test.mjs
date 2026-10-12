// Run with: UI_URL=http://127.0.0.1:1421 pnpm exec tsx scripts/calculation-blockers-ui-test.mjs
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { demoState } from "../src/domain/demo.ts";
import {
  upgradeState,
  prepareMonth,
  refreshPayrolls,
} from "../src/domain/service.ts";

const fixture = upgradeState(demoState());
fixture.company.demo = false;
fixture.company.name = "Entreprise de test";
const employee = fixture.employees[0];
employee.firstName = "Alice";
employee.lastName = "Exemple";
employee.start = "2026-07-01";
fixture.employees = [employee];
fixture.payrolls = fixture.payrolls.filter(
  (p) => p.employeeId === employee.id && p.period.startsWith("2026"),
);
for (const terms of employee.terms) {
  terms.mode = "hourly";
  terms.salary = "26.40";
  terms.lppEmployee = null;
  terms.lppEmployer = null;
}
prepareMonth(fixture, "2026-11");
prepareMonth(fixture, "2026-12");
for (const p of fixture.payrolls) {
  const month = Number(p.period.slice(5));
  p.input.hours = month < 7 ? null : String([2, 4, 4, 6, 0, 0][month - 7]);
  p.paidDate = "";
  p.paidAmount = null;
}
refreshPayrolls(fixture);
// Reproduce the cached error saved by the previous application version.
for (const p of fixture.payrolls.filter((p) => p.period >= "2026-07"))
  p.result.errors.unshift("previousMonthsIncomplete");

const output = "output/playwright/calculation-blockers";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  locale: "fr-CH",
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(msg.text());
});
page.setDefaultTimeout(10000);
async function install(state) {
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
        open.onerror = () => reject(open.error);
      }),
    state,
  );
  await page.reload();
  await page
    .getByRole("heading", { name: "Alice Exemple", exact: true })
    .waitFor();
}
try {
  await page.goto(process.env.UI_URL || "http://127.0.0.1:1421");
  await page
    .getByRole("button", { name: "Essayer la démonstration", exact: true })
    .waitFor();
  await install(fixture);
  const july = page.locator('tr[data-period="2026-07"]');
  const cachedPrevious = page
    .locator("#payroll-blockers li")
    .filter({ hasText: "Complétez les mois précédents" });
  assert(!(await cachedPrevious.innerText()).includes("juillet"));
  const julyButton = july.getByRole("button", {
    name: "07 juillet",
    exact: true,
  });
  await julyButton.click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  assert(!(await dialog.innerText()).includes("Complétez les mois précédents"));
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  const blockers = page.locator("#payroll-blockers");
  assert((await blockers.innerText()).includes("Renseignez la LPP employé"));
  assert((await blockers.innerText()).includes("Renseignez la LPP employeur"));
  const pension = blockers
    .locator("li")
    .filter({ hasText: "Renseignez la LPP employé" });
  assert(
    (await pension.innerText()).includes(
      "juillet, août, septembre, octobre, novembre, décembre",
    ),
  );
  assert(!(await pension.innerText()).includes("janvier"));
  assert.equal(
    await july.locator("small.needs-attention").innerText(),
    "Calcul bloqué",
  );
  await blockers.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${output}/desktop.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await blockers.scrollIntoViewIfNeeded();
  assert(await blockers.isVisible());
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({ path: `${output}/mobile.png`, fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .getByRole("button", { name: "Informations de l’employé", exact: true })
    .click();
  await dialog.getByRole("tab", { name: /Assurances/i }).click();
  await dialog
    .getByLabel("LPP mensuelle employé CHF", { exact: true })
    .fill("0");
  await dialog
    .getByLabel("LPP mensuelle employeur CHF", { exact: true })
    .fill("0");
  await dialog
    .getByRole("button", { name: "Enregistrer l’employé", exact: true })
    .click();
  await dialog.waitFor({ state: "hidden" });
  await blockers.waitFor({ state: "hidden" });
  assert.notEqual(await july.locator(".net-cell").innerText(), "—");
  assert(
    await july
      .getByRole("button", { name: "Paiement juillet", exact: true })
      .isEnabled(),
  );
  await page.reload();
  await page
    .getByRole("heading", { name: "Alice Exemple", exact: true })
    .waitFor();
  assert.equal(await blockers.count(), 0);
  // A genuinely incomplete in-contract month must still block later months.
  const missingHours = structuredClone(fixture);
  for (const terms of missingHours.employees[0].terms) terms.lpp = false;
  missingHours.payrolls.find((p) => p.period === "2026-07").input.hours = null;
  await install(missingHours);
  assert((await blockers.innerText()).includes("Renseignez les heures"));
  const previous = blockers
    .locator("li")
    .filter({ hasText: "Complétez les mois précédents" });
  assert(!(await previous.innerText()).includes("juillet"));
  assert((await previous.innerText()).includes("août"));
  assert.deepEqual(errors, []);
  await writeFile(
    `${output}/result.json`,
    JSON.stringify(
      { desktop: "1440x1000", mobile: "390x844", assertions: "passed", errors },
      null,
      2,
    ),
  );
  console.log(
    "Calculation blockers UI: desktop/mobile, cached history, pension correction, reload and active-month guard passed.",
  );
} finally {
  await browser.close();
}
