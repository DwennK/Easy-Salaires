// Run with: pnpm exec tsx scripts/demo-history-ui-test.mjs
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { demoState } from "../src/domain/demo.ts";
import { clone } from "../src/domain/defaults.ts";
import {
  annualMissing,
  issueRevision,
  upgradeState,
} from "../src/domain/service.ts";
import { payslipPdf } from "../src/lib/documents.ts";

const output = "output/playwright/demo-history-migration";
await mkdir(output, { recursive: true });
const legacy = upgradeState(demoState());
delete legacy.company.demoHistoryVersion;
legacy.rules = legacy.rules.filter((r) => r.year === 2026);
legacy.payrolls = legacy.payrolls.filter((p) => p.period.startsWith("2026"));
for (const e of legacy.employees) {
  e.start = "2026-01-01";
  e.terms[0].effective = "2026-01";
}
const load = async (path) => new Uint8Array(await readFile(`public${path}`));
for (const p of legacy.payrolls) {
  p.employee = clone(legacy.employees.find((e) => e.id === p.employeeId));
  p.terms.effective = "2026-01";
  if (!p.result.errors.length) {
    const pdf = await payslipPdf(p, 1, "fr", load);
    issueRevision(legacy, p, Buffer.from(pdf).toString("base64"));
  }
}
legacy.payrolls[0].input.note = "Existing test edit must survive";
legacy.payrolls[0].paidAmount = 12345;

const browser = await chromium.launch({ channel: "chrome", headless: true });
const errors = [];
const report = [];
const url = process.env.UI_URL || "http://127.0.0.1:1420";
async function readPreview(page) {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open("easy-salaires-preview", 1);
        request.onsuccess = () => {
          const db = request.result;
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
  for (const mode of ["web", "native-bridge"]) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    let nativeSaved = clone(legacy);
    let writes = 0;
    if (mode === "native-bridge") {
      // Match SQLite's persisted shape: arbitrary top-level flags are not stored.
      await context.exposeBinding("__demoNative", async (_, cmd, args = {}) => {
        if (cmd === "plugin:app|version") return "0.1.0";
        if (cmd === "plugin:updater|check") return null;
        if (cmd === "native" && args.action === "startup")
          return {
            state: clone(nativeSaved),
            path: "demonstration.db",
            config: { recent: [], backupDir: "" },
          };
        if (cmd === "native" && args.action === "save") {
          assert.equal(args.payload.version, nativeSaved.version);
          nativeSaved = Object.fromEntries(
            [
              "company",
              "employees",
              "rules",
              "payrolls",
              "revisions",
              "exports",
            ].map((key) => [key, clone(args.payload[key])]),
          );
          nativeSaved.version = args.payload.version + 1;
          writes++;
          return nativeSaved.version;
        }
        if (cmd === "native" && args.action === "backupStatus") return null;
        throw new Error(`Unexpected IPC: ${cmd} ${args.action}`);
      });
      await context.addInitScript(() => {
        window.isTauri = true;
        window.__TAURI_INTERNALS__ = {
          invoke: (cmd, args) => window.__demoNative(cmd, args),
        };
      });
    }
    const page = await context.newPage();
    page.setDefaultTimeout(60000);
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(url);
    if (mode === "web") {
      await page
        .getByRole("button", { name: "Essayer la démonstration" })
        .waitFor();
      await page.evaluate(
        (state) =>
          new Promise((resolve, reject) => {
            const request = indexedDB.open("easy-salaires-preview", 1);
            request.onsuccess = () => {
              const db = request.result;
              const tx = db.transaction("demo", "readwrite");
              tx.objectStore("demo").put(state, "state");
              tx.oncomplete = () => {
                db.close();
                resolve();
              };
              tx.onerror = () => reject(tx.error);
            };
          }),
        legacy,
      );
      // Reproduce the bug by opening existing storage, never clicking "new demo".
      await page.reload();
    }
    await page.getByRole("heading", { name: "Les salaires." }).waitFor();
    const migrated =
      mode === "web" ? await readPreview(page) : clone(nativeSaved);
    assert.equal(migrated.company.demoHistoryVersion, 1);
    assert.equal(migrated.payrolls.length, 102);
    assert.deepEqual(migrated.payrolls.slice(0, 30), legacy.payrolls);
    assert.deepEqual(
      migrated.revisions.slice(0, legacy.revisions.length),
      legacy.revisions,
    );
    assert.equal(migrated.revisions.length, legacy.revisions.length + 72);
    assert.deepEqual(annualMissing(migrated, 2025), []);
    assert.deepEqual(annualMissing(migrated, 2024), []);
    await page
      .getByRole("spinbutton", { name: "Année", exact: true })
      .fill("2025");
    await page
      .getByRole("spinbutton", { name: "Année", exact: true })
      .press("Tab");
    for (const label of ["Camille Favre", "Alex Morel", "Léa Perret"]) {
      await page
        .getByRole("combobox", { name: "Employé", exact: true })
        .selectOption({ label });
      const rows = await page.locator(".year-grid tbody tr").allTextContents();
      assert.equal(rows.length, 12);
      assert.ok(
        rows.every(
          (text, i) =>
            text.includes("PDF créé") &&
            text.includes(`28.${String(i + 1).padStart(2, "0")}.2025`),
        ),
      );
    }
    await page.screenshot({
      path: `${output}/${mode}-2025.png`,
      fullPage: true,
    });
    await page.reload();
    await page.getByRole("heading", { name: "Les salaires." }).waitFor();
    const reloaded =
      mode === "web" ? await readPreview(page) : clone(nativeSaved);
    assert.deepEqual(reloaded, migrated);
    if (mode === "native-bridge") assert.equal(writes, 1);
    report.push({
      mode,
      historicalPayslips: 72,
      year2025: 36,
      originalDataPreserved: true,
      reloadUnchanged: true,
    });
    await context.close();
  }
  assert.deepEqual(errors, []);
  await writeFile(
    `${output}/result.json`,
    JSON.stringify({ report, errors }, null, 2),
  );
  console.log(JSON.stringify({ report, errors }, null, 2));
} finally {
  await browser.close();
}
