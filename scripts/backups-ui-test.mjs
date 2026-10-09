import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

const output = "output/playwright/backups";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const errors = [];
async function session(
  native = true,
  viewport = { width: 1440, height: 1000 },
) {
  const context = await browser.newContext({ viewport, locale: "fr-CH" });
  if (native)
    await context.addInitScript(() => {
      window.isTauri = true;
      window.__backupTest = {
        calls: [],
        last: null,
        cancel: false,
        fail: false,
        statusError: false,
      };
      window.__TAURI_INTERNALS__ = {
        transformCallback: () => 1,
        unregisterCallback: () => {},
        invoke: async (cmd, args = {}) => {
          if (cmd === "plugin:app|version") return "0.1.0";
          if (cmd === "plugin:updater|check") return null;
          if (cmd === "plugin:resources|close") return;
          if (cmd !== "native") throw Error(`Unexpected command: ${cmd}`);
          const t = window.__backupTest;
          t.calls.push(args.action);
          if (args.action === "startup") {
            const { demoState } = await import("/src/domain/demo.ts");
            t.state = demoState();
            return {
              state: t.state,
              path: "/test/entreprise.db",
              config: { recent: [], backupDir: "" },
            };
          }
          if (args.action === "save") {
            t.state = args.payload;
            return args.payload.version + 1;
          }
          if (args.action === "backupStatus") {
            if (t.statusError) throw Error("status failed");
            return t.last;
          }
          if (args.action === "backup") {
            if (t.fail) throw Error("backup failed");
            if (t.cancel) return null;
            t.last = {
              date: "2026-10-09T08:30:00Z",
              path: "/test/external/sauvegarde.db",
            };
            return t.last.path;
          }
          if (args.action === "backupFolder")
            return t.cancel
              ? null
              : { backupDir: "/test/automatic/company-backups" };
          if (args.action === "restore" || args.action === "open") {
            if (t.cancel) return null;
            t.last = null;
            return {
              state: {
                ...t.state,
                company: { ...t.state.company, name: "Entreprise restaurée" },
              },
              path: "/test/restored.db",
            };
          }
          if (args.action === "close") return null;
          throw Error(`Unexpected action: ${args.action}`);
        },
      };
    });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto(process.env.UI_URL || "http://127.0.0.1:1420");
  if (!native)
    await page
      .getByRole("button", { name: /Essayer la démonstration/ })
      .click();
  await page.getByRole("heading", { name: "Les salaires." }).waitFor();
  return { page, context };
}
async function backups(page) {
  await page.getByRole("button", { name: "Sauvegardes", exact: true }).click();
  await page.getByRole("heading", { name: "Sauvegarder maintenant" }).waitFor();
  assert.equal(
    await page
      .getByRole("tab", { name: "Sauvegardes" })
      .getAttribute("aria-selected"),
    "true",
  );
  assert.equal(await page.getByRole("dialog").count(), 0);
}
async function fits(page) {
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "No horizontal page overflow",
  );
}
async function shot(page, name) {
  await page.screenshot({
    path: `${output}/${name}.png`,
    fullPage: true,
    animations: "disabled",
  });
}
try {
  const { page, context } = await session();
  await backups(page);
  await page.getByText("Aucune pour le moment", { exact: true }).waitFor();
  assert.equal(
    await page.locator(".backup-details").getAttribute("open"),
    null,
  );
  await fits(page);
  await shot(page, "desktop");
  await page
    .getByRole("button", { name: "Créer une sauvegarde", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "Sauvegarde créée" })
    .waitFor();
  await page
    .locator(".backup-last")
    .filter({ hasText: "09.10.2026" })
    .waitFor();
  await page.getByText("Détails du fichier", { exact: true }).click();
  await page
    .getByText("/test/external/sauvegarde.db", { exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Modifier le dossier" }).click();
  await page
    .getByText("/test/automatic/company-backups", { exact: true })
    .waitFor();
  await page.evaluate(() => {
    window.__backupTest.cancel = true;
  });
  await page.getByRole("button", { name: "Choisir une sauvegarde" }).click();
  await page.getByRole("heading", { name: "Sauvegarder maintenant" }).waitFor();
  await page
    .getByRole("button", { name: "Créer une sauvegarde", exact: true })
    .click();
  assert.equal(
    await page.getByText("Aucune pour le moment", { exact: true }).count(),
    0,
  );
  await page.evaluate(() => {
    window.__backupTest.cancel = false;
    window.__backupTest.fail = true;
  });
  await page
    .getByRole("button", { name: "Créer une sauvegarde", exact: true })
    .click();
  await page.getByText(/backup failed/).waitFor();
  await page.getByRole("button", { name: "Fermer", exact: true }).click();
  await page.evaluate(() => {
    window.__backupTest.fail = false;
  });

  await page.getByRole("tab", { name: "Entreprise", exact: true }).click();
  const companyName = page.getByLabel("Raison sociale", { exact: true });
  const originalName = await companyName.inputValue();
  await companyName.fill("Brouillon conservé");
  await backups(page);
  assert(
    await page
      .getByRole("button", { name: "Créer une sauvegarde", exact: true })
      .isDisabled(),
  );
  await page.getByRole("button", { name: "Choisir une sauvegarde" }).click();
  await page
    .getByRole("button", { name: "Continuer la saisie", exact: true })
    .click();
  await page.getByRole("tab", { name: "Entreprise", exact: true }).click();
  assert.equal(await companyName.inputValue(), "Brouillon conservé");
  await page.locator(".topbar-company").click();
  await page
    .getByRole("button", { name: "Changer d’entreprise", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Continuer la saisie", exact: true })
    .click();
  assert.equal(await companyName.inputValue(), "Brouillon conservé");
  await companyName.fill(originalName);
  await backups(page);
  await page.getByRole("button", { name: "Choisir une sauvegarde" }).click();
  await page.getByRole("heading", { name: "Les salaires." }).waitFor();
  await backups(page);
  await page.getByText("Aucune pour le moment", { exact: true }).waitFor();
  await page.getByText("Détails du fichier", { exact: true }).click();
  await page.getByText("/test/restored.db", { exact: true }).waitFor();
  await page.evaluate(() => {
    window.__backupTest.statusError = true;
  });
  await page.getByRole("tab", { name: "Entreprise", exact: true }).click();
  await page.getByRole("tab", { name: "Sauvegardes" }).click();
  await page.getByText("Statut indisponible", { exact: true }).waitFor();
  await context.close();

  const mobile = await session(true, { width: 390, height: 844 });
  await mobile.page
    .getByRole("button", { name: "Paramètres", exact: true })
    .click();
  await mobile.page.getByRole("tab", { name: "Sauvegardes" }).click();
  await fits(mobile.page);
  await shot(mobile.page, "mobile");
  await mobile.page.locator(".topbar-company").click();
  await mobile.page
    .getByRole("button", { name: "Ouvrir une entreprise", exact: true })
    .waitFor();
  await fits(mobile.page);
  await shot(mobile.page, "mobile-company-menu");
  await mobile.page
    .getByRole("button", { name: "Changer d’entreprise", exact: true })
    .click();
  await mobile.page
    .getByRole("button", { name: /Essayer la démonstration/ })
    .waitFor();
  assert(
    (await mobile.page.evaluate(() => window.__backupTest.calls)).includes(
      "close",
    ),
  );
  await mobile.context.close();

  const web = await session(false);
  await backups(web.page);
  await web.page
    .getByText("Les sauvegardes sont disponibles dans l’application desktop.", {
      exact: true,
    })
    .waitFor();
  for (const name of [
    "Créer une sauvegarde",
    "Modifier le dossier",
    "Choisir une sauvegarde",
  ]) {
    assert(
      await web.page.getByRole("button", { name, exact: true }).isDisabled(),
    );
  }
  await shot(web.page, "web");
  await web.context.close();
  assert.deepEqual(errors, []);
  await writeFile(
    `${output}/result.json`,
    JSON.stringify(
      {
        desktop: "1440x1000",
        mobile: "390x844",
        native: "Mocked IPC; no real file writes",
        checks: [
          "settings and shortcut",
          "backup status and refresh",
          "folder selection",
          "cancel and error",
          "preserve dirty forms",
          "restore and switch protection",
          "new company backup status",
          "status error",
          "mobile company menu",
          "web disabled actions",
        ],
        errors,
      },
      null,
      2,
    ),
  );
  console.log(
    "Backups UI passed: desktop/mobile/web, navigation, native IPC mocks, dirty forms, cancel and error handling.",
  );
} finally {
  await browser.close();
}
