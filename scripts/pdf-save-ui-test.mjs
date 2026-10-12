// UI_URL=http://127.0.0.1:1423 pnpm exec node scripts/pdf-save-ui-test.mjs
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

const output = "output/playwright/pdf-save";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  locale: "fr-CH",
});
await context.addInitScript(() => {
  window.isTauri = true;
  window.__pdfTest = { exports: [], cancel: false, fail: false };
  window.__TAURI_INTERNALS__ = {
    transformCallback: () => 1,
    unregisterCallback: () => {},
    invoke: async (cmd, args = {}) => {
      if (cmd === "plugin:app|version") return "0.1.1";
      if (cmd === "plugin:updater|check") return null;
      if (cmd === "plugin:resources|close") return;
      if (cmd !== "native") throw Error(`Unexpected command: ${cmd}`);
      if (args.action === "startup") {
        const { demoState } = await import("/src/domain/demo.ts");
        return {
          state: demoState(),
          path: "/test/demo.db",
          config: { recent: [], backupDir: "" },
        };
      }
      if (args.action === "save") return args.payload.version + 1;
      if (args.action === "backupStatus") return null;
      if (args.action === "previewDownload") {
        window.__pdfTest.preview = args.payload;
        return null;
      }
      if (args.action === "export") {
        const test = window.__pdfTest;
        test.exports.push(args.payload);
        if (test.fail) throw Error("Test: export failed");
        return test.cancel ? null : `/test/chosen-folder/${args.payload.name}`;
      }
      throw Error(`Unexpected action: ${args.action}`);
    },
  };
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(msg.text());
});
page.setDefaultTimeout(15000);
try {
  await page.goto(process.env.UI_URL || "http://127.0.0.1:1423");
  await page
    .getByRole("heading", { name: "Les salaires.", exact: true })
    .waitFor();
  const previewButtons = page.locator(
    'button[aria-label^="Voir le PDF"]:not(:disabled)',
  );
  await previewButtons.first().click();
  const preview = page.getByRole("dialog", {
    name: "Aperçu du document",
    exact: true,
  });
  await preview.waitFor();
  const expectedData = await page
    .locator("iframe.pdf-preview")
    .evaluate(async (frame) => {
      const bytes = new Uint8Array(
        await (await fetch(frame.src)).arrayBuffer(),
      );
      let binary = "";
      for (let i = 0; i < bytes.length; i += 32768)
        binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
      return btoa(binary);
    });
  const save = preview.getByRole("button", {
    name: "Enregistrer sous…",
    exact: true,
  });
  await save.click();
  await page.waitForFunction(() => window.__pdfTest.exports.length === 1);
  const exported = await page.evaluate(() => window.__pdfTest.exports[0]);
  assert.equal(exported.data, expectedData);
  assert.equal(exported.name, "2026-01_Salaire_Favre_Camille.pdf");
  const viewerDownload = await page.evaluate(() => window.__pdfTest.preview);
  assert.equal(viewerDownload.name, exported.name);
  assert.equal(
    viewerDownload.url,
    await page.locator("iframe.pdf-preview").getAttribute("src"),
  );
  assert.equal(exported.open, false);
  await page.screenshot({
    path: `${output}/desktop.png`,
    animations: "disabled",
  });
  await page.evaluate(() => {
    window.__pdfTest.cancel = true;
  });
  await save.click();
  await page.waitForFunction(() => window.__pdfTest.exports.length === 2);
  assert(await preview.isVisible());
  await save.click();
  await page.waitForFunction(() => window.__pdfTest.exports.length === 3);
  // Cancellation must permit another save attempt without losing the preview.
  assert.equal(await page.locator("iframe.pdf-preview").count(), 1);
  await page.evaluate(() => {
    window.__pdfTest.cancel = false;
    window.__pdfTest.fail = true;
  });
  await save.click();
  await preview
    .getByRole("alert")
    .filter({ hasText: "Test: export failed" })
    .waitFor();
  await page.evaluate(() => {
    window.__pdfTest.fail = false;
  });
  await save.click();
  await page.waitForFunction(() => window.__pdfTest.exports.length === 5);
  await preview.getByRole("alert").waitFor({ state: "hidden" });
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await save.isVisible());
  const box = await save.boundingBox();
  assert(box && box.x >= 0 && box.x + box.width <= 390);
  await page.screenshot({
    path: `${output}/mobile.png`,
    animations: "disabled",
  });
  await preview
    .getByRole("button", { name: "Fermer", exact: true })
    .last()
    .click();
  await preview.waitFor({ state: "hidden" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await previewButtons.nth(1).click();
  await preview.waitFor();
  await save.click();
  await page.waitForFunction(() => window.__pdfTest.exports.length === 6);
  assert.notEqual(
    (await page.evaluate(() => window.__pdfTest.exports[5])).name,
    exported.name,
  );
  assert.deepEqual(errors, []);
  await writeFile(
    `${output}/result.json`,
    JSON.stringify(
      {
        passed: true,
        nativeBridge: "simulated",
        desktop: "1440x1000",
        mobile: "390x844",
        checks: [
          "exact PDF bytes",
          "filename",
          "cancel and retry",
          "failure and retry",
          "new preview",
        ],
        errors,
      },
      null,
      2,
    ),
  );
  console.log(
    "PDF Save As: exact preview bytes, cancellation, retry, desktop/mobile and updated filename passed (native bridge simulated).",
  );
} finally {
  await browser.close();
}
