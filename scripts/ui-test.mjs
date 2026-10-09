import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
await mkdir("output/qa", { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  acceptDownloads: true,
});
const page = await context.newPage(),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(process.env.UI_URL || "http://127.0.0.1:1420");
await page.screenshot({ path: "output/qa/welcome.png", fullPage: true });
await page.getByRole("button", { name: "Essayer la démonstration" }).click();
await page.getByRole("button", { name: "Salaires du mois", exact: true }).click();
await page
  .getByRole("heading", { name: "Salaires du mois", exact: true })
  .waitFor({ timeout: 60000 });
await page.screenshot({
  path: "output/qa/monthly-desktop.png",
  fullPage: true,
});
assert.equal(await page.locator("tbody tr").count(), 3);
await page.getByRole("button", { name: /Alex Morel/ }).click();
await page
  .getByLabel("Heures travaillées ce mois", { exact: true })
  .fill("160,5");
await page.getByRole("button", { name: "Ajouter un élément" }).click();
await page
  .getByRole("button", { name: "Heures supplémentaires", exact: true })
  .click();
await page
  .getByLabel("Libellé / motif", { exact: true })
  .fill("Heures supplémentaires convenues");
await page.getByLabel("Quantité", { exact: true }).fill("2");
await page.getByLabel("Majoration (%)", { exact: true }).fill("25");
await page.screenshot({ path: "output/qa/payroll-edit.png", fullPage: true });
await page
  .getByRole("button", { name: "Valider et générer le PDF", exact: true })
  .click();
await page
  .getByRole("button", { name: "Créer une fiche corrigée", exact: true })
  .waitFor({ timeout: 30000 });
assert.equal(
  (await page.locator(".pay-hero > strong").innerText()).replace(/\D/g, ""),
  "465958",
);
const pdfDownload = page.waitForEvent("download");
await page
  .locator("dialog")
  .getByRole("button", { name: "Télécharger le PDF", exact: true })
  .click();
await (await pdfDownload).saveAs("output/qa/hourly-ui.pdf");
await page
  .getByRole("button", {
    name: "Enregistrer le paiement effectué",
    exact: true,
  })
  .click();
await page
  .getByRole("button", { name: "Effacer la saisie du paiement", exact: true })
  .waitFor();
await page.getByRole("button", { name: "Fermer", exact: true }).click();
await page.reload();
await page.getByRole("button", { name: "Salaires du mois", exact: true }).click();
await page
  .getByRole("heading", { name: "Salaires du mois", exact: true })
  .waitFor();
assert.equal(await page.locator("tbody tr").count(), 3);
await page
  .getByRole("button", { name: /Récapitulatif annuel/, exact: true })
  .click();
await page.screenshot({ path: "output/qa/annual.png", fullPage: true });
const dlPromise = page.waitForEvent("download");
await page
  .getByRole("button", {
    name: "Exporter pour la comptabilité · Excel",
    exact: true,
  })
  .click();
const dl = await dlPromise;
await dl.saveAs("output/qa/annual-ui.xlsx");
await page.getByRole("button", { name: "Employés", exact: true }).click();
await page.screenshot({ path: "output/qa/employees.png", fullPage: true });
await page.getByRole("button", { name: "Ajouter un employé" }).click();
await page.getByLabel("Prénom", { exact: true }).fill("Élodie");
await page.getByLabel("Nom", { exact: true }).fill("Test-Clavier");
await page.getByLabel("Date de naissance").fill("1994-02-28");
await page.getByRole("button", { name: "Continuer", exact: true }).click();
await page
  .getByLabel("Salaire brut mensuel à ce taux d’activité (CHF)")
  .fill("3000");
await page.getByRole("button", { name: "Continuer", exact: true }).click();
await page.getByLabel("LPP mensuelle employé CHF").fill("100");
await page.getByLabel("LPP mensuelle employeur CHF").fill("100");
await page.getByRole("button", { name: "Continuer", exact: true }).click();
await page
  .getByRole("button", { name: "Enregistrer l’employé", exact: true })
  .click();
await page.getByRole("heading", { name: "Élodie Test-Clavier" }).waitFor();
await page.getByRole("button", { name: "Paramètres", exact: true }).click();
await page.getByLabel("Langue", { exact: true }).selectOption("en");
await page
  .getByRole("button", {
    name: "Enregistrer les informations de l’entreprise",
    exact: true,
  })
  .first()
  .click();
await page.getByRole("heading", { name: "Settings", exact: true }).waitFor();
await page.screenshot({ path: "output/qa/settings-en.png", fullPage: true });
await page
  .getByRole("button", { name: "Monthly payroll", exact: true })
  .click();
await page.screenshot({ path: "output/qa/monthly-en.png", fullPage: true });
await page.setViewportSize({ width: 390, height: 844 });
await page.screenshot({ path: "output/qa/monthly-mobile.png", fullPage: true });
assert.equal(
  await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
  false,
);
await page.getByRole("button", { name: /Alex Morel/ }).click();
await page.waitForTimeout(250);
assert.equal(
  (await page.locator(".pay-hero > strong").innerText()).replace(/\D/g, ""),
  "465958",
);
const drawerBounds = await page.locator("dialog").boundingBox();
assert.equal(drawerBounds.y, 0);
assert.equal(drawerBounds.height, 844);
await page.screenshot({ path: "output/qa/payroll-mobile.png" });
assert.equal(
  await page.locator("dialog").evaluate((e) => e.scrollWidth > e.clientWidth),
  false,
);
await page.keyboard.press("Escape");
assert.equal(errors.length, 0, errors.join("\n"));
await writeFile(
  "output/qa/ui-result.json",
  JSON.stringify(
    {
      desktop: "1440x1000",
      mobile: "390x844",
      errors,
      checks: [
        "demo",
        "hourly+overtime",
        "PDF issue",
        "payment",
        "reload persistence",
        "Excel download",
        "create employee",
        "language switch",
        "responsive overflow",
        "Escape dismissal",
      ],
    },
    null,
    2,
  ),
);
await browser.close();
console.log("UI flows passed, no page errors. Screenshots in output/qa.");
