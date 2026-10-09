import { d, cents, francs, sum, Decimal } from "./money";
import type {
  Employee,
  Terms,
  Rules,
  Input,
  Calculation,
  Line,
  Payroll,
} from "./types";
export function monthBounds(period: string): [string, string] {
  const [y, m] = period.split("-").map(Number) as [number, number];
  return [
    `${period}-01`,
    `${period}-${new Date(Date.UTC(y, m, 0)).getUTCDate()}`,
  ];
}
export function activeIn(e: Employee, period: string): boolean {
  const [a, b] = monthBounds(period);
  return e.start <= b && (!e.end || e.end >= a);
}
export function calendarRatio(e: Employee, period: string): Decimal {
  const [a, b] = monthBounds(period);
  const start = e.start > a ? e.start : a,
    end = e.end && e.end < b ? e.end : b;
  return d(
    Math.max(0, (Date.parse(end) - Date.parse(start)) / 86400000 + 1),
  ).div(Number(b.slice(8)));
}
export function insuranceDays(
  e: Employee,
  year: number,
  month: number,
): number {
  let days = 0;
  for (let m = 1; m <= month; m++) {
    const p = `${year}-${String(m).padStart(2, "0")}`;
    if (!activeIn(e, p)) continue;
    const [a, b] = monthBounds(p);
    const normalizedDay = (date: string) =>
      m === 2 && Number(date.slice(8)) >= 28
        ? 30
        : Math.min(30, Number(date.slice(8)));
    const from = e.start > a ? normalizedDay(e.start) : 1;
    const to = e.end && e.end < b ? normalizedDay(e.end) : 30;
    days += Math.max(0, to - from + 1);
  }
  return days;
}
export function applicable<T extends { effective: string }>(
  versions: T[],
  period: string,
): T | undefined {
  return [...versions]
    .reverse()
    .filter((v) => v.effective <= period)
    .sort((a, b) => b.effective.localeCompare(a.effective))[0];
}
export function calculate(
  employee: Employee,
  terms: Terms,
  rules: Rules,
  input: Input,
  period: string,
  previous: Payroll[] = [],
): Calculation {
  const errors: string[] = [],
    warnings: string[] = [],
    lines: Line[] = [];
  const [year, month] = period.split("-").map(Number) as [number, number];
  const earlier = previous
    .filter(
      (p) =>
        p.employeeId === employee.id &&
        p.period.startsWith(String(year)) &&
        p.period < period,
    )
    .sort((a, b) => a.period.localeCompare(b.period));
  if (earlier.some((p) => p.result.errors.length > 0 || p.needsReview))
    errors.push("previousMonthsIncomplete");
  const numeric = (value: string | null, key: string, negative = false) => {
    if (value === null || value === "") {
      errors.push(key);
      return d(0);
    }
    try {
      const n = d(value);
      if (!negative && n.lt(0)) {
        errors.push(key);
        return d(0);
      }
      return n;
    } catch {
      errors.push(key);
      return d(0);
    }
  };
  if (rules.year !== year || !rules.verified) errors.push("yearNotVerified");
  if (!employee.birthDate) errors.push("birthRequired");
  if (terms.avsStatus !== "standard" && !terms.exemptionReason.trim())
    errors.push("exemptionReasonRequired");
  const age = year - Number(employee.birthDate.slice(0, 4));
  if (
    age >= 64 &&
    terms.avsStatus === "standard" &&
    !terms.exemptionReason.trim()
  )
    errors.push("referenceAgeReview");
  if (!activeIn(employee, period)) errors.push("outsideContract");
  const wage = numeric(terms.salary, "salaryRequired"),
    hours =
      terms.mode === "hourly" ? numeric(input.hours, "hoursRequired") : d(1);
  let ratio = calendarRatio(employee, period);
  if (input.prorata !== null && terms.mode === "monthly") {
    ratio = numeric(input.prorata, "prorataInvalid");
    if (ratio.gt(1)) errors.push("prorataInvalid");
    if (!input.prorataReason.trim()) errors.push("prorataReasonRequired");
  }
  const base = cents(
    terms.mode === "monthly" ? wage.mul(ratio) : wage.mul(hours),
  );
  const earning = (
    id: string,
    amount: number,
    baseValue: string,
    quantity: string,
    rate: string,
    origin = "contract",
    label = id,
  ) =>
    lines.push({
      id,
      label,
      amount,
      employer: 0,
      base: baseValue,
      quantity,
      rate,
      category: "earning",
      origin,
      ruleVersion: rules.id,
    });
  earning(
    terms.mode === "monthly" ? "monthlySalary" : "hourlySalary",
    base,
    terms.salary,
    terms.mode === "monthly" ? ratio.toFixed(8) : hours.toString(),
    terms.mode === "monthly" ? "" : terms.salary,
  );
  let avs = base,
    laa = base,
    thirteenBase = base,
    overtime = 0,
    absence = 0,
    reimbursements = 0;
  for (const el of input.elements) {
    let amount = 0;
    if (el.kind === "overtime") {
      amount = cents(
        numeric(el.quantity, "quantityInvalid")
          .mul(numeric(el.rate, "rateRequired"))
          .mul(d(1).plus(numeric(el.premium, "premiumRequired").div(100))),
      );
      overtime += amount;
    }
    if (el.kind === "absence") {
      numeric(el.quantity, "quantityInvalid");
      amount = el.paid
        ? 0
        : -cents(numeric(el.amount, "absenceAmountRequired"));
      absence += amount;
    }
    if (el.kind === "adjustment")
      amount = cents(numeric(el.amount, "adjustmentRequired", true));
    if (!el.label.trim()) errors.push("elementReasonRequired");
    earning(
      el.id,
      amount,
      el.kind === "overtime" ? el.rate : el.amount,
      el.quantity,
      el.kind === "overtime" ? el.premium : "",
      "manual",
      el.label,
    );
    if (el.reimbursement) {
      reimbursements += amount;
      continue;
    }
    if (el.avs) avs += amount;
    if (el.laa) laa += amount;
    if (el.thirteen || el.kind === "absence") thirteenBase += amount;
  }
  let holiday = 0,
    vacation = 0;
  if (terms.holiday || terms.vacation) {
    if (terms.mode !== "hourly") errors.push("hourlyOnly");
    warnings.push("contractAllowanceReview");
  }
  if (terms.holiday) {
    const b = base + (terms.holidayBase === "baseOvertime" ? overtime : 0);
    const rate = numeric(terms.holidayRate, "holidayRateRequired");
    holiday = cents(d(francs(b)).mul(rate).div(100));
    earning("holiday", holiday, francs(b), "1", rate.toString());
    avs += holiday;
    laa += holiday;
  }
  if (terms.vacation) {
    const b = base + (terms.vacationBase === "baseHoliday" ? holiday : 0);
    const rate = numeric(terms.vacationRate, "vacationRateRequired");
    vacation = cents(d(francs(b)).mul(rate).div(100));
    earning("vacation", vacation, francs(b), "1", rate.toString());
    avs += vacation;
    laa += vacation;
  }
  const salary = sum(lines.map((l) => l.amount)) - reimbursements;
  if (terms.thirteenBase === "salary") thirteenBase = salary;
  let accrual = d(0),
    thirteenPaid = 0,
    balance = d(0);
  if (terms.thirteen || earlier.some((p) => d(p.result.accrual).gt(0))) {
    accrual = terms.thirteen
      ? Decimal.max(0, d(francs(thirteenBase))).div(12)
      : d(0);
    const acquired = earlier.reduce(
      (a, p) => a.plus(p.result.accrual),
      accrual,
    );
    const paid = sum(earlier.map((p) => p.result.thirteenPaid));
    balance = acquired.minus(francs(paid));
    const leaving = !!employee.end && employee.end.slice(0, 7) === period;
    if (terms.thirteenMonth === 0 || terms.thirteenMonth === month || leaving) {
      thirteenPaid = cents(balance);
      if (thirteenPaid < 0) warnings.push("thirteenRecovery");
      earning(
        "thirteen",
        thirteenPaid,
        acquired.toFixed(8),
        "1",
        "",
        "contract",
      );
      avs += thirteenPaid;
      laa += thirteenPaid;
      balance = balance.minus(francs(thirteenPaid));
    }
  }
  if (terms.family)
    earning(
      "family",
      cents(numeric(terms.familyAmount, "familyRequired")),
      terms.familyAmount ?? "",
      "1",
      "",
      "contract",
    );
  const gross = sum(lines.map((l) => l.amount)) - reimbursements;
  if (salary < 0 || gross < 0) errors.push("negativeGross");
  const underage = Number.isFinite(age) && age < 18;
  if (underage || terms.avsStatus === "exempt") avs = 0;
  else if (terms.avsStatus === "retired") avs = Math.max(0, avs - 140000);
  const acEligible = !underage && terms.avsStatus === "standard";
  const acCum = sum(earlier.map((p) => p.result.avsBase)) + Math.max(0, avs);
  const cap = d(rules.acCap)
    .mul(insuranceDays(employee, year, month))
    .div(360);
  const acBase = acEligible
    ? cents(Decimal.min(d(francs(acCum)), cap)) -
      sum(earlier.map((p) => p.result.acBase))
    : 0;
  const laaCum =
    sum(earlier.map((p) => p.result.laaEarnings)) + Math.max(0, laa);
  const laaCap = d(rules.laaCap)
    .mul(insuranceDays(employee, year, month))
    .div(360);
  const laaBase =
    cents(Decimal.min(d(francs(laaCum)), laaCap)) -
    sum(earlier.map((p) => p.result.laaBase));
  const contributions = rules.contributions.map((c) => ({
    ...c,
    ...terms.overrides.find((o) => o.id === c.id),
  }));
  let avsContributions = 0;
  const weekly = numeric(terms.weeklyHours, "weeklyHoursRequired");
  const workDays = numeric(terms.workDays ?? "5", "quantityInvalid");
  if (workDays.lte(0) || workDays.gt(7)) errors.push("quantityInvalid");
  for (const c of contributions) {
    if (
      !c.active ||
      (c.id === "aanp" && weekly.lt(8)) ||
      ((c.id === "avs" || c.id === "ac") &&
        (underage || terms.avsStatus === "exempt")) ||
      (c.id === "ac" && !acEligible)
    )
      continue;
    const ee = numeric(c.employee, `missing:${c.label}:employee`),
      er = numeric(c.employer, `missing:${c.label}:employer`);
    const bases = {
      avs: Math.max(0, avs),
      ac: acBase,
      laa: laaBase,
      salary,
      gross,
      avsContributions,
    };
    const b = bases[c.base];
    const amount =
      c.kind === "fixed" ? cents(ee) : cents(d(francs(b)).mul(ee).div(100));
    const employer =
      c.kind === "fixed" ? cents(er) : cents(d(francs(b)).mul(er).div(100));
    if (c.id === "avs") avsContributions = amount + employer;
    lines.push({
      id: c.id,
      label: c.label,
      amount,
      employer,
      base: francs(b),
      quantity: "1",
      rate: ee.toString(),
      category: "contribution",
      origin: c.source,
      ruleVersion: rules.id,
    });
  }
  if (terms.lpp) {
    const amount = cents(numeric(terms.lppEmployee, "lppEmployeeRequired")),
      employer = cents(numeric(terms.lppEmployer, "lppEmployerRequired"));
    lines.push({
      id: "lpp",
      label: "lpp",
      amount,
      employer,
      base: "",
      quantity: "1",
      rate: "",
      category: "contribution",
      origin: "pensionStatement",
      ruleVersion: terms.id,
    });
  }
  const deductions = sum(
      lines.filter((l) => l.category === "contribution").map((l) => l.amount),
    ),
    employerCost = sum(lines.map((l) => l.employer));
  if (base + absence < 0) errors.push("absenceTooHigh");
  return {
    lines,
    gross,
    deductions,
    reimbursements,
    net: gross - deductions + reimbursements,
    employer: employerCost,
    cost: gross + employerCost + reimbursements,
    salary,
    avsBase: Math.max(0, avs),
    acBase,
    laaBase,
    laaEarnings: Math.max(0, laa),
    accrual: accrual.toFixed(12),
    thirteenPaid,
    thirteenBalance: balance.toFixed(12),
    errors: [...new Set(errors)],
    warnings: [...new Set(warnings)],
    prorata: ratio.toFixed(8),
  };
}
