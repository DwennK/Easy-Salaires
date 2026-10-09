import { it, expect } from "vitest";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import ExcelJS from "exceljs";
import { demoState } from "../src/domain/demo";
import {
  payslipPdf,
  csvExport,
  xlsxExport,
  certificatePdf,
  certificateNumbers,
  csvCell,
  mergePdfs,
} from "../src/lib/documents";
import { toBase64 } from "../src/lib/bridge";
import { savePayroll } from "../src/domain/service";
const load = async (path: string) =>
  new Uint8Array(await readFile(`public${path}`));
it("generates deterministic embedded-font PDFs and a merged monthly export", async () => {
  const s = demoState(),
    p = s.payrolls[0]!;
  const issuedAt = "2026-10-08T22:30:00.000Z";
  const a = await payslipPdf(p, 1, "fr", load, false, issuedAt),
    b = await payslipPdf(p, 1, "fr", load, false, issuedAt);
  expect(a).toEqual(b);
  expect((await PDFDocument.load(a)).getCreationDate()?.toISOString()).toBe(
    issuedAt,
  );
  const en = await payslipPdf(p, 1, "en", load);
  expect((await PDFDocument.load(a)).getPageCount()).toBe(1);
  expect((await PDFDocument.load(en)).getPageCount()).toBe(1);
  const merged = await mergePdfs([toBase64(a), toBase64(en)]);
  expect((await PDFDocument.load(merged)).getPageCount()).toBe(2);
  await mkdir("output/qa", { recursive: true });
  await writeFile("output/qa/payslip-fr.pdf", a);
  await writeFile("output/qa/payslip-en.pdf", en);
}, 20000);
it("paginates long addresses and many lines", async () => {
  const s = demoState(),
    p = s.payrolls[0]!;
  p.company.address =
    "Rue des très longues adresses à caractères accentués ".repeat(8);
  p.input.note = "Commentaire détaillé : ".repeat(150);
  p.result.lines.push(
    ...Array.from({ length: 45 }, (_, i) => ({
      ...p.result.lines[0]!,
      id: `extra-${i}`,
      label: "Ligne de rémunération détaillée à vérifier",
    })),
  );
  const bytes = await payslipPdf(p, 2, "fr", load);
  expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(2);
  await mkdir("output/qa", { recursive: true });
  await writeFile("output/qa/payslip-long.pdf", bytes);
}, 20000);
it("keeps salary, thirteenth-pay and expense layouts on A4 without changing payroll snapshots", async () => {
  const s = demoState();
  const expenses = structuredClone(s.payrolls[0]!);
  expenses.input.elements.push({
    id: "expenses",
    kind: "adjustment",
    label: "Frais de déplacement",
    amount: "125.50",
    quantity: "1",
    unit: "hours",
    rate: "0",
    premium: "0",
    paid: true,
    avs: false,
    laa: false,
    thirteen: false,
    reimbursement: true,
  });
  const saved = savePayroll(s, expenses);
  saved.employee.iban = "CH93 0076 2011 6238 5295 7";
  saved.employee.avs = "756.0000.0000.00";
  saved.company.logo = `data:image/png;base64,${(await readFile("src/assets/app-icon.png")).toString("base64")}`;
  const cases = [
    saved,
    s.payrolls.find(
      (p) => p.period === "2025-10" && p.employee.firstName === "Alex",
    )!,
    s.payrolls.find(
      (p) => p.period === "2025-12" && p.employee.firstName === "Léa",
    )!,
  ];
  await mkdir("output/qa", { recursive: true });
  for (const [i, p] of cases.entries()) {
    const before = JSON.stringify(p);
    for (const language of ["fr", "en"] as const) {
      const bytes = await payslipPdf(p, 2, language, load, true);
      const document = await PDFDocument.load(bytes);
      expect(document.getPageCount()).toBe(1);
      expect(document.getPage(0).getSize()).toEqual({
        width: 595.28,
        height: 841.89,
      });
      expect(JSON.stringify(p)).toBe(before);
      await writeFile(`output/qa/payslip-layout-${i}-${language}.pdf`, bytes);
    }
  }
}, 20000);
it("keeps spreadsheet amounts numeric and neutralizes formula injection", async () => {
  const s = demoState();
  s.payrolls[0]!.employee.firstName = '=HYPERLINK("evil")';
  expect(csvCell("  =1+1")).toBe('"\'  =1+1"');
  expect(new TextDecoder().decode(csvExport(s, 2026))).toContain("'=HYPERLINK");
  const bytes = await xlsxExport(s, 2026);
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(
    bytes as unknown as Parameters<typeof book.xlsx.load>[0],
  );
  const sheet = book.worksheets[0]!;
  expect(typeof sheet.getCell("C2").value).toBe("number");
  expect(typeof sheet.getCell("A2").value).toBe("string");
  expect(sheet.getCell("C2").value).toBe(s.payrolls[0]!.result.gross / 100);
}, 20000);
it("fills official canonical fields; tax net excludes IJM and preserves editable form", async () => {
  const s = demoState(),
    e = s.employees[0]!;
  s.company.demo = false;
  s.payrolls[0]!.result.lines.push({
    id: "ijm",
    label: "ijm",
    amount: 500,
    employer: 500,
    base: "",
    quantity: "1",
    rate: "1",
    category: "contribution",
    origin: "contract",
    ruleVersion: "x",
  });
  const n = certificateNumbers(s, 2026, e.id);
  const bytes = await certificatePdf(
    s,
    2026,
    e,
    {
      transport: true,
      meals: false,
      remarks: "Contrôle des données effectué.",
    },
    load,
  );
  const pdf = await PDFDocument.load(bytes),
    form = pdf.getForm();
  expect(form.getTextField("DezZahlNull_11").getText()).toBe(
    String(Math.round(n.net / 100)),
  );
  expect(form.getCheckBox("OptionKreuzOhneRahmen_F").isChecked()).toBe(true);
  expect(form.getTextField("TextLinks_D").getText()).toBe("2026");
  expect(form.getFields().length).toBeGreaterThan(30);
  expect(pdf.getSubject()).toBeUndefined();
  expect(form.getTextField("TextLinks_15_1").getText()).toBe(
    "Contrôle des données effectué.",
  );
  await mkdir("output/qa", { recursive: true });
  await writeFile("output/qa/certificate-test.pdf", bytes);
}, 20000);

it("labels historical demo certificates without inventing an AVS number", async () => {
  const s = demoState();
  for (const year of [2024, 2025]) {
    for (const e of s.employees) {
      const bytes = await certificatePdf(
        s,
        year,
        e,
        {
          transport: false,
          meals: false,
          remarks: "Remarque conservée",
        },
        load,
      );
      const pdf = await PDFDocument.load(bytes);
      const form = pdf.getForm();
      expect(pdf.getSubject()).toBe(
        "DÉMONSTRATION · Données fictives · Sans valeur officielle",
      );
      expect(form.getTextField("AHVLinks_C").getText() ?? "").toBe("");
      expect(form.getTextField("TextLinks_D").getText()).toBe(String(year));
      expect(form.getTextField("TextLinks_E-von").getText()).toBe(
        `${year}-01-01`,
      );
      expect(form.getTextField("TextLinks_E-bis").getText()).toBe(
        `${year}-12-31`,
      );
      expect(form.getTextField("DezZahlNull_11").getText()).toBe(
        String(Math.round(certificateNumbers(s, year, e.id).net / 100)),
      );
      expect(form.getTextField("TextLinks_15_1").getText()).toBe(
        "Remarque conservée",
      );
    }
  }
}, 20000);
