import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { emptyState } from "../src/domain/service.ts";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  locale: "fr-CH",
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.setDefaultTimeout(10000);
await mkdir("output/qa/ux", { recursive: true });
async function capture(name) {
  await page.screenshot({ path: `output/qa/ux/${name}.png`, fullPage: true });
}
async function readState() {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const r = indexedDB.open("easy-salaires-preview", 1);
        r.onsuccess = () => {
          const db = r.result;
          const tx = db.transaction("demo", "readonly");
          const get = tx.objectStore("demo").get("state");
          get.onsuccess = () => resolve(get.result);
          get.onerror = () => reject(get.error);
          tx.oncomplete = () => db.close();
        };
      }),
  );
}
try {
  await page.goto(process.env.UI_URL || "http://127.0.0.1:1420");
  const fixture = emptyState();
  fixture.company.name = "Atelier Première Paie";
  await page.evaluate(
    (data) =>
      new Promise((resolve, reject) => {
        const r = indexedDB.open("easy-salaires-preview", 1);
        r.onupgradeneeded = () => r.result.createObjectStore("demo");
        r.onsuccess = () => {
          const db = r.result;
          const tx = db.transaction("demo", "readwrite");
          tx.objectStore("demo").put(data, "state");
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
    .getByRole("button", { name: "Continuer la configuration", exact: true })
    .click();
  const settings = page.locator(".settings-layout");
  await settings.getByLabel("Adresse", { exact: true }).fill("Rue du Test 1");
  await settings.getByLabel("NPA", { exact: true }).fill("2000");
  await settings.getByLabel("Localité", { exact: true }).fill("Neuchâtel");
  await settings.getByRole("tab", { name: "Entreprise", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  assert.equal(
    await settings
      .getByRole("tab", { name: "Cotisations et assurances" })
      .getAttribute("aria-selected"),
    "true",
  );
  assert.match(
    await settings.locator(".configuration-status").innerText(),
    /2 taux à renseigner/,
  );
  assert.equal(
    await settings.getByLabel("Raison sociale", { exact: true }).isVisible(),
    false,
  );
  await settings.getByRole("tab", { name: "Entreprise", exact: true }).click();
  assert.equal(
    await settings.getByLabel("Adresse", { exact: true }).inputValue(),
    "Rue du Test 1",
  );
  await page.getByRole("button", { name: "Employés", exact: true }).click();
  await page
    .getByRole("button", { name: "Continuer la saisie", exact: true })
    .click();
  assert.equal(
    await settings.getByLabel("Adresse", { exact: true }).inputValue(),
    "Rue du Test 1",
  );
  await settings
    .getByRole("button", {
      name: "Enregistrer les informations de l’entreprise",
    })
    .click();
  await page
    .getByText("Informations de l’entreprise enregistrées", { exact: true })
    .waitFor();
  await capture("01-entreprise");
  await settings
    .getByRole("tab", { name: "Cotisations et assurances" })
    .click();
  const aap = settings.getByRole("region", {
    name: "Accidents professionnels",
    exact: true,
  });
  const aanp = settings.getByRole("region", {
    name: "Accidents non professionnels",
    exact: true,
  });
  await aap.getByLabel("Payé par l’entreprise (%)", { exact: true }).fill("0");
  assert.match(
    await settings.locator(".configuration-status").innerText(),
    /1 taux à renseigner/,
  );
  await aanp
    .getByLabel("Retenu sur le salaire (%)", { exact: true })
    .fill("1,2");
  assert.match(
    await settings.locator(".configuration-status").innerText(),
    /Tous les taux actifs/,
  );
  await aap.getByText("Détails et réglages du calcul", { exact: true }).click();
  assert.equal(
    await aap.getByLabel("Calculée sur", { exact: true }).inputValue(),
    "laa",
  );
  await capture("02-cotisations");
  await settings
    .getByRole("button", { name: "Enregistrer les cotisations", exact: true })
    .click();
  await page.getByText("Cotisations enregistrées", { exact: true }).waitFor();
  // Saving either tab must preserve unsaved edits on the other tab.
  await aanp
    .getByLabel("Retenu sur le salaire (%)", { exact: true })
    .fill("1,3");
  await settings.getByRole("tab", { name: "Entreprise", exact: true }).click();
  await settings.getByLabel("Téléphone / contact").fill("032 555 00 00");
  await settings
    .getByRole("button", {
      name: "Enregistrer les informations de l’entreprise",
    })
    .click();
  await settings
    .getByRole("tab", { name: "Cotisations et assurances" })
    .click();
  assert.equal(
    await aanp
      .getByLabel("Retenu sur le salaire (%)", { exact: true })
      .inputValue(),
    "1,3",
  );
  await settings
    .getByRole("button", { name: "Enregistrer les cotisations", exact: true })
    .click();
  await page.getByText("Cotisations enregistrées", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Employés", exact: true }).click();
  await page
    .getByRole("button", { name: "Ajouter un employé", exact: true })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Continuer", exact: true }).click();
  assert.equal(await dialog.locator("input[aria-invalid=true]").count(), 3);
  await dialog.getByLabel("Prénom", { exact: true }).fill("Camille");
  await dialog.getByLabel("Nom", { exact: true }).fill("Débutant");
  await dialog
    .getByLabel("Date de naissance", { exact: true })
    .fill("1994-02-28");
  await dialog.getByLabel("Adresse", { exact: true }).fill("Rue Exemple 2");
  await dialog.getByLabel("NPA", { exact: true }).fill("2000");
  await dialog.getByLabel("Localité", { exact: true }).fill("Neuchâtel");
  await dialog
    .getByLabel("Numéro AVS", { exact: true })
    .fill("756.1234.1234.12");
  await dialog.getByRole("button", { name: "Continuer", exact: true }).click();
  assert.equal(
    await dialog
      .getByLabel("Numéro AVS", { exact: true })
      .getAttribute("aria-invalid"),
    "true",
  );
  await dialog.getByLabel("Numéro AVS", { exact: true }).fill("");
  await dialog.getByRole("button", { name: "Continuer", exact: true }).click();
  await dialog.getByLabel("Date d’entrée", { exact: true }).fill("2026-01-01");
  await dialog
    .getByLabel("Salaire brut mensuel à ce taux d’activité (CHF)", {
      exact: true,
    })
    .fill("4000");
  await dialog.getByLabel("Taux d’activité (%)", { exact: true }).fill("80");
  assert.match(
    await dialog.locator(".salary-confirmation").innerText(),
    /4000 CHF par mois.*80 %/,
  );
  await capture("03-contrat");
  await dialog.getByRole("button", { name: "Continuer", exact: true }).click();
  assert.equal(
    await dialog
      .getByLabel("LPP mensuelle employé CHF", { exact: true })
      .isVisible(),
    true,
  );
  await dialog.getByRole("button", { name: "Continuer", exact: true }).click();
  await dialog
    .getByText(
      "La prévoyance est à compléter avant de valider une fiche. Vous pouvez enregistrer cet employé maintenant.",
      { exact: true },
    )
    .waitFor();
  await dialog.getByRole("tab", { name: "Assurances", exact: true }).click();
  await dialog
    .getByLabel("LPP mensuelle employé CHF", { exact: true })
    .fill("120");
  await dialog
    .getByLabel("LPP mensuelle employeur CHF", { exact: true })
    .fill("120");
  await dialog.getByRole("button", { name: "Continuer", exact: true }).click();
  await capture("04-recapitulatif");
  await dialog
    .getByRole("button", { name: "Enregistrer l’employé", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Camille Débutant", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Continuer la configuration", exact: true })
    .click();
  await page.getByRole("button", { name: "Salaires du mois", exact: true }).click();
  await page.getByLabel("Mois", { exact: true }).selectOption("1");
  await page
    .getByRole("button", { name: "Préparer les fiches du mois", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Vérifier la fiche", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Valider et générer le PDF", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Créer une fiche corrigée", exact: true })
    .waitFor();
  assert.equal((await readState()).revisions.length, 1);
  await dialog
    .getByRole("button", {
      name: "Enregistrer le paiement effectué",
      exact: true,
    })
    .click();
  await dialog
    .getByRole("button", { name: "Effacer la saisie du paiement", exact: true })
    .waitFor();
  await dialog
    .getByRole("button", { name: "Créer une fiche corrigée", exact: true })
    .click();
  await dialog.getByRole("button", { name: "Annuler", exact: true }).click();
  assert.equal((await readState()).revisions.length, 1);
  await dialog.getByRole("button", { name: "Fermer", exact: true }).click();
  assert.equal(await page.locator(".setup-guide").count(), 0);
  await capture("05-mois");
  await page.getByRole("button", { name: "Paramètres", exact: true }).click();
  await settings
    .getByRole("tab", { name: "Cotisations et assurances" })
    .click();
  await settings
    .getByRole("button", { name: "Configurer l’année suivante" })
    .click();
  await settings
    .getByRole("button", { name: "Enregistrer les cotisations", exact: true })
    .click();
  await page
    .getByText(
      "Configuration enregistrée. Complétez et vérifiez les informations manquantes avant de valider des fiches.",
      { exact: true },
    )
    .waitFor();
  const data = await readState();
  assert.equal(data.rules.at(-1).year, 2027);
  assert.equal(data.rules.at(-1).verified, false);
  assert.equal(data.revisions.length, 1);
  // Draft settings survive reload and never imply verification.
  await page.reload();
  await page.getByRole("button", { name: "Paramètres", exact: true }).click();
  await settings
    .getByRole("tab", { name: "Cotisations et assurances" })
    .click();
  await settings
    .getByText("Année à vérifier avant de générer des fiches", { exact: true })
    .waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await capture("06-cotisations-mobile");
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.getByRole("button", { name: "Employés", exact: true }).click();
  await page.getByRole("button", { name: "Modifier", exact: true }).click();
  await dialog.getByRole("tab", { name: "Assurances", exact: true }).click();
  await capture("07-employe-mobile");
  assert.equal(
    await dialog.evaluate((el) => el.scrollWidth > el.clientWidth),
    false,
  );
  await page.keyboard.press("Escape");
  assert.equal(errors.length, 0, errors.join("\n"));
  await writeFile(
    "output/qa/ux/result.json",
    JSON.stringify(
      {
        passed: true,
        checks: [
          "first-time setup",
          "keyboard tabs",
          "unsaved protection",
          "cross-tab drafts",
          "zero vs missing rates",
          "employee validation and inline errors",
          "salary confirmation",
          "visible pension",
          "first payslip issuance",
          "payment",
          "correction cancellation",
          "year draft persistence",
          "immutable prior PDF",
          "desktop 1440x1000",
          "mobile 390x844",
        ],
        errors,
      },
      null,
      2,
    ),
  );
  console.log("Guided UX flow passed.");
} catch (e) {
  await capture("failure");
  throw e;
} finally {
  await browser.close();
}
