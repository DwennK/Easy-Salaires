import { describe, it, expect } from "vitest";
import { calculate, insuranceDays, calendarRatio } from "../src/domain/payroll";
import { employeeDefaults, preset2026, clone } from "../src/domain/defaults";
import { cents, d } from "../src/domain/money";
import type { Input, Payroll } from "../src/domain/types";
function setup() {
  const e = employeeDefaults();
  e.start = "2026-01-01";
  e.birthDate = "1990-01-01";
  const t = e.terms[0]!;
  t.effective = "2026-01";
  t.salary = "3000";
  t.activity = "60";
  t.lppEmployee = "120";
  t.lppEmployer = "180";
  const r = preset2026();
  r.contributions.find((c) => c.id === "aap")!.employer = "0.8";
  r.contributions.find((c) => c.id === "aanp")!.employee = "1.2";
  const input: Input = {
    hours: null,
    elements: [],
    prorata: null,
    prorataReason: "",
    note: "",
  };
  return { e, t, r, input };
}
const prior = (
  e: ReturnType<typeof setup>["e"],
  period: string,
  result: ReturnType<typeof calculate>,
) => ({ employeeId: e.id, period, result }) as Payroll;
function element(overrides: Partial<Input["elements"][number]> = {}) {
  return {
    id: "x",
    kind: "overtime" as const,
    label: "Travail supplémentaire",
    quantity: "5",
    unit: "hours" as const,
    rate: "30",
    premium: "25",
    amount: "0",
    paid: false,
    avs: true,
    laa: true,
    thirteen: false,
    ...overrides,
  };
}
describe("Swiss payroll engine", () => {
  it("pays CHF 3000 at 60%, deducts once and excludes employee deductions from employer cost", () => {
    const { e, t, r, input } = setup();
    const x = calculate(e, t, r, input, "2026-01");
    expect(x.gross).toBe(300000);
    expect(x.lines.find((l) => l.id === "avs")?.amount).toBe(15900);
    expect(x.lines.find((l) => l.id === "ac")?.amount).toBe(3300);
    expect(x.net).toBe(265200);
    expect(x.cost).toBe(x.gross + x.employer);
    expect(x.lines.find((l) => l.id === "lpp")?.employer).toBe(18000);
    expect(x.errors).toEqual([]);
  });
  it("keeps overtime separate from regular hours and parses comma decimals", () => {
    const { e, t, r, input } = setup();
    t.mode = "hourly";
    t.salary = "30,50";
    input.hours = "100,5";
    input.elements = [element()];
    const x = calculate(e, t, r, input, "2026-01");
    expect(x.gross).toBe(325275);
    expect(x.lines[0]?.amount).toBe(306525);
  });
  it("distinguishes missing hours from confirmed zero", () => {
    const { e, t, r, input } = setup();
    t.mode = "hourly";
    expect(calculate(e, t, r, input, "2026-01").errors).toContain(
      "hoursRequired",
    );
    input.hours = "0";
    expect(calculate(e, t, r, input, "2026-01").errors).not.toContain(
      "hoursRequired",
    );
  });
  it("rounds decimals half up to cents without cash rounding", () => {
    expect(cents(d("1.005"))).toBe(101);
    expect(cents(d("-1.005"))).toBe(-101);
    expect(cents(d("1,03"))).toBe(103);
  });
  it("excludes family benefits from contribution bases but includes them in gross", () => {
    const { e, t, r, input } = setup();
    t.family = true;
    t.familyAmount = "250";
    const x = calculate(e, t, r, input, "2026-01");
    expect(x.gross).toBe(325000);
    expect(x.avsBase).toBe(300000);
    expect(x.laaBase).toBe(300000);
    expect(x.net).toBe(290200);
  });
  it("calculates administration on total OASI contributions", () => {
    const { e, t, r, input } = setup();
    const x = calculate(e, t, r, input, "2026-01");
    expect(x.lines.find((l) => l.id === "admin")?.base).toBe("318.00");
    expect(x.lines.find((l) => l.id === "admin")?.employer).toBe(572);
  });
  it("requires active contractual rates, but not disabled ones", () => {
    const { e, t, r, input } = setup();
    r.contributions.find((c) => c.id === "aap")!.employer = null;
    expect(calculate(e, t, r, input, "2026-01").errors).toContain(
      "missing:aap:employer",
    );
    r.contributions.find((c) => c.id === "aap")!.active = false;
    expect(calculate(e, t, r, input, "2026-01").errors).toEqual([]);
  });
  it("does not charge non-occupational accident below 8 hours", () => {
    const { e, t, r, input } = setup();
    t.weeklyHours = "7.9";
    r.contributions.find((c) => c.id === "aanp")!.employee = null;
    const x = calculate(e, t, r, input, "2026-01");
    expect(x.lines.some((l) => l.id === "aanp")).toBe(false);
    expect(x.errors).toEqual([]);
  });
  it("does not infer an exemption from owner label", () => {
    const { e, t, r, input } = setup();
    const a = calculate(e, t, r, input, "2026-01");
    e.role = "owner";
    expect(calculate(e, t, r, input, "2026-01")).toEqual(a);
  });
  it("applies automatic minor OASI exclusion, keeps accident insurance", () => {
    const { e, t, r, input } = setup();
    e.birthDate = "2010-01-01";
    const x = calculate(e, t, r, input, "2026-01");
    expect(x.avsBase).toBe(0);
    expect(x.acBase).toBe(0);
    expect(x.laaBase).toBe(300000);
    expect(x.lines.some((l) => l.id === "avs")).toBe(false);
  });
  it("keeps LAA earnings distinct from OASI retirement allowance", () => {
    const { e, t, r, input } = setup();
    e.birthDate = "1950-01-01";
    t.avsStatus = "retired";
    t.exemptionReason = "Caisse";
    const x = calculate(e, t, r, input, "2026-01");
    expect(x.avsBase).toBe(160000);
    expect(x.acBase).toBe(0);
    expect(x.laaBase).toBe(300000);
  });
  it("caps contributions cumulatively with catch-up for variable salary", () => {
    const { e, t, r, input } = setup();
    t.salary = "20000";
    const jan = calculate(e, t, r, input, "2026-01");
    expect(jan.acBase).toBe(1235000);
    expect(jan.laaBase).toBe(1235000);
    t.salary = "5000";
    const feb = calculate(e, t, r, input, "2026-02", [
      prior(e, "2026-01", jan),
    ]);
    expect(feb.acBase).toBe(1235000);
    expect(jan.acBase + feb.acBase).toBe(2470000);
  });
  it("keeps LAA adjustments out of future cumulative base", () => {
    const { e, t, r, input } = setup();
    input.elements = [
      element({ kind: "adjustment", amount: "1000", laa: false }),
    ];
    const jan = calculate(e, t, r, input, "2026-01");
    input.elements = [];
    const feb = calculate(e, t, r, input, "2026-02", [
      prior(e, "2026-01", jan),
    ]);
    expect(feb.laaBase).toBe(300000);
    expect(feb.acBase).toBe(300000);
  });
  it("matches official AC employment example 15 Apr to 29 Dec, 255 days", () => {
    const { e } = setup();
    e.start = "2026-04-15";
    e.end = "2026-12-29";
    expect(insuranceDays(e, 2026, 12)).toBe(255);
    expect(d("148200").mul(255).div(360).toString()).toBe("104975");
  });
  it("prorates inclusively and handles leap February without re-prorating hours or pensions", () => {
    const { e, t, r, input } = setup();
    e.start = "2024-02-15";
    e.end = "2024-02-29";
    expect(calendarRatio(e, "2024-02").toNumber()).toBe(15 / 29);
    r.year = 2024;
    t.salary = "2900";
    const x = calculate(e, t, r, input, "2024-02");
    expect(x.gross).toBe(150000);
    expect(x.lines.find((l) => l.id === "lpp")?.amount).toBe(12000);
    t.mode = "hourly";
    t.salary = "30";
    input.hours = "10";
    expect(calculate(e, t, r, input, "2024-02").gross).toBe(30000);
  });
  it("requires a reason for manual proration", () => {
    const { e, t, r, input } = setup();
    input.prorata = "0.5";
    expect(calculate(e, t, r, input, "2026-01").errors).toContain(
      "prorataReasonRequired",
    );
    input.prorataReason = "Convention";
    expect(calculate(e, t, r, input, "2026-01").gross).toBe(150000);
  });
  it("paid sickness has no automatic deduction", () => {
    const { e, t, r, input } = setup();
    input.elements = [
      element({ kind: "absence", label: "Maladie", paid: true, amount: "" }),
    ];
    expect(calculate(e, t, r, input, "2026-01").gross).toBe(300000);
  });
  it("uses an explicit unpaid absence amount and lowers entitlement", () => {
    const { e, t, r, input } = setup();
    t.thirteen = true;
    input.elements = [
      element({
        kind: "absence",
        label: "Congé non payé",
        paid: false,
        amount: "300",
      }),
    ];
    const x = calculate(e, t, r, input, "2026-01");
    expect(x.gross).toBe(270000);
    expect(d(x.accrual).toNumber()).toBe(225);
  });
  it("uses separate configurable holiday bases without including family or 13th", () => {
    const { e, t, r, input } = setup();
    t.mode = "hourly";
    t.salary = "30";
    input.hours = "100";
    t.holiday = true;
    t.holidayRate = "3";
    t.vacation = true;
    t.vacationRate = "8.33";
    t.vacationBase = "baseHoliday";
    const x = calculate(e, t, r, input, "2026-01");
    expect(x.lines.find((l) => l.id === "holiday")?.amount).toBe(9000);
    expect(x.lines.find((l) => l.id === "vacation")?.amount).toBe(25740);
  });
  it.each([0, 12])(
    "accrues and pays exactly one 13th salary (payment month %s)",
    (paymentMonth) => {
      const { e, t, r, input } = setup();
      t.thirteen = true;
      t.thirteenMonth = paymentMonth;
      const ps: Payroll[] = [];
      for (let m = 1; m <= 12; m++) {
        const p = `2026-${String(m).padStart(2, "0")}`;
        ps.push(prior(e, p, calculate(e, t, r, input, p, ps)));
      }
      expect(ps.reduce((a, p) => a + p.result.thirteenPaid, 0)).toBe(300000);
      expect(d(ps.at(-1)!.result.thirteenBalance).abs().lt(".01")).toBe(true);
      const last = calculate(e, t, r, input, "2026-12", ps);
      expect(last.thirteenPaid).toBe(ps.at(-1)!.result.thirteenPaid);
    },
  );
  it("settles 13th salary on leaving, with partial months", () => {
    const { e, t, r, input } = setup();
    e.start = "2026-01-16";
    e.end = "2026-02-28";
    t.thirteen = true;
    const jan = calculate(e, t, r, input, "2026-01");
    const feb = calculate(e, t, r, input, "2026-02", [
      prior(e, "2026-01", jan),
    ]);
    expect(feb.thirteenPaid).toBe(cents(d(jan.accrual).plus(250)));
    expect(d(feb.thirteenBalance).abs().lt(".01")).toBe(true);
  });
  it("does not silently reuse an old preset", () => {
    const { e, t, r, input } = setup();
    expect(calculate(e, t, r, input, "2027-01").errors).toContain(
      "yearNotVerified",
    );
  });
  it("is pure and repeatable", () => {
    const { e, t, r, input } = setup();
    const original = clone({ e, t, r, input });
    expect(calculate(e, t, r, input, "2026-01")).toEqual(
      calculate(e, t, r, input, "2026-01"),
    );
    expect({ e, t, r, input }).toEqual(original);
  });
});
