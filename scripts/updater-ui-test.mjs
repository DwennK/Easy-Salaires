import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const output = "output/playwright/updater";
await mkdir(output, { recursive: true });
const errors = [];
async function session(
  mode = "available",
  viewport = { width: 1440, height: 1000 },
) {
  const context = await browser.newContext({ viewport, locale: "fr-CH" });
  await context.addInitScript(
    ({ mode }) => {
      window.isTauri = true;
      window.__updateTest = { mode, calls: [], restart: 0, backups: 0 };
      window.__TAURI_INTERNALS__ = {
        transformCallback: () => 1,
        unregisterCallback: () => {},
        invoke: async (cmd, args = {}) => {
          const t = window.__updateTest;
          t.calls.push(cmd);
          if (cmd === "plugin:app|version") return "0.1.0";
          if (cmd === "plugin:resources|close") return;
          if (cmd === "plugin:updater|check") {
            if (t.mode === "offline") throw new Error("offline");
            if (t.mode === "current") return null;
            return {
              rid: 1,
              currentVersion: "0.1.0",
              version: "0.1.1",
              body: "Améliorations de la paie et corrections.",
              rawJson: {},
            };
          }
          if (cmd === "plugin:updater|download_and_install") {
            args.onEvent.onmessage({
              event: "Started",
              data: { contentLength: 100 },
            });
            args.onEvent.onmessage({
              event: "Progress",
              data: { chunkLength: 45 },
            });
            await new Promise((resolve) => setTimeout(resolve, 500));
            if (t.mode === "failure") throw new Error("signature mismatch");
            args.onEvent.onmessage({
              event: "Progress",
              data: { chunkLength: 55 },
            });
            args.onEvent.onmessage({ event: "Finished" });
            return;
          }
          if (cmd === "plugin:process|restart") {
            t.restart++;
            return;
          }
          if (cmd === "native") {
            if (args.action === "startup") {
              const { demoState } = await import("/src/domain/demo.ts");
              return {
                state: demoState(),
                path: "demo.db",
                config: { recent: [], backupDir: "" },
              };
            }
            if (args.action === "prepareUpdate") {
              t.backups++;
              return;
            }
            if (args.action === "backupStatus") return null;
            if (args.action === "save") return args.payload.version + 1;
          }
          throw new Error(`Unexpected IPC: ${cmd} ${args.action ?? ""}`);
        },
      };
    },
    { mode },
  );
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(process.env.UI_URL || "http://127.0.0.1:1420");
  await page.getByRole("heading", { name: "Les salaires." }).waitFor();
  return { page, context };
}
try {
  const { page, context } = await session();
  await page.getByRole("button", { name: /Mise à jour disponible/ }).waitFor();
  await page.screenshot({
    path: `${output}/desktop-available.png`,
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: /Mise à jour disponible/ }).click();
  await page
    .getByRole("heading", { name: "Mises à jour", exact: true })
    .waitFor();
  await page.screenshot({
    path: `${output}/dialog-available.png`,
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Installer et redémarrer" }).click();
  await page.getByRole("progressbar").waitFor();
  await page.waitForFunction(() => window.__updateTest.restart === 1);
  assert.equal(await page.evaluate(() => window.__updateTest.backups), 1);
  await context.close();

  const dirty = await session();
  await dirty.page
    .getByRole("button", { name: "Paramètres", exact: true })
    .click();
  const name = dirty.page.getByLabel("Raison sociale", { exact: true });
  await name.fill("Modification non enregistrée");
  await dirty.page
    .getByRole("button", { name: /Mise à jour disponible/ })
    .click();
  assert(
    await dirty.page
      .getByRole("button", { name: "Installer et redémarrer" })
      .isDisabled(),
  );
  await dirty.page
    .getByText(/Enregistrez vos modifications et attendez/)
    .waitFor();
  assert.equal(await dirty.page.evaluate(() => window.__updateTest.backups), 0);
  await dirty.context.close();

  const offline = await session("offline");
  await offline.page
    .getByRole("button", { name: /Vérification indisponible/ })
    .click();
  await offline.page.getByText(/Impossible de joindre GitHub/).waitFor();
  await offline.page.evaluate(() => {
    window.__updateTest.mode = "current";
  });
  await offline.page
    .getByRole("button", { name: "Vérifier les mises à jour", exact: true })
    .click();
  await offline.page
    .getByRole("dialog")
    .getByText("L’application est à jour", { exact: true })
    .waitFor();
  await offline.context.close();

  const failure = await session("failure");
  await failure.page
    .getByRole("button", { name: /Mise à jour disponible/ })
    .click();
  await failure.page
    .getByRole("button", { name: "Installer et redémarrer" })
    .click();
  await failure.page
    .getByText(/La sauvegarde ou l’installation a échoué/)
    .waitFor();
  assert.equal(
    await failure.page.evaluate(() => window.__updateTest.restart),
    0,
  );
  await failure.context.close();

  const mobile = await session("available", { width: 390, height: 844 });
  await mobile.page
    .getByRole("button", { name: /Mise à jour disponible/ })
    .click();
  await mobile.page
    .getByRole("heading", { name: "Mises à jour", exact: true })
    .waitFor();
  assert(
    await mobile.page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await mobile.page.screenshot({
    path: `${output}/mobile-dialog.png`,
    fullPage: true,
    animations: "disabled",
  });
  await mobile.context.close();
  assert.deepEqual(errors, []);
  await writeFile(
    `${output}/result.json`,
    JSON.stringify(
      {
        desktop: "1440x1000",
        mobile: "390x844",
        mode: "mocked native IPC; no real installation",
        checks: [
          "available",
          "progress",
          "backup before restart",
          "unsaved changes blocked",
          "offline retry",
          "install failure",
          "mobile",
        ],
        errors,
      },
      null,
      2,
    ),
  );
  console.log(
    "Updater UI passed: desktop/mobile, available, install/restart, unsaved changes, offline retry, signature failure (mocked native IPC).",
  );
} finally {
  await browser.close();
}
