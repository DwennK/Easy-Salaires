import type { Contribution, Rules, State, Payroll } from "../domain/types";
import { d } from "../domain/money";
import { applicable } from "../domain/payroll";
import { missingEarlier } from "../domain/service";
export function availableYears(
  s: State | null,
  selectedYear: number,
  currentYear = new Date().getFullYear(),
): number[] {
  const known = [
    currentYear,
    selectedYear - 1,
    selectedYear,
    selectedYear + 1,
    ...(s?.employees.flatMap((e) => [
      Number(e.start.slice(0, 4)),
      Number(e.end.slice(0, 4)),
      ...e.terms.map((t) => Number(t.effective.slice(0, 4))),
    ]) ?? []),
    ...(s?.rules.map((r) => r.year) ?? []),
    ...(s?.payrolls.map((p) => Number(p.period.slice(0, 4))) ?? []),
    ...(s?.exports.map((e) => e.year) ?? []),
  ].filter((y) => Number.isInteger(y) && y >= 1000 && y <= 9999);
  // Include intervening years even when no payslip has been prepared yet.
  const first = Math.min(...known);
  return Array.from(
    { length: Math.max(...known) - first + 1 },
    (_, i) => first + i,
  );
}
export const isMissing = (v: string | null) => v === null || v.trim() === "";
export const missingRates = (items: Contribution[]) =>
  items
    .filter((c) => c.active)
    .reduce(
      (n, c) =>
        n + Number(isMissing(c.employee)) + Number(isMissing(c.employer)),
      0,
    );
export function validAmount(value: string | null, positive = false) {
  if (isMissing(value)) return false;
  try {
    return positive ? d(value!).gt(0) : d(value!).gte(0);
  } catch {
    return false;
  }
}
export function rulesReady(r?: Rules): boolean {
  return (
    !!r &&
    r.verified &&
    validAmount(r.acCap, true) &&
    validAmount(r.laaCap, true) &&
    r.contributions
      .filter((c) => c.active)
      .every((c) => validAmount(c.employee) && validAmount(c.employer))
  );
}
export const addressReady = (c: {
  name?: string;
  address: string;
  postal: string;
  city: string;
}) => [c.address, c.postal, c.city].every((v) => !!v.trim());
export function setupState(s: State, period: string) {
  const rules = applicable(
    s.rules.filter((r) => r.year === Number(period.slice(0, 4))),
    period,
  );
  return [
    !!s.company.name.trim() && addressReady(s.company),
    rulesReady(rules),
    s.employees.some((e) => !e.archived),
    s.payrolls.some((p) => p.issued),
  ];
}
export function payrollAction(s: State, p: Payroll): string {
  if (p.needsReview) return "reviewPayslip";
  if (p.result.errors.includes("hoursRequired")) return "enterHours";
  if (
    p.result.errors.length ||
    !addressReady(p.company) ||
    !addressReady(p.employee)
  )
    return "completePayslip";
  if (missingEarlier(s, p).length) return "previousMonths";
  if (!p.issued) return "reviewPayslip";
  if (!p.paidDate) return "recordPayment";
  return "viewPayslip";
}
