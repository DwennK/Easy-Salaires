// Run with: UI_URL=http://127.0.0.1:1422 pnpm exec tsx scripts/payroll-correction-links-ui-test.mjs
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

const output = "output/playwright/payroll-correction-links";
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
  await page.goto(process.env.UI_URL || "http://127.0.0.1:1422");
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
  await page.screenshot({
    animations: "disabled",
    path: `${output}/desktop.png`,
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await blockers.scrollIntoViewIfNeeded();
  assert(await blockers.isVisible());
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({
    animations: "disabled",
    path: `${output}/mobile.png`,
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  async function focused(field) {
    await page.waitForFunction(
      (field) =>
        document.activeElement
          ?.closest("[data-correction]")
          ?.getAttribute("data-correction") === field,
      field,
    );
  }
  // Both links select the correct insurance field, including the employer share.
  await blockers
    .locator("li")
    .filter({ hasText: "Renseignez la LPP employeur" })
    .getByRole("button", { name: "Compléter ici →", exact: true })
    .click();
  await focused("lppEmployer");
  assert.equal(
    await dialog
      .getByRole("tab", { name: /Assurances/i })
      .getAttribute("aria-selected"),
    "true",
  );
  await page.screenshot({
    animations: "disabled",
    path: `${output}/employee-insurance.png`,
  });
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  await pension
    .getByRole("button", { name: "Compléter ici →", exact: true })
    .click();
  await focused("lppEmployee");
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
  await previous
    .getByRole("button", { name: "Compléter ici →", exact: true })
    .click();
  await focused("hours");
  assert.match(
    await dialog.locator(".drawer-subtitle").innerText(),
    /juillet\s+2026/i,
  );
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  // A monthly override must open that month, not the employee default.
  const overridden = structuredClone(fixture);
  for (const terms of overridden.employees[0].terms) {
    terms.lppEmployee = "0";
    terms.lppEmployer = "0";
  }
  const monthly = overridden.payrolls.find((p) => p.period === "2026-07");
  monthly.termOverrides = { lppEmployee: null };
  refreshPayrolls(overridden);
  await install(overridden);
  await blockers
    .locator("li")
    .filter({ hasText: "Renseignez la LPP employé" })
    .getByRole("button", { name: "Compléter ici →", exact: true })
    .click();
  await focused("lppEmployee");
  assert(await dialog.locator(".payroll-advanced").isVisible());
  await page.screenshot({
    animations: "disabled",
    path: `${output}/month-override.png`,
  });
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  // Mobile correction links also open and focus their destination.
  await install(fixture);
  await page.setViewportSize({ width: 390, height: 844 });
  await pension
    .getByRole("button", { name: "Compléter ici →", exact: true })
    .click();
  await focused("lppEmployee");
  await page.screenshot({
    animations: "disabled",
    path: `${output}/mobile-insurance.png`,
  });
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  // Shared insurance rates go to the correct contribution and year.
  const rates = structuredClone(fixture);
  for (const terms of rates.employees[0].terms) terms.lpp = false;
  for (const rules of rates.rules.filter((r) => r.year === 2026)) {
    rules.contributions.find((c) => c.id === "aap").employer = null;
  }
  refreshPayrolls(rates);
  await install(rates);
  await blockers
    .locator("li")
    .filter({ hasText: "Part employeur" })
    .getByRole("button", { name: "Compléter ici →", exact: true })
    .click();
  await focused("contribution:aap:employer");
  assert.equal(
    await page
      .getByRole("combobox", { name: "Année", exact: true })
      .inputValue(),
    "2026",
  );
  await page.screenshot({
    animations: "disabled",
    path: `${output}/insurance-rate.png`,
  });
  await install(rates);
  await julyButton.click();
  const hoursField = dialog.getByLabel("Heures travaillées ce mois", {
    exact: true,
  });
  await hoursField.fill("3");
  const rateLink = dialog
    .locator(".notice.error li")
    .filter({ hasText: "Part employeur" })
    .getByRole("button", { name: "Compléter ici →", exact: true });
  await rateLink.click();
  await dialog
    .getByRole("button", { name: "Continuer la saisie", exact: true })
    .click();
  assert.equal(await hoursField.inputValue(), "3");
  await rateLink.click();
  await dialog
    .getByRole("button", { name: "Quitter sans enregistrer", exact: true })
    .click();
  await focused("contribution:aap:employer");
  // Reveal nested fields and focus the failing element, not the first valid one.
  const extras = structuredClone(missingHours);
  const extrasJuly = extras.payrolls.find((p) => p.period === "2026-07");
  extrasJuly.input.hours = "2";
  extrasJuly.input.elements = [
    {
      id: "valid",
      kind: "adjustment",
      label: "Bonus",
      quantity: "1",
      unit: "hours",
      rate: "0",
      premium: "0",
      amount: "10",
      paid: true,
      avs: true,
      laa: true,
      thirteen: false,
    },
    {
      id: "invalid",
      kind: "adjustment",
      label: "",
      quantity: "1",
      unit: "hours",
      rate: "0",
      premium: "0",
      amount: "10",
      paid: true,
      avs: true,
      laa: true,
      thirteen: false,
    },
  ];
  refreshPayrolls(extras);
  await install(extras);
  await blockers
    .locator("li")
    .filter({ hasText: "motif" })
    .getByRole("button", { name: "Compléter ici →", exact: true })
    .click();
  await focused("element:invalid:label");
  await dialog
    .getByLabel("Libellé / motif", { exact: true })
    .nth(1)
    .fill("Correction");
  await page.keyboard.press("Escape");
  await dialog
    .getByRole("button", { name: "Quitter sans enregistrer", exact: true })
    .click();
  await dialog.waitFor({ state: "hidden" });
  // Forecast navigation must not record months; saving the correction must work.
  const forecast = structuredClone(missingHours);
  forecast.payrolls = [];
  forecast.revisions = [];
  await install(forecast);
  await blockers
    .locator("li")
    .filter({ hasText: "Renseignez les heures" })
    .getByRole("button", { name: "Compléter ici →", exact: true })
    .click();
  await focused("hours");
  await dialog
    .getByLabel("Heures travaillées ce mois", { exact: true })
    .fill("2");
  await dialog
    .getByRole("button", { name: "Enregistrer", exact: true })
    .click();
  await dialog.waitFor({ state: "hidden" });
  await page.reload();
  await page
    .getByRole("heading", { name: "Alice Exemple", exact: true })
    .waitFor();
  assert.equal(
    await july
      .getByRole("textbox", {
        name: "Heures travaillées ce mois juillet",
        exact: true,
      })
      .inputValue(),
    "2",
  );
  // No stale target when returning to ordinary employee editing.
  await page.reload();
  await page
    .getByRole("button", { name: "Informations de l’employé", exact: true })
    .click();
  assert.equal(
    await dialog
      .getByRole("tab", { name: /Identité/i })
      .getAttribute("aria-selected"),
    "true",
  );
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  // Unknown year opens that year in settings, without saving a new ruleset.
  await page
    .getByRole("spinbutton", { name: "Année", exact: true })
    .fill("2028");
  await page
    .getByRole("spinbutton", { name: "Année", exact: true })
    .press("Tab");
  await blockers
    .getByRole("button", { name: "Compléter ici →", exact: true })
    .click();
  assert.equal(
    await page
      .getByRole("combobox", { name: "Année", exact: true })
      .inputValue(),
    "2028",
  );
  await focused("yearVerification");
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
    "Payroll correction links: desktop/mobile, pension shares, previous month, monthly overrides, contribution rate and target year passed.",
  );
} finally {
  await browser.close();
}
