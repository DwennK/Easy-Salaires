import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { Payroll, Lang, State, Employee } from "../domain/types";
import { francs, money, sum, formatNumber } from "../domain/money";
import { tr, periodLabel } from "./i18n";
import { annualRows } from "../domain/service";
import { fromBase64, safeName, toBase64 } from "./bridge";
export type Loader = (path: string) => Promise<Uint8Array>;
const loader: Loader = async (path) =>
  new Uint8Array(await (await fetch(path)).arrayBuffer());
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
  issuedAt = p.updated,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(await load("/fonts/NotoSans-Regular.ttf"), {
    subset: true,
  });
  const bold = await pdf.embedFont(await load("/fonts/NotoSans-SemiBold.ttf"), {
    subset: true,
  });
  pdf.setTitle(`${tr("payroll", l)} ${p.period} ${p.employee.lastName}`);
  pdf.setProducer("Easy Salaires");
  pdf.setCreator("Easy Salaires");
  pdf.setCreationDate(new Date(issuedAt));
  pdf.setModificationDate(new Date(issuedAt));

  const left = 54,
    rightEdge = 541.28,
    width = rightEdge - left;
  const ink = rgb(0.12, 0.17, 0.21);
  const blue = rgb(0.12, 0.17, 0.21);
  const muted = rgb(0.36, 0.42, 0.47);
  const rule = rgb(0.4, 0.44, 0.46);
  const employeeName = `${p.employee.firstName} ${p.employee.lastName}`;
  const period = periodLabel(p.period, l);
  let page!: PDFPage,
    y = 0;
  const pages: PDFPage[] = [];
  const text = (
    value: string,
    x: number,
    at: number,
    size = 9.5,
    color = ink,
    face = font,
  ) => page.drawText(value, { x, y: at, size, font: face, color });
  const right = (
    value: string,
    x: number,
    at: number,
    size = 9.5,
    color = ink,
    face = font,
  ) =>
    text(value, x - face.widthOfTextAtSize(value, size), at, size, color, face);
  const line = (at: number) =>
    page.drawLine({
      start: { x: left, y: at },
      end: { x: rightEdge, y: at },
      thickness: 0.6,
      color: rule,
    });
  const addPage = () => {
    page = pdf.addPage([595.28, 841.89]);
    pages.push(page);
    y = 791;
    if (pages.length > 1) {
      text(tr("payroll", l), left, y, 13, ink, bold);
      right(period, rightEdge, y, 10, blue, bold);
      y -= 20;
      for (const ln of wrap(employeeName, font, 9, width)) {
        text(ln, left, y, 9, muted);
        y -= 13;
      }
      if (draft) {
        text(tr("draftPdf", l), left, y, 8, blue, bold);
        y -= 15;
      }
      line(y - 2);
      y -= 25;
    }
  };
  const ensure = (space: number) => {
    if (y - space < 70) addPage();
  };
  const paragraph = (
    value: string,
    x: number,
    maxWidth: number,
    size = 9.5,
    color = ink,
    face = font,
  ) => {
    for (const ln of wrap(value, face, size, maxWidth)) {
      ensure(size + 6);
      text(ln, x, y, size, color, face);
      y -= size + 5;
    }
  };
  addPage();
  const editionDate = new Intl.DateTimeFormat(l === "fr" ? "fr-CH" : "en-CH", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Zurich",
  }).format(new Date(issuedAt));
  right(`${tr("payslipIssuedOn", l)} ${editionDate}`, rightEdge, 777, 8, muted);
  let hasLogo = false;
  if (p.company.logo) {
    try {
      const bytes = fromBase64(p.company.logo.split(",")[1]!);
      const img = p.company.logo.startsWith("data:image/png")
        ? await pdf.embedPng(bytes)
        : await pdf.embedJpg(bytes);
      const dim = img.scaleToFit(122, 52);
      page.drawImage(img, {
        x: left,
        y: 797 - dim.height,
        width: dim.width,
        height: dim.height,
      });
      hasLogo = true;
    } catch {
      /* An invalid imported logo must not prevent a readable payslip. */
    }
  }
  if (!hasLogo) {
    y = 775;
    paragraph(p.company.name, left, 275, 15, ink, bold);
  }
  y = Math.min(y - 26, 710);
  const employer = [
    ...wrap(p.company.name, bold, 9.5, 245).map((value) => ({
      value,
      strong: true,
    })),
    ...wrap(
      [
        p.company.address,
        `${p.company.postal} ${p.company.city}`.trim(),
        [p.company.country, p.company.uid].filter(Boolean).join(" · "),
        p.company.contact,
      ]
        .filter(Boolean)
        .join("\n"),
      font,
      9,
      245,
    ).map((value) => ({ value, strong: false })),
  ];
  const recipient = [
    ...wrap(employeeName, bold, 9.5, 205).map((value) => ({
      value,
      strong: true,
    })),
    ...wrap(
      [
        p.employee.address,
        `${p.employee.postal} ${p.employee.city}`.trim(),
        ...(p.employee.avs
          ? [`${tr("avsNumber", l)} : ${p.employee.avs}`]
          : []),
      ]
        .filter(Boolean)
        .join("\n"),
      font,
      9,
      205,
    ).map((value) => ({ value, strong: false })),
  ];
  for (let i = 0; i < Math.max(employer.length, recipient.length); i++) {
    ensure(18);
    for (const [entry, x] of [
      [employer[i], left],
      [recipient[i], 336],
    ] as const) {
      if (entry)
        text(
          entry.value,
          x,
          y,
          entry.strong ? 9.5 : 9,
          ink,
          entry.strong ? bold : font,
        );
    }
    y -= 14;
  }
  y -= 26;
  ensure(130);
  const documentTitle = `${tr("payroll", l)} · ${period.charAt(0).toLocaleUpperCase(l)}${period.slice(1)}`;
  paragraph(documentTitle, left, width, 14, ink, bold);
  if (draft) {
    y -= 4;
    paragraph(tr("draftPdf", l), left, width, 8, muted, bold);
  }
  y -= 14;
  if (p.company.demo) {
    paragraph(tr("demoNotice", l), left, width, 7.5, muted);
    y -= 8;
  }

  const number = (value: string, digits: number) => {
    // Format only: all payroll amounts and bases still come from the saved result.
    const n = Number(value);
    return Number.isFinite(n)
      ? formatNumber(n, l, digits, Math.max(digits, 8))
      : value;
  };
  const tableHeader = () => {
    text(tr("payslipDescription", l), left, y, 8, ink, bold);
    right(tr("base", l), 365, y, 8, muted);
    right(tr("rateColumn", l), 424, y, 8, muted);
    right(tr("payslipAmount", l), rightEdge, y, 8, ink, bold);
    line(y - 7);
    y -= 25;
  };
  const header = (title: string, continuation = false) => {
    if (y - 95 < 70) {
      addPage();
      continuation = true;
    }
    if (continuation) tableHeader();
    text(title, left, y, 8, muted, bold);
    y -= 20;
  };
  const amountAt = (amount: number, at: number, size = 9, face = font) => {
    text("CHF", 445, at, 7, muted);
    right(money(amount, l), rightEdge, at, size, ink, face);
  };
  const subtotal = (label: string, amount: number, avsBasis?: number) => {
    ensure(avsBasis === undefined ? 35 : 52);
    line(y + 5);
    y -= 10;
    text(label, left, y, 9, ink, bold);
    amountAt(amount, y, 9, bold);
    y -= 18;
    if (avsBasis !== undefined) {
      text(tr("payslipAvsBasis", l), left, y, 8, muted);
      amountAt(avsBasis, y, 8);
      y -= 16;
    }
    y -= 12;
  };
  ensure(130);
  tableHeader();
  const reimbursements = new Set(
    p.input.elements.filter((e) => e.reimbursement).map((e) => e.id),
  );
  const rows = p.result.lines.filter(
    (r) => r.category === "earning" || r.amount !== 0,
  );
  const groups = [
    {
      title: tr("payslipEarnings", l),
      rows: rows.filter(
        (r) => r.category === "earning" && !reimbursements.has(r.id),
      ),
      total: p.result.gross,
      label: tr(
        p.result.gross === p.result.avsBase ? "payslipGrossAvs" : "gross",
        l,
      ),
      avsBasis:
        p.result.gross !== p.result.avsBase ? p.result.avsBase : undefined,
    },
    {
      title: tr("deductions", l),
      rows: rows.filter((r) => r.category === "contribution"),
      total: -p.result.deductions,
      label: tr("payslipDeductionsTotal", l),
    },
    {
      title: tr("reimbursements", l),
      rows: rows.filter(
        (r) => r.category === "earning" && reimbursements.has(r.id),
      ),
      total: p.result.reimbursements ?? 0,
      label: tr("reimbursements", l),
    },
  ];
  for (const [groupIndex, group] of groups.entries()) {
    if (!group.rows.length) continue;
    if (groupIndex > 0) header(group.title);
    for (const [rowIndex, row] of group.rows.entries()) {
      const overtime = p.input.elements.some(
        (e) => e.id === row.id && e.kind === "overtime",
      );
      const percentage =
        (row.category === "contribution" &&
          p.rules.contributions.find((c) => c.id === row.id)?.kind !==
            "fixed") ||
        ["holiday", "vacation"].includes(row.id) ||
        overtime;
      const basis = row.base
        ? `${Number(row.quantity) !== 1 ? `${number(row.quantity, 0)} × ` : ""}${number(row.base, 2)}`
        : "";
      const rate =
        row.rate && row.id !== "hourlySalary"
          ? `${overtime ? "+" : ""}${number(row.rate, percentage ? 0 : 2)}${percentage ? " %" : ""}`
          : "";
      const columns = [
        wrap(tr(row.label, l), font, 9, 222),
        wrap(basis, font, 8, 78),
        wrap(rate, font, 8, 49),
        wrap(
          money(row.category === "contribution" ? -row.amount : row.amount, l),
          font,
          9,
          73,
        ),
      ];
      const count = Math.max(...columns.map((c) => c.length));
      const height = Math.max(19, count * 13 + 6);
      // Keep an ordinary row with its subtotal; very long labels can span pages.
      const reserve =
        rowIndex === group.rows.length - 1
          ? group.avsBasis === undefined
            ? 35
            : 52
          : 0;
      if (y - Math.min(height + reserve, 580) < 70) {
        addPage();
        header(group.title, true);
      }
      for (let i = 0; i < count; i++) {
        if (y - 24 < 70) {
          addPage();
          header(group.title, true);
        }
        if (columns[0]![i]) text(columns[0]![i]!, left, y, 9);
        if (columns[1]![i]) right(columns[1]![i]!, 365, y, 8, muted);
        if (columns[2]![i]) right(columns[2]![i]!, 424, y, 8, muted);
        if (columns[3]![i]) {
          if (i === 0) text("CHF", 445, y, 7, muted);
          right(columns[3]![i]!, rightEdge, y, 9);
        }
        y -= 13;
      }
      y -= Math.max(6, height - count * 13);
    }
    subtotal(group.label, group.total, group.avsBasis);
  }

  ensure(p.employee.iban ? 96 : 60);
  y -= 2;
  page.drawLine({
    start: { x: left, y: y + 11 },
    end: { x: rightEdge, y: y + 11 },
    thickness: 1,
    color: ink,
  });
  text(tr("net", l), left, y - 11, 10.5, ink, bold);
  amountAt(p.result.net, y - 11, 12, bold);
  y -= 44;
  if (p.employee.iban) {
    paragraph(tr("payslipBankAccount", l), left, width, 8, muted);
    paragraph(p.employee.iban, left, width, 9);
    y -= 12;
  }
  if (p.input.note) {
    ensure(45);
    text(tr("payslipNote", l).toLocaleUpperCase(l), left, y, 7.5, muted, bold);
    y -= 18;
    paragraph(p.input.note, left, width, 9);
    y -= 10;
  }
  if (p.company.footer) {
    const footerLines = wrap(p.company.footer, font, 8, width);
    if (footerLines.length <= 2) {
      if (y < 88) addPage();
      footerLines.forEach((ln, i) => text(ln, left, 76 - i * 12, 8, muted));
    } else paragraph(p.company.footer, left, width, 9, muted);
  }
  pages.forEach((pg, i) => {
    pg.drawLine({
      start: { x: left, y: 48 },
      end: { x: rightEdge, y: 48 },
      thickness: 0.5,
      color: rule,
    });
    pg.drawText(
      `Easy Salaires · ${p.period} · ${tr("revision", l)} ${revision}`,
      {
        x: left,
        y: 32,
        size: 7.5,
        font,
        color: muted,
      },
    );
    const pagination = `${tr("page", l)} ${i + 1} / ${pages.length}`;
    pg.drawText(pagination, {
      x: rightEdge - font.widthOfTextAtSize(pagination, 7.5),
      y: 32,
      size: 7.5,
      font,
      color: muted,
    });
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
