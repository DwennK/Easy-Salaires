import { expect, it } from "vitest";
import { backfillDemoHistory, demoState } from "../src/domain/demo";
import { clone, employeeDefaults } from "../src/domain/defaults";
import {
  annualMissing,
  annualRows,
  issueRevision,
  prepareMonth,
  upgradeState,
} from "../src/domain/service";

function legacyDemo() {
  const s = upgradeState(demoState());
  delete s.company.demoHistoryVersion;
  s.rules = s.rules.filter((r) => r.year === 2026);
  s.payrolls = s.payrolls.filter((p) => p.period.startsWith("2026"));
  for (const e of s.employees) {
    e.start = "2026-01-01";
    e.terms[0]!.effective = "2026-01";
  }
  for (const p of s.payrolls) {
    p.employee = clone(s.employees.find((e) => e.id === p.employeeId)!);
    p.terms.effective = "2026-01";
    if (!p.result.errors.length) issueRevision(s, p, "original-pdf");
  }
  return s;
}

it("upgrades a saved 2026-only demo without resetting edits, payments or PDF history", () => {
  const s = legacyDemo();
  s.employees[0]!.lastName = "Nom modifié";
  s.payrolls[0]!.input.note = "Saisie à conserver";
  s.payrolls[0]!.paidAmount = 12345;
  const existing = clone(s.payrolls);
  const revisions = clone(s.revisions);
  const terms = clone(s.employees[0]!.terms);
  const added = backfillDemoHistory(s)!;
  expect(added).toHaveLength(72);
  expect(s.payrolls.slice(0, existing.length)).toEqual(existing);
  expect(s.revisions).toEqual(revisions);
  expect(s.employees[0]!.lastName).toBe("Nom modifié");
  expect(s.employees[0]!.terms.slice(1)).toEqual(terms);
  for (const p of added) {
    expect(p.result.errors).toEqual([]);
    expect(p.paidAmount).toBe(p.result.net);
    issueRevision(s, p, "historical-pdf");
  }
  for (const year of [2024, 2025]) {
    expect(annualRows(s, year)).toHaveLength(36);
    expect(annualMissing(s, year)).toEqual([]);
  }
  const migrated = clone(s);
  expect(backfillDemoHistory(s)).toBeNull();
  expect(s).toEqual(migrated);
  // A deliberate later deletion must not be undone every time the file opens.
  s.payrolls.pop();
  expect(backfillDemoHistory(s)).toBeNull();
  expect(s.payrolls).toHaveLength(101);
});

it("fills gaps while preserving existing historical payrolls and custom yearly rates", () => {
  const s = upgradeState(demoState());
  delete s.company.demoHistoryVersion;
  const existing = s.payrolls.find((p) => p.period === "2025-03")!;
  existing.input.note = "Existing historical exception";
  issueRevision(s, existing, "existing-pdf");
  const snapshot = clone(existing);
  s.payrolls = s.payrolls.filter(
    (p) => p.period.startsWith("2026") || p.id === existing.id,
  );
  const rule = s.rules.find((r) => r.year === 2024)!;
  rule.contributions.find((c) => c.id === "avs")!.employee = "6";
  const rules = clone(s.rules);
  expect(backfillDemoHistory(s)).toHaveLength(71);
  expect(s.rules).toEqual(rules);
  expect(s.payrolls.find((p) => p.id === existing.id)).toEqual(snapshot);
  expect(s.revisions[0]!.pdf).toBe("existing-pdf");
  expect(
    new Set(s.payrolls.map((p) => `${p.employeeId}:${p.period}`)).size,
  ).toBe(102);
});

it("does not migrate real companies, fresh demos or unrelated test employees", () => {
  const real = legacyDemo();
  real.company.demo = false;
  const before = clone(real);
  expect(backfillDemoHistory(real)).toBeNull();
  expect(real).toEqual(before);
  expect(backfillDemoHistory(demoState())).toBeNull();
  const s = legacyDemo();
  const custom = {
    ...employeeDefaults(),
    firstName: "Employé",
    lastName: "Ajouté",
  };
  s.employees.push(custom);
  const customBefore = clone(custom);
  backfillDemoHistory(s);
  expect(custom).toEqual(customBefore);
  expect(s.payrolls.some((p) => p.employeeId === custom.id)).toBe(false);
});

it("provides complete paid histories for all three employees in 2024 and 2025", () => {
  const s = upgradeState(demoState());
  expect(s.employees).toHaveLength(3);
  expect(s.payrolls).toHaveLength(102);
  for (const year of [2024, 2025]) {
    for (const employee of s.employees) {
      const rows = annualRows(s, year, employee.id);
      expect(rows.map((p) => p.period)).toEqual(
        Array.from(
          { length: 12 },
          (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`,
        ),
      );
      for (const p of rows) {
        expect(p.result.errors).toEqual([]);
        expect(p.result.net).toBeGreaterThan(0);
        expect(p.paidDate).toBe(`${p.period}-28`);
        expect(p.paidAmount).toBe(p.result.net);
        expect(p.paymentReview).toBe(false);
        expect(p.rules.year).toBe(year);
        expect(p.rules.sources).toEqual([]);
        expect(prepareMonth(s, p.period, employee.id)).toBe(0);
      }
    }
    const lea = s.employees[2]!;
    const rows = annualRows(s, year, lea.id);
    expect(rows.slice(0, 11).every((p) => p.result.thirteenPaid === 0)).toBe(
      true,
    );
    expect(rows[11]!.result.thirteenPaid).toBe(300000);
    expect(Number(rows[11]!.result.thirteenBalance)).toBe(0);
  }
});

it("keeps current-year calculations independent of the historical years", () => {
  const s = upgradeState(demoState());
  for (const employee of s.employees) {
    expect(annualRows(s, 2026, employee.id)).toHaveLength(10);
  }
  const lea = s.employees[2]!;
  const january = s.payrolls.find(
    (p) => p.employeeId === lea.id && p.period === "2026-01",
  )!;
  expect(Number(january.result.thirteenBalance)).toBe(250);
  const october = s.payrolls.filter((p) => p.period === "2026-10");
  expect(october.every((p) => !p.paidDate && p.paidAmount === null)).toBe(true);
  expect(
    october.find((p) => p.terms.mode === "hourly")!.input.hours,
  ).toBeNull();
});
