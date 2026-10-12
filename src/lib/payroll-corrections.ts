import type { Payroll, Terms } from "../domain/types";
import { d } from "../domain/money";
import { validAmount } from "./ux";

export interface PayrollCorrection {
  surface: "employee" | "payroll" | "settings" | "earlier";
  field: string;
  tab?: string;
}

const termFields: Record<string, [keyof Terms, string]> = {
  lppEmployeeRequired: ["lppEmployee", "insurance"],
  lppEmployerRequired: ["lppEmployer", "insurance"],
  exemptionReasonRequired: ["exemptionReason", "insurance"],
  referenceAgeReview: ["exemptionReason", "insurance"],
  salaryRequired: ["salary", "contract"],
  weeklyHoursRequired: ["weeklyHours", "contract"],
  familyRequired: ["familyAmount", "contract"],
  holidayRateRequired: ["holidayRate", "contract"],
  vacationRateRequired: ["vacationRate", "contract"],
  hourlyOnly: ["mode", "contract"],
};

/** Navigation only: never modifies payroll or company data. */
export function payrollCorrection(
  error: string,
  p?: Payroll,
  inPayroll = false,
): PayrollCorrection {
  if (error === "previousMonthsIncomplete")
    return { surface: "earlier", field: "" };
  if (error === "yearNotVerified")
    return { surface: "settings", tab: "rules", field: "yearVerification" };
  if (error === "birthRequired")
    return { surface: "employee", tab: "identity", field: "birthDate" };
  if (error === "outsideContract")
    return { surface: "employee", tab: "contract", field: "start" };
  if (error.startsWith("missing:")) {
    const [, label, side] = error.split(":");
    const c = p?.rules.contributions.find((c) => c.label === label);
    const overridden =
      c &&
      p?.terms.overrides.some((o) => o.id === c.id && Object.hasOwn(o, side!));
    if (overridden)
      return {
        surface:
          inPayroll || p?.termOverrides?.overrides ? "payroll" : "employee",
        tab: "insurance",
        field: `contribution:${c.id}:${side}`,
      };
    return {
      surface: "settings",
      tab: "rules",
      field: `contribution:${c?.id ?? label}:${side}`,
    };
  }
  let term = termFields[error];
  if (
    error === "quantityInvalid" &&
    p &&
    (!validAmount(p.terms.workDays ?? "5", true) ||
      Number(p.terms.workDays) > 7)
  )
    term = ["workDays", "contract"];
  if (term)
    return {
      surface:
        inPayroll ||
        (p?.termOverrides && Object.hasOwn(p.termOverrides, term[0]))
          ? "payroll"
          : "employee",
      field: term[0],
      tab: term[1],
    };
  const simple: Record<string, string> = {
    hoursRequired: "hours",
    prorataInvalid: "prorata",
    prorataReasonRequired: "prorataReason",
  };
  if (simple[error]) return { surface: "payroll", field: simple[error] };
  const elementFields: Record<string, string> = {
    quantityInvalid: "quantity",
    rateRequired: "rate",
    premiumRequired: "premium",
    absenceAmountRequired: "amount",
    adjustmentRequired: "amount",
    elementReasonRequired: "label",
    absenceTooHigh: "amount",
    negativeGross: "amount",
  };
  const field = elementFields[error];
  const element = p?.input.elements.find((el) => {
    if (error === "elementReasonRequired") return !el.label.trim();
    if (error === "absenceTooHigh" || error === "absenceAmountRequired")
      return (
        el.kind === "absence" &&
        !el.paid &&
        (error === "absenceTooHigh" || !validAmount(el.amount))
      );
    if (error === "negativeGross")
      return el.kind === "adjustment" && Number(el.amount) < 0;
    if (error === "adjustmentRequired" && el.kind === "adjustment") {
      if (!el.amount.trim()) return true;
      try {
        d(el.amount);
        return false;
      } catch {
        return true;
      }
    }
    if (error === "quantityInvalid")
      return el.kind !== "adjustment" && !validAmount(el.quantity);
    if (error === "rateRequired" || error === "premiumRequired")
      return (
        el.kind === "overtime" && !validAmount(el[field as "rate" | "premium"])
      );
    return false;
  });
  return {
    surface: "payroll",
    field: element ? `element:${element.id}:${field}` : "extras",
  };
}

/** Reveal collapsed ancestors before focusing, including nested advanced fields. */
export function focusCorrection(root: HTMLElement | null, field: string) {
  if (!root || !field) return;
  const target = [
    ...root.querySelectorAll<HTMLElement>("[data-correction]"),
  ].find((el) => el.dataset.correction === field);
  if (!target) return;
  for (
    let parent = target.parentElement;
    parent && parent !== root;
    parent = parent.parentElement
  )
    if (parent instanceof HTMLDetailsElement) parent.open = true;
  if (target instanceof HTMLDetailsElement) target.open = true;
  const control = target.matches("input, select, button, summary")
    ? target
    : target.querySelector<HTMLElement>("input, select, button, summary");
  (control ?? target).focus({ preventScroll: true });
  target.scrollIntoView({ block: "center", behavior: "instant" });
}
