import { describe, it, expect } from "vitest";
import { employeeDefaults, preset2026, clone } from "../src/domain/defaults";
import { calculate } from "../src/domain/payroll";
import {
  emptyState,
  prepareMonth,
  refreshPayrolls,
  updateEmployee,
  upgradeState,
} from "../src/domain/service";
import type { Input, Payroll, State } from "../src/domain/types";
import { readFileSync } from "node:fs";

function setup() {
  const e = employeeDefaults();
  Object.assign(e, {
    firstName: "Alice",
    lastName: "Test",
    birthDate: "1994-01-01",
    start: "2026-01-01",
  });
  const t = e.terms[0]!;
  Object.assign(t, {
    effective: "2026-01",
    salary: "1250",
    lpp: false,
    smallSalary: { enabled: true, activity: "ordinary", requested: false },
  });
  const r = preset2026();
  r.contributions.find((c) => c.id === "aap")!.employer = "1";
  r.contributions.find((c) => c.id === "aanp")!.employee = "1";
  const input: Input = {
    hours: null,
    elements: [],
    prorata: null,
    prorataReason: "",
    note: "",
  };
  const previous: Payroll[] = [];
  function month(period: string, salary = t.salary) {
    t.salary = salary;
    const result = calculate(e, t, r, input, period, previous);
    previous.push({
      employeeId: e.id,
      period,
      result,
      terms: clone(t),
      rules: clone(r),
    } as Payroll);
    return result;
  }
  return { e, t, r, input, previous, month };
}
describe("opt-in small annual salaries", () => {
  it("keeps the cumulative unemployment ceiling when the threshold is crossed", () => {
    const { month } = setup();
    month("2026-01", "2000");
    const feb = month("2026-02", "30000");
    expect(feb.avsBase).toBe(3200000);
    expect(feb.acBase).toBe(2470000);
    const mar = month("2026-03", "100");
    expect(mar.avsBase).toBe(10000);
    expect(mar.acBase).toBe(740000);
  });
  it("does not charge previously taxed wages twice when tracking starts midyear", () => {
    const { t, month } = setup();
    t.smallSalary!.enabled = false;
    month("2026-01", "2000");
    t.smallSalary!.enabled = true;
    const feb = month("2026-02", "1000");
    expect(feb.avsBase).toBe(100000);
    expect(feb.smallSalary?.catchUp).toBe(0);
  });
  it("exempts through exactly CHF 2500 and catches up the entire base once at 2500.01", () => {
    const { month } = setup();
    const jan = month("2026-01"),
      feb = month("2026-02");
    expect(jan.avsBase).toBe(0);
    expect(feb.smallSalary).toMatchObject({ cumulative: 250000, exempt: true });
    expect(feb.lines.find((l) => l.id === "avs")).toBeUndefined();
    expect(feb.lines.find((l) => l.id === "aap")?.employer).toBe(1250);
    expect(feb.lines.find((l) => l.id === "aanp")?.amount).toBe(1250);
    const mar = month("2026-03", "0.01");
    expect(mar.avsBase).toBe(250001);
    expect(mar.acBase).toBe(250001);
    expect(mar.smallSalary?.catchUp).toBe(250000);
    expect(mar.lines.find((l) => l.id === "avs")?.amount).toBe(13250);
    expect(mar.lines.find((l) => l.id === "ac")?.amount).toBe(2750);
    expect(mar.lines.find((l) => l.id === "af")?.employer).toBe(4500);
    expect(mar.errors).toEqual([]);
    const apr = month("2026-04", "100");
    expect(apr.avsBase).toBe(10000);
    expect(apr.smallSalary?.catchUp).toBe(0);
  });
  it.each(["domestic", "excluded", "requested", "disabled", "absent"])(
    "keeps ordinary contributions for %s",
    (mode) => {
      const { e, t, r, input } = setup();
      if (mode === "absent") delete t.smallSalary;
      else if (mode === "disabled") t.smallSalary!.enabled = false;
      else if (mode === "requested") t.smallSalary!.requested = true;
      else t.smallSalary!.activity = mode as "domestic" | "excluded";
      expect(calculate(e, t, r, input, "2026-01").avsBase).toBe(125000);
    },
  );
  it("includes allowances and bonuses but excludes reimbursed expenses", () => {
    const { e, t, r, input } = setup();
    t.mode = "hourly";
    t.salary = "24";
    input.hours = "100";
    t.vacation = true;
    t.vacationRate = "8.33";
    input.elements.push({
      id: "expense",
      kind: "adjustment",
      label: "Frais",
      amount: "500",
      quantity: "1",
      unit: "hours",
      rate: "0",
      premium: "0",
      paid: true,
      avs: true,
      laa: true,
      thirteen: false,
      reimbursement: true,
    });
    const result = calculate(e, t, r, input, "2026-01");
    expect(result.smallSalary?.cumulative).toBe(259992);
    expect(result.avsBase).toBe(259992);
    expect(result.reimbursements).toBe(50000);
    t.vacation = false;
    t.thirteen = true;
    t.thirteenMonth = 1;
    expect(calculate(e, t, r, input, "2026-01").smallSalary?.cumulative).toBe(
      260000,
    );
  });
  it("resets the annual counter and excludes other people and out-of-contract history", () => {
    const { e, t, r, input, previous, month } = setup();
    month("2026-01", "3000");
    e.start = "2025-01-01";
    r.year = 2025;
    t.salary = "100";
    expect(
      calculate(e, t, r, input, "2025-01", previous).smallSalary?.cumulative,
    ).toBe(10000);
    r.year = 2026;
    previous[0]!.employeeId = "other";
    expect(calculate(e, t, r, input, "2026-02", previous).avsBase).toBe(0);
    previous[0]!.employeeId = e.id;
    e.start = "2026-02-01";
    expect(
      calculate(e, t, r, input, "2026-02", previous).smallSalary?.cumulative,
    ).toBe(10000);
  });
  it("blocks an unknown activity, unverified year, conflicting retirement regime and changed catch-up rates", () => {
    const { e, t, r, input, month } = setup();
    t.smallSalary!.activity = "unknown";
    expect(calculate(e, t, r, input, "2026-01").errors).toContain(
      "smallSalaryActivityRequired",
    );
    t.smallSalary!.activity = "ordinary";
    r.year = 2027;
    expect(calculate(e, t, r, input, "2027-01").errors).toContain(
      "smallSalaryYearUnsupported",
    );
    r.year = 2026;
    t.avsStatus = "retired";
    expect(calculate(e, t, r, input, "2026-01").errors).toContain(
      "smallSalaryStatusConflict",
    );
    t.avsStatus = "standard";
    month("2026-01");
    r.contributions.find((c) => c.id === "avs")!.employee = "6";
    expect(month("2026-02", "1300").errors).toContain(
      "smallSalaryRatesChanged",
    );
  });
  it("recalculates a correction without changing payments or archived PDF snapshots", () => {
    const { e, r } = setup();
    const s = emptyState();
    s.employees = [e];
    s.rules = [r];
    for (const period of ["2026-01", "2026-02", "2026-03"])
      prepareMonth(s, period);
    refreshPayrolls(s);
    const jan = s.payrolls[0]!;
    jan.paidAmount = jan.result.net;
    jan.paidDate = "2026-01-31";
    s.revisions.push({
      id: "archive",
      payrollId: jan.id,
      number: 1,
      created: "2026-01-31",
      lang: "fr",
      snapshot: clone(jan),
      pdf: "immutable-pdf",
    });
    const revisions = clone(s.revisions),
      paid = jan.paidAmount;
    expect(s.payrolls[2]!.result.smallSalary?.catchUp).toBe(250000);
    e.terms[0]!.salary = "100";
    updateEmployee(s, e);
    expect(s.payrolls.every((p) => p.result.avsBase === 0)).toBe(true);
    expect(jan.paidAmount).toBe(paid);
    expect(jan.paymentReview).toBe(true);
    expect(s.revisions).toEqual(revisions);
    const once = clone(s);
    refreshPayrolls(s);
    expect(s).toEqual(once);
  });
  it("preserves historical V2 data without opting anyone in and roundtrips the optional policy", () => {
    const s = JSON.parse(
      readFileSync("tests/fixtures/data/model-v2.json", "utf8"),
    ) as State;
    const before = clone(s);
    upgradeState(s);
    expect(s).toEqual(before);
    expect(s.employees.every((e) => e.terms.every((t) => !t.smallSalary))).toBe(
      true,
    );
    s.employees[0]!.terms[0]!.smallSalary = {
      enabled: true,
      activity: "ordinary",
      requested: false,
    };
    const roundtrip = clone(s);
    upgradeState(roundtrip);
    expect(roundtrip).toEqual(s);
    expect(roundtrip.revisions).toEqual(before.revisions);
  });
});
