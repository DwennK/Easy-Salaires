import { it, expect } from "vitest";
import { demoState } from "../src/domain/demo";
import { clone, uid } from "../src/domain/defaults";
import {
  upgradeState,
  updateEmployee,
  updateCompany,
  savePayroll,
  changeRules,
  ensurePayroll,
  recordPayment,
  issueRevision,
  refreshPayrolls,
} from "../src/domain/service";
import {
  exportRows,
  certificateNumbers,
  accountingRows,
} from "../src/lib/documents";
const fixture = () => upgradeState(demoState());
it("updates all current identity surfaces and exports without changing original documents or payments", () => {
  const s = fixture(),
    p = s.payrolls[0]!,
    e = clone(s.employees[0]!);
  issueRevision(s, p, "original");
  const revision = clone(s.revisions[0]);
  const paid = p.paidAmount;
  e.lastName = "Nom corrigé";
  e.iban = "CH9300762011623852957";
  updateEmployee(s, e);
  expect(
    s.payrolls
      .filter((p) => p.employeeId === e.id)
      .every((p) => p.employee.lastName === "Nom corrigé"),
  ).toBe(true);
  expect(exportRows(s, 2026, e.id)[1]![0]).toBe("Camille Nom corrigé");
  expect(p.paidAmount).toBe(paid);
  expect(p.paidDate).toBe("2026-01-28");
  expect(p.paymentReview).toBe(false);
  expect(s.revisions[0]).toEqual(revision);
  expect(p.issued).toBe(false);
});
it("a no-op save keeps PDF validity and all payment dates", () => {
  const s = fixture(),
    p = s.payrolls[0]!;
  issueRevision(s, p, "original");
  const before = clone(s.payrolls);
  const saved = savePayroll(s, clone(p));
  expect(saved.issued).toBe(true);
  expect(s.payrolls.map((p) => p.paidDate)).toEqual(
    before.map((p) => p.paidDate),
  );
  expect(s.payrolls.map((p) => p.paymentReview)).toEqual(
    before.map((p) => p.paymentReview),
  );
});
it("propagates shared salary changes while preserving an explicit monthly exception and recorded payments", () => {
  const s = fixture(),
    e = clone(s.employees[0]!);
  const jan = s.payrolls[0]!,
    feb = s.payrolls.find(
      (p) => p.employeeId === e.id && p.period === "2026-02",
    )!;
  const edited = clone(feb);
  edited.terms.salary = "6000";
  savePayroll(s, edited);
  e.terms[0]!.salary = "5500";
  updateEmployee(s, e);
  expect(jan.terms.salary).toBe("5500");
  expect(s.payrolls.find((p) => p.id === feb.id)!.terms.salary).toBe("6000");
  expect(jan.paymentReview).toBe(true);
  expect(jan.paidDate).toBe("2026-01-28");
});
it("recalculates start/end corrections and carries the 13th salary through subsequent months", () => {
  const s = fixture(),
    e = clone(s.employees[2]!);
  e.start = "2026-01-16";
  e.end = "2026-08-31";
  updateEmployee(s, e);
  const jan = s.payrolls.find(
    (p) => p.employeeId === e.id && p.period === "2026-01",
  )!;
  const august = s.payrolls.find(
    (p) => p.employeeId === e.id && p.period === "2026-08",
  )!;
  expect(jan.result.salary).toBe(154839);
  expect(august.result.thirteenPaid).toBeGreaterThan(0);
  expect(
    s.payrolls.find((p) => p.employeeId === e.id && p.period === "2026-09")!
      .result.errors,
  ).toContain("outsideContract");
});
it("replaces yearly rates on issued and unissued months and inherits each non-overridden field", () => {
  const s = fixture(),
    e = s.employees[0]!;
  e.terms[0]!.overrides = [{ id: "aanp", employee: "1.5" }];
  const r = clone(s.rules[0]!);
  r.id = uid();
  r.effective = "2026-10";
  r.contributions.find((c) => c.id === "avs")!.employee = "6";
  r.contributions.find((c) => c.id === "aanp")!.employer = "0.4";
  changeRules(s, r);
  const jan = s.payrolls[0]!;
  expect(jan.result.lines.find((l) => l.id === "avs")!.rate).toBe("6");
  expect(jan.result.lines.find((l) => l.id === "aanp")!.rate).toBe("1.5");
  expect(jan.result.lines.find((l) => l.id === "aanp")!.employer).toBe(2080);
  expect(
    s.rules
      .filter((r) => r.year === 2026)
      .every((r) => r.effective === "2026-01"),
  ).toBe(true);
});
it("upgrades legacy monthly exceptions and payment amounts without rewriting revision snapshots", () => {
  const s = demoState();
  const p = s.payrolls[0]!;
  delete p.termOverrides;
  delete p.paidAmount;
  p.terms.salary = "6100";
  issueRevision(s, p, "legacy-pdf");
  const original = clone(s.revisions[0]);
  upgradeState(s);
  expect(s.payrolls[0]!.termOverrides?.salary).toBe("6100");
  expect(p.paidAmount).not.toBeNull();
  expect(s.revisions[0]).toEqual(original);
  const before = clone(s);
  upgradeState(s);
  expect(s).toEqual(before);
});
it("refreshes company identity and invalidates only current PDFs while keeping archives", () => {
  const s = fixture();
  issueRevision(s, s.payrolls[0]!, "pdf");
  const r = clone(s.revisions);
  updateCompany(s, {
    ...s.company,
    name: "Entreprise corrigée",
    footer: "Nouveau pied de page",
  });
  expect(
    s.payrolls.every((p) => p.company.name === "Entreprise corrigée"),
  ).toBe(true);
  expect(s.revisions).toEqual(r);
});
it("creates only the chosen employee and prepares earlier defaults for cumulative calculations", () => {
  const s = fixture();
  s.payrolls = [];
  const id = s.employees[0]!.id;
  const p = ensurePayroll(s, id, "2026-04");
  expect(s.payrolls).toHaveLength(4);
  expect(s.payrolls.every((p) => p.employeeId === id)).toBe(true);
  expect(p.result.errors).toEqual([]);
  expect(() => issueRevision(s, p, "pdf")).not.toThrow();
});
it("blocks later cumulative results when earlier hourly inputs are missing", () => {
  const s = fixture(),
    id = s.employees[1]!.id;
  s.payrolls = [];
  const p = ensurePayroll(s, id, "2026-02");
  p.input.hours = "150";
  refreshPayrolls(s, id);
  expect(p.result.errors).toContain("previousMonthsIncomplete");
  expect(() => issueRevision(s, p, "pdf")).toThrow("incompletePayroll");
});
it("records partial payments independently and validates paired amount/date inputs", () => {
  const s = fixture(),
    p = s.payrolls[0]!;
  recordPayment(s, p.id, "2026-01-29", "1000");
  expect(p.paidAmount).toBe(100000);
  expect(p.paymentReview).toBe(true);
  expect(p.paidDate).toBe("2026-01-29");
  expect(() => recordPayment(s, p.id, "2026-02-31", "2000")).toThrow(
    "invalidDate",
  );
  expect(() => recordPayment(s, p.id, "", "2000")).toThrow(
    "paymentBothRequired",
  );
  recordPayment(s, p.id, "", null);
  expect(p.paidAmount).toBeNull();
  expect(p.paymentReview).toBe(false);
});
it("reimburses expenses without inflating gross, contribution bases or the annual certificate", () => {
  const s = fixture(),
    p = s.payrolls[0]!,
    before = clone(p.result),
    annual = certificateNumbers(s, 2026, p.employeeId);
  const edited = clone(p);
  edited.input.elements.push({
    id: "annual-expenses",
    kind: "adjustment",
    label: "Frais",
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
  const saved = savePayroll(s, edited);
  expect(saved.result.gross).toBe(before.gross);
  expect(saved.result.net).toBe(before.net + 12550);
  expect(saved.result.avsBase).toBe(before.avsBase);
  expect(certificateNumbers(s, 2026, p.employeeId)).toEqual(annual);
  const ledger = accountingRows(s, "2026-01");
  expect(ledger.at(-1)![1]).toBe(ledger.at(-1)![2]);
});
it("upgrading old result shapes does not invalidate an unchanged original PDF", () => {
  const s = demoState(),
    p = s.payrolls[0]!;
  delete p.result.reimbursements;
  delete p.termOverrides;
  delete p.paidAmount;
  issueRevision(s, p, "original");
  upgradeState(s);
  expect(p.issued).toBe(true);
  const reloaded = clone(s);
  delete reloaded.dataModel;
  upgradeState(reloaded);
  expect(reloaded.payrolls).toEqual(s.payrolls);
});
it("makes only legacy divergent contribution fields into employee exceptions", () => {
  const s = demoState(),
    e = s.employees[0]!;
  e.terms[0]!.overrides = clone(
    s.rules.find((r) => r.year === Number(e.terms[0]!.effective.slice(0, 4)))!
      .contributions,
  );
  e.terms[0]!.overrides.find((c) => c.id === "aanp")!.employee = "1.7";
  upgradeState(s);
  expect(e.terms[0]!.overrides).toEqual([{ id: "aanp", employee: "1.7" }]);
});
