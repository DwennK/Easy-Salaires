import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { Payroll, Lang, State, Employee } from "../domain/types";
import { francs, money, sum } from "../domain/money";
import { tr, periodLabel } from "./i18n";
import { annualRows } from "../domain/service";
import { fromBase64, safeName, toBase64 } from "./bridge";
export type Loader = (path: string) => Promise<Uint8Array>;
const loader: Loader = async (path) =>
  new Uint8Array(await (await fetch(path)).arrayBuffer());
const ink = rgb(0.13, 0.19, 0.17),
  green = rgb(0.09, 0.3, 0.23),
  muted = rgb(0.43, 0.47, 0.45),
  lineColor = rgb(0.84, 0.87, 0.85);
function wrap(
  text: string,
  font: PDFFont,
  size: number,
  width: number,
): string[] {
  const out: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      if (font.widthOfTextAtSize(`${line} ${word}`.trim(), size) <= width) {
        line = `${line} ${word}`.trim();
      } else {
        if (line) out.push(line);
        line = "";
        for (const char of word) {
          if (font.widthOfTextAtSize(line + char, size) > width) {
            out.push(line);
            line = "";
          }
          line += char;
        }
      }
    }
    out.push(line);
  }
  return out;
}
export async function payslipPdf(
  p: Payroll,
  revision: number,
  l: Lang,
  load: Loader = loader,
  draft = false,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(await load("/fonts/NotoSans-Regular.ttf"), {
    subset: true,
  });
  pdf.setTitle(`${tr("payroll", l)} ${p.period} ${p.employee.lastName}`);
  pdf.setProducer("Easy Salaires");
  pdf.setCreator("Easy Salaires");
  pdf.setCreationDate(new Date(p.updated));
  pdf.setModificationDate(new Date(p.updated));
  let page!: PDFPage,
    y = 0;
  const pages: PDFPage[] = [];
  const text = (value: string, x: number, at: number, size = 10, color = ink) =>
    page.drawText(value, { x, y: at, size, font, color });
  const right = (
    value: string,
    x: number,
    at: number,
    size = 10,
    color = ink,
  ) => text(value, x - font.widthOfTextAtSize(value, size), at, size, color);
  const addPage = () => {
    page = pdf.addPage([595.28, 841.89]);
    pages.push(page);
    y = 790;
    text("Easy Salaires", 42, 806, 8, muted);
    text(
      `${periodLabel(p.period, l)} · ${tr("revision", l)} ${revision}`,
      350,
      806,
      8,
      muted,
    );
  };
  const ensure = (space: number) => {
    if (y - space < 65) {
      addPage();
      y -= 25;
    }
  };
  const paragraph = (value: string, x: number, width: number, size = 10) => {
    for (const ln of wrap(value, font, size, width)) {
      ensure(size + 6);
      text(ln, x, y, size);
      y -= size + 5;
    }
  };
  addPage();
  y = 756;
  text(p.company.name, 42, y, 18, green);
  y -= 24;
  paragraph(
    [
      p.company.address,
      `${p.company.postal} ${p.company.city}`,
      p.company.country,
      p.company.uid,
      p.company.contact,
    ]
      .filter(Boolean)
      .join("\n"),
    42,
    290,
    9,
  );
  if (p.company.logo) {
    try {
      const bytes = fromBase64(p.company.logo.split(",")[1]!);
      const img = p.company.logo.startsWith("data:image/png")
        ? await pdf.embedPng(bytes)
        : await pdf.embedJpg(bytes);
      const dim = img.scaleToFit(80, 70);
      page!.drawImage(img, {
        x: 475,
        y: 720,
        width: dim.width,
        height: dim.height,
      });
    } catch {
      /* Imported image validation happens in the UI; text remains printable. */
    }
  }
  y = Math.min(y - 25, 620);
  text(tr("payroll", l), 42, y, 24, green);
  y -= 24;
  text(periodLabel(p.period, l), 42, y, 12);
  y -= 25;
  paragraph(
    `${p.employee.firstName} ${p.employee.lastName}\n${p.employee.address}\n${p.employee.postal} ${p.employee.city}`,
    330,
    220,
    10,
  );
  y -= 8;
  if (p.employee.avs) {
    text(`${tr("avsNumber", l)} : ${p.employee.avs}`, 42, y, 9);
    y -= 17;
  }
  if (draft) {
    text(tr("draftPdf", l), 42, y, 10, rgb(0.64, 0.31, 0.12));
    y -= 22;
  }
  if (p.company.demo) {
    text(tr("demoNotice", l), 42, y, 8, muted);
    y -= 20;
  }
  const headings = () => {
    ensure(35);
    page.drawRectangle({
      x: 42,
      y: y - 9,
      width: 511,
      height: 27,
      color: rgb(0.94, 0.96, 0.94),
    });
    text(tr("label", l), 51, y, 8);
    right(tr("base", l), 380, y, 8);
    right(tr("rateColumn", l), 453, y, 8);
    right("CHF", 544, y, 8);
    y -= 33;
  };
  headings();
  for (const row of p.result.lines.filter(
    (r) => r.category === "earning" || r.amount !== 0,
  )) {
    const label = tr(row.label, l);
    const wrapped = wrap(label, font, 9, 250);
    const height = Math.max(27, wrapped.length * 13 + 12);
    if (y - height < 75) {
      addPage();
      y -= 28;
      headings();
    }
    wrapped.forEach((v, i) => text(v, 51, y - i * 13, 9));
    const basis = row.base
      ? `${Number(row.quantity) !== 1 ? `${Number(row.quantity)} × ` : ""}${row.base}`
      : "";
    right(basis, 380, y, 8, muted);
    const percentageRate =
      row.category === "contribution" ||
      ["holiday", "vacation"].includes(row.id) ||
      p.input.elements.some(
        (element) => element.id === row.id && element.kind === "overtime",
      );
    right(
      row.rate ? `${row.rate}${percentageRate ? " %" : ""}` : "",
      453,
      y,
      8,
      muted,
    );
    right(
      money(row.category === "contribution" ? -row.amount : row.amount, l),
      544,
      y,
      10,
    );
    y -= height;
    page.drawLine({
      start: { x: 42, y: y + 10 },
      end: { x: 553, y: y + 10 },
      thickness: 0.4,
      color: lineColor,
    });
  }
  ensure(p.result.reimbursements ? 164 : 140);
  y -= 12;
  for (const [key, val] of [
    ["gross", p.result.gross],
    ["deductions", p.result.deductions],
    ...(p.result.reimbursements
      ? [["reimbursements", p.result.reimbursements] as const]
      : []),
  ] as const) {
    text(tr(key, l), 330, y, 10);
    right(money(val, l), 544, y, 11);
    y -= 24;
  }
  y -= 12;
  page.drawRectangle({
    x: 320,
    y: y - 13,
    width: 233,
    height: 37,
    color: green,
  });
  text(tr("net", l), 330, y, 11, rgb(1, 1, 1));
  right(money(p.result.net, l), 544, y, 14, rgb(1, 1, 1));
  y -= 49;
  if (p.employee.iban) paragraph(`IBAN : ${p.employee.iban}`, 42, 511, 9);
  if (p.input.note) {
    y -= 12;
    paragraph(p.input.note, 42, 511, 9);
  }
  if (p.company.footer) {
    y -= 12;
    paragraph(p.company.footer, 42, 511, 9);
  }
  pages.forEach((pg, i) => {
    pg.drawLine({
      start: { x: 42, y: 47 },
      end: { x: 553, y: 47 },
      thickness: 0.5,
      color: lineColor,
    });
    pg.drawText(
      `${tr("revision", l)} ${revision} · ${p.period} · ${tr("page", l)} ${i + 1}/${pages.length}`,
      { x: 42, y: 32, font, size: 8, color: muted },
    );
    pg.drawText("CHF", { x: 530, y: 32, font, size: 8, color: muted });
  });
  return pdf.save({ useObjectStreams: false });
}
export const payslipName = (p: Payroll, revision: number) =>
  `${p.period}_${safeName(`${p.employee.lastName}_${p.employee.firstName}`)}_r${revision}.pdf`;
export async function mergePdfs(data: string[]): Promise<Uint8Array> {
  const merged = await PDFDocument.create();
  for (const b of data) {
    const doc = await PDFDocument.load(fromBase64(b));
    for (const page of await merged.copyPages(doc, doc.getPageIndices()))
      merged.addPage(page);
  }
  return merged.save();
}
export function csvCell(v: string): string {
  return `"${(/^[\s]*[=+@\-\t\r]/.test(v) ? "'" : "") + v.replace(/"/g, '""')}"`;
}
export function exportRows(
  s: State,
  year: number,
  id = "",
  l: Lang = s.company.lang,
): (string | number)[][] {
  return [
    [
      tr("employee", l),
      tr("month", l),
      tr("gross", l),
      tr("deductions", l),
      tr("net", l),
      tr("employer", l),
      tr("cost", l),
      tr("thirteenPaid", l),
      tr("status", l),
      tr("reimbursements", l),
      tr("paidAmount", l),
      tr("paymentDate", l),
    ],
    ...annualRows(s, year, id).map((p) => [
      `${p.employee.firstName} ${p.employee.lastName}`,
      p.period,
      ...[
        p.result.gross,
        p.result.deductions,
        p.result.net,
        p.result.employer,
        p.result.cost,
        p.result.thirteenPaid,
      ].map((x) => (p.result.errors.length ? "" : Number(francs(x)))),
      tr(p.needsReview ? "review" : p.issued ? "complete" : "draft", l),
      Number(francs(p.result.reimbursements ?? 0)),
      p.paidAmount == null ? "" : Number(francs(p.paidAmount)),
      p.paidDate,
    ]),
  ];
}
export const csvExport = (s: State, year: number, id = "") =>
  new TextEncoder().encode(
    "\uFEFF" +
      exportRows(s, year, id)
        .map((row) =>
          row
            .map((v) => (typeof v === "number" ? v.toFixed(2) : csvCell(v)))
            .join(";"),
        )
        .join("\r\n"),
  );
/** Balanced monthly statement; account numbers belong to the company's accounting plan. */
export function accountingRows(
  s: State,
  period: string,
): (string | number)[][] {
  const rows = s.payrolls.filter((p) => p.period === period);
  if (!rows.length || rows.some((p) => p.result.errors.length || p.needsReview))
    throw Error("incompletePayroll");
  const totals = new Map<string, { debit: number; credit: number }>();
  const add = (label: string, debit: number, credit: number) => {
    const old = totals.get(label) ?? { debit: 0, credit: 0 };
    old.debit += debit;
    old.credit += credit;
    totals.set(label, old);
  };
  for (const p of rows) {
    add(tr("gross"), p.result.gross, 0);
    add(tr("reimbursements"), p.result.reimbursements ?? 0, 0);
    add(tr("employer"), p.result.employer, 0);
    for (const line of p.result.lines.filter(
      (l) => l.category === "contribution",
    ))
      add(tr(line.label), 0, line.amount + line.employer);
    add(tr("net"), 0, p.result.net);
  }
  return [
    [s.company.name, period, "CHF"],
    [tr("accountingDescription"), tr("debit"), tr("credit")],
    ...Array.from(totals)
      .filter(([, v]) => v.debit || v.credit)
      .map(([label, v]) => [
        label,
        Number(francs(v.debit)),
        Number(francs(v.credit)),
      ]),
    [
      tr("total"),
      Number(francs(sum(Array.from(totals.values()).map((v) => v.debit)))),
      Number(francs(sum(Array.from(totals.values()).map((v) => v.credit)))),
    ],
  ];
}
export function accountingCsv(s: State, period: string) {
  return new TextEncoder().encode(
    "\uFEFF" +
      accountingRows(s, period)
        .map((row) =>
          row
            .map((v) => (typeof v === "number" ? v.toFixed(2) : csvCell(v)))
            .join(";"),
        )
        .join("\r\n"),
  );
}
export async function xlsxExport(
  s: State,
  year: number,
  id = "",
): Promise<Uint8Array> {
  const { default: ExcelJS } = await import("exceljs");
  const book = new ExcelJS.Workbook();
  book.creator = "Easy Salaires";
  const sheet = book.addWorksheet(String(year));
  sheet.addRows(exportRows(s, year, id));
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF174D3C" },
  };
  sheet.columns.forEach((col, i) => {
    col.width = i === 0 ? 30 : 20;
    if (i >= 2 && i <= 7) col.numFmt = "#,##0.00";
  });
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  return new Uint8Array(await book.xlsx.writeBuffer());
}
export function certificateNumbers(s: State, year: number, id: string) {
  const rows = annualRows(s, year, id);
  const gross = sum(rows.map((p) => p.result.gross));
  const social = sum(
    rows.flatMap((p) =>
      p.result.lines
        .filter((l) => ["avs", "ac", "aanp"].includes(l.id))
        .map((l) => l.amount),
    ),
  );
  const pension = sum(
    rows.flatMap((p) =>
      p.result.lines.filter((l) => l.id === "lpp").map((l) => l.amount),
    ),
  );
  return { gross, social, pension, net: gross - social - pension };
}
export async function certificatePdf(
  s: State,
  year: number,
  e: Employee,
  review: { transport: boolean; meals: boolean; remarks: string },
  load: Loader = loader,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(await load("/templates/form-11-dfe.pdf"));
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(await load("/fonts/NotoSans-Regular.ttf"), {
    subset: true,
  });
  const form = pdf.getForm();
  const n = certificateNumbers(s, year, e.id);
  const set = (name: string, value: string) => {
    const f = form.getTextField(name);
    f.setText(value);
    f.setFontSize(9);
  };
  form.getCheckBox("OptionKreuzOhneRahmen_A").check();
  if (review.transport) form.getCheckBox("OptionKreuzOhneRahmen_F").check();
  if (review.meals) form.getCheckBox("OptionKreuzOhneRahmen_G").check();
  set("AHVLinks_C", e.avs);
  set("TextLinks_C-GebDatum", e.birthDate);
  set("TextLinks_D", String(year));
  set("TextLinks_E-von", e.start > `${year}-01-01` ? e.start : `${year}-01-01`);
  set(
    "TextLinks_E-bis",
    e.end && e.end < `${year}-12-31` ? e.end : `${year}-12-31`,
  );
  set(
    "TextMehrzeiligLinks_Empfaenger",
    `${e.firstName} ${e.lastName}\n${e.address}\n${e.postal} ${e.city}`,
  );
  // Whole francs on form 11; commercial rounding per Swissdec ELM 5.0 section 8.1.
  for (const [key, val] of [
    ["1", n.gross],
    ["8", n.gross],
    ["9", n.social],
    ["10_1", n.pension],
    ["11", n.net],
  ] as const)
    set(`DezZahlNull_${key}`, String(Math.round(val / 100)));
  set("TextLinks_15_1", review.remarks.slice(0, 95));
  set("TextLinks_15_2", review.remarks.slice(95, 190));
  set(
    "TextLinks_I",
    `${s.company.city}, ${new Date().toLocaleDateString(s.company.lang === "fr" ? "fr-CH" : "en-CH")}`,
  );
  set(
    "TextMehrzeiligLinks_Bestaetigung",
    `${s.company.name}\n${s.company.address}, ${s.company.postal} ${s.company.city}\n${s.company.responsible} · ${s.company.contact}`,
  );
  form.updateFieldAppearances(font);
  if (s.company.demo) {
    for (const page of pdf.getPages())
      page.drawText(tr("demoCertificate", s.company.lang), {
        x: 35,
        y: page.getHeight() - 10,
        size: 7.5,
        font,
        color: rgb(0.65, 0.12, 0.12),
      });
    pdf.setSubject(tr("demoCertificate", s.company.lang));
  }
  return pdf.save({ useObjectStreams: false });
}
export const encoded = toBase64;
