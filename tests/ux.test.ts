import { describe, it, expect } from "vitest";
import { computed, ref } from "vue";
import { emptyState, prepareMonth } from "../src/domain/service";
import { employeeDefaults, preset2026 } from "../src/domain/defaults";
import {
  missingRates,
  rulesReady,
  setupState,
  payrollAction,
  availableYears,
} from "../src/lib/ux";
import { calculate } from "../src/domain/payroll";
describe("payroll year navigation", () => {
  it("updates immediately after backdating an employee, without any payslips", () => {
    const s = ref(emptyState());
    const e = employeeDefaults();
    e.start = "2026-01-01";
    e.terms[0]!.effective = "2026-01";
    s.value.employees.push(e);
    const years = computed(() => availableYears(s.value, 2026, 2026));
    expect(years.value).not.toContain(2022);
    s.value.employees[0]!.start = "2022-06-01";
    expect(years.value).toEqual([2022, 2023, 2024, 2025, 2026, 2027]);
    expect(s.value.payrolls).toEqual([]);
  });
  it("allows navigation in both directions without employees or payrolls", () => {
    expect(availableYears(null, 2026, 2026)).toEqual([2025, 2026, 2027]);
    expect(availableYears(null, 2025, 2026)).toEqual([2024, 2025, 2026]);
    expect(availableYears(null, 2027, 2026)).toEqual([2026, 2027, 2028]);
  });
  it("keeps configured and historical years, including archived employees", () => {
    const s = emptyState();
    const e = employeeDefaults();
    Object.assign(e, {
      start: "2020-01-01",
      end: "2021-12-31",
      archived: true,
    });
    e.terms[0]!.effective = "2020-01";
    s.employees.push(e);
    s.rules.push({ ...preset2026(), year: 2029, effective: "2029-01" });
    expect(availableYears(s, 2026, 2026)).toEqual([
      2020, 2021, 2022, 2023, 2024, 2025, 2026, 2027, 2028, 2029,
    ]);
  });
  it("does not configure or prepare an unconfigured year when listing it", () => {
    const s = emptyState();
    const before = JSON.stringify(s);
    expect(availableYears(s, 2026, 2026)).toContain(2025);
    expect(JSON.stringify(s)).toBe(before);
    expect(() => prepareMonth(s, "2025-01")).toThrow("yearNotVerified");
  });
});
describe("guided payroll readiness", () => {
  it("distinguishes absent rates, zero rates and inactive contributions", () => {
    const r = preset2026();
    expect(missingRates(r.contributions)).toBe(2);
    r.contributions.find((c) => c.id === "aap")!.employer = "0";
    expect(missingRates(r.contributions)).toBe(1);
    r.contributions.find((c) => c.id === "aanp")!.employee = "0";
    expect(missingRates(r.contributions)).toBe(0);
    expect(rulesReady(r)).toBe(true);
    r.contributions.find((c) => c.id === "aanp")!.employee = "-1";
    expect(rulesReady(r)).toBe(false);
  });
  it("never treats an unverified year as ready, even with filled rates", () => {
    const r = preset2026();
    r.contributions.forEach((c) => {
      c.employee = "0";
      c.employer = "0";
    });
    r.verified = false;
    expect(rulesReady(r)).toBe(false);
    const s = emptyState();
    s.rules = [r];
    expect(setupState(s, "2026-01")[1]).toBe(false);
    r.verified = true;
    expect(setupState(s, "2027-01")[1]).toBe(false);
  });
  it("resumes company setup from persisted details", () => {
    const s = emptyState();
    s.company.name = "Example";
    expect(setupState(s, "2026-01")[0]).toBe(false);
    Object.assign(s.company, {
      address: "Rue 1",
      postal: "2000",
      city: "Neuchâtel",
    });
    expect(setupState(s, "2026-01")[0]).toBe(true);
    s.company.address = "   ";
    expect(setupState(s, "2026-01")[0]).toBe(false);
  });
  it("guides missing hours, prior months, issue, payment and corrections separately", () => {
    const s = emptyState();
    Object.assign(s.company, {
      name: "Example",
      address: "Rue 1",
      postal: "2000",
      city: "Neuchâtel",
    });
    s.rules[0]!.contributions.forEach((c) => {
      c.employee = "0";
      c.employer = "0";
    });
    const e = employeeDefaults();
    Object.assign(e, {
      firstName: "Test",
      lastName: "Person",
      birthDate: "1994-01-01",
      start: "2026-01-01",
      address: "Rue 2",
      postal: "2000",
      city: "Neuchâtel",
    });
    Object.assign(e.terms[0]!, {
      effective: "2026-01",
      mode: "hourly",
      salary: "30",
      lpp: false,
    });
    s.employees.push(e);
    prepareMonth(s, "2026-02");
    const p = s.payrolls[0]!;
    expect(payrollAction(s, p)).toBe("enterHours");
    p.input.hours = "0";
    p.result = calculate(
      p.employee,
      p.terms,
      p.rules,
      p.input,
      p.period,
      s.payrolls,
    );
    expect(payrollAction(s, p)).toBe("previousMonths");
    p.period = "2026-01";
    expect(payrollAction(s, p)).toBe("reviewPayslip");
    p.issued = true;
    expect(payrollAction(s, p)).toBe("recordPayment");
    p.paidDate = "2026-01-31";
    expect(payrollAction(s, p)).toBe("viewPayslip");
    p.needsReview = true;
    expect(payrollAction(s, p)).toBe("reviewPayslip");
  });
});
