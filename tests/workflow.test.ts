import { it, expect } from "vitest";
import { demoState } from "../src/domain/demo";
import {
  prepareMonth,
  savePayroll,
  issueRevision,
  annualRows,
  archiveEmployee,
  changeTerms,
  missingEarlier,
  validateEmployee,
} from "../src/domain/service";
import { clone, uid } from "../src/domain/defaults";
it("preparation is idempotent, retains input and never duplicates employee/month", () => {
  const s = demoState();
  const before = clone(s.payrolls);
  expect(prepareMonth(s, "2026-10")).toBe(0);
  expect(s.payrolls).toEqual(before);
  expect(prepareMonth(s, "2026-11")).toBe(3);
  expect(prepareMonth(s, "2026-11")).toBe(0);
  expect(
    s.payrolls
      .filter((p) => p.period === "2026-11")
      .every((p) => p.input.hours === null && p.input.elements.length === 0),
  ).toBe(true);
});
it("address and rate changes do not alter historical snapshots", () => {
  const s = demoState(),
    p = s.payrolls[0]!;
  const snapshot = clone(p);
  s.company.address = "New";
  s.employees[0]!.address = "New";
  s.rules[0]!.contributions[0]!.employee = "7";
  expect(p).toEqual(snapshot);
});
it("correction recalculates later months and preserves actual payments and original revisions", () => {
  const s = demoState(),
    p = s.payrolls[0]!;
  issueRevision(s, p, "pdf-original");
  const revision = clone(s.revisions[0]);
  s.exports.push({
    id: "x",
    year: 2026,
    employeeId: p.employeeId,
    created: "",
    kind: "csv",
    stale: false,
    data: "",
    name: "",
  });
  const draft = clone(p);
  draft.terms.salary = "6000";
  const saved = savePayroll(s, draft);
  expect(saved.paidDate).toBe("2026-01-28");
  expect(saved.paidAmount).toBe(p.result.net);
  expect(saved.paymentReview).toBe(true);
  expect(saved.result.gross).toBe(600000);
  expect(
    s.payrolls.find(
      (x) => x.employeeId === p.employeeId && x.period === "2026-02",
    )?.needsReview,
  ).toBe(false);
  expect(s.exports[0]?.stale).toBe(true);
  expect(s.revisions[0]).toEqual(revision);
  expect(annualRows(s, 2026, p.employeeId)).toHaveLength(10);
});
it("multiple revisions count only one current payroll", () => {
  const s = demoState(),
    p = s.payrolls[0]!;
  issueRevision(s, p, "pdf1");
  issueRevision(s, p, "pdf2");
  expect(s.revisions).toHaveLength(2);
  expect(annualRows(s, 2026, p.employeeId)).toHaveLength(10);
});
it("requires earlier complete calculations but not issued PDFs", () => {
  const s = demoState(),
    p = s.payrolls.find((p) => p.period === "2026-02")!;
  expect(missingEarlier(s, p)).toEqual([]);
  expect(() => issueRevision(s, p, "pdf")).not.toThrow();
  s.payrolls[0]!.result.errors.push("salaryRequired");
  expect(missingEarlier(s, p)).toEqual(["2026-01"]);
});
it("archives employees with history", () => {
  const s = demoState(),
    e = s.employees[0]!;
  archiveEmployee(s, e);
  expect(e.archived).toBe(true);
  expect(s.employees).toHaveLength(3);
  expect(annualRows(s, 2026, e.id)).toHaveLength(10);
  prepareMonth(s, "2026-11");
  expect(s.payrolls.filter((p) => p.period === "2026-11")).toHaveLength(2);
});
it("refuses retroactive global term changes", () => {
  const s = demoState(),
    e = s.employees[0]!;
  const t = { ...clone(e.terms[0]!), id: uid(), effective: "2026-08" };
  expect(() => changeTerms(s, e.id, t)).toThrow("futureTermsRequired");
  t.effective = "2026-11";
  changeTerms(s, e.id, t);
  expect(e.terms).toHaveLength(2);
});
it("validates AVS and IBAN checksums", () => {
  const s = demoState(),
    e = s.employees[0]!;
  e.iban = "CH9300762011623852957";
  expect(() => validateEmployee(e)).not.toThrow();
  e.iban = "CH9300762011623852958";
  expect(() => validateEmployee(e)).toThrow("invalidIban");
  e.iban = "";
  e.avs = "756.1111.1111.11";
  expect(() => validateEmployee(e)).toThrow("invalidAvs");
});
