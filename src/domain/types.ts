export type Lang = "fr" | "en";
export type Base =
  "avs" | "ac" | "laa" | "salary" | "gross" | "avsContributions";
export interface Source {
  url: string;
  year: number;
  verified: string;
}
export interface Contribution {
  id: string;
  label: string;
  active: boolean;
  kind: "percent" | "fixed";
  base: Base;
  employee: string | null;
  employer: string | null;
  source: string;
}
export interface Rules {
  id: string;
  year: number;
  effective: string;
  verified: boolean;
  sources: Source[];
  acCap: string;
  laaCap: string;
  contributions: Contribution[];
}
export interface Terms {
  id: string;
  effective: string;
  mode: "monthly" | "hourly";
  salary: string;
  activity: string;
  weeklyHours: string;
  workDays: string;
  avsStatus: "standard" | "exempt" | "retired" | "retiredWaiver";
  exemptionReason: string;
  lpp: boolean;
  lppEmployee: string | null;
  lppEmployer: string | null;
  thirteen: boolean;
  thirteenMonth: number;
  thirteenBase: "base" | "salary";
  family: boolean;
  familyAmount: string | null;
  vacation: boolean;
  vacationRate: string | null;
  vacationBase: "base" | "baseHoliday";
  holiday: boolean;
  holidayRate: string | null;
  holidayBase: "base" | "baseOvertime";
  overrides: ({ id: string } & Partial<Contribution>)[];
}
export interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  address: string;
  postal: string;
  city: string;
  birthDate: string;
  avs: string;
  iban: string;
  start: string;
  end: string;
  role: "employee" | "owner";
  archived: boolean;
  terms: Terms[];
}
export interface Company {
  /** Persisted in the existing company JSON; no SQL schema rewrite. */
  modelVersion?: number;
  /** Persisted with the company in both SQLite and browser demo storage. */
  demoHistoryVersion?: number;
  name: string;
  address: string;
  postal: string;
  city: string;
  canton: string;
  country: string;
  uid: string;
  contact: string;
  responsible: string;
  footer: string;
  logo: string;
  lang: Lang;
  demo: boolean;
}
export interface Element {
  reimbursement?: boolean;
  id: string;
  kind: "overtime" | "absence" | "adjustment";
  label: string;
  quantity: string;
  unit: "hours" | "days";
  rate: string;
  premium: string;
  amount: string;
  paid: boolean;
  avs: boolean;
  laa: boolean;
  thirteen: boolean;
}
export interface Input {
  hours: string | null;
  elements: Element[];
  prorata: string | null;
  prorataReason: string;
  note: string;
}
export interface Line {
  id: string;
  label: string;
  base: string;
  quantity: string;
  rate: string;
  amount: number;
  employer: number;
  category: "earning" | "contribution";
  origin: string;
  ruleVersion: string;
}
export interface Calculation {
  reimbursements?: number;
  lines: Line[];
  gross: number;
  deductions: number;
  net: number;
  employer: number;
  cost: number;
  salary: number;
  avsBase: number;
  acBase: number;
  laaBase: number;
  laaEarnings: number;
  accrual: string;
  thirteenPaid: number;
  thirteenBalance: string;
  errors: string[];
  warnings: string[];
  prorata: string;
}
export interface Payroll {
  id: string;
  employeeId: string;
  period: string;
  employee: Employee;
  company: Company;
  terms: Terms;
  rules: Rules;
  input: Input;
  result: Calculation;
  paidDate: string;
  /** Actual amount recorded, in cents. Independent of the calculated net. */
  paidAmount?: number | null;
  /** Explicit exceptions for this month; all other terms inherit the employee. */
  termOverrides?: Partial<Terms>;
  paymentReview: boolean;
  needsReview: boolean;
  issued: boolean;
  updated: string;
}
export interface Revision {
  id: string;
  payrollId: string;
  number: number;
  created: string;
  lang: Lang;
  snapshot: Payroll;
  pdf: string;
}
export interface AnnualExport {
  id: string;
  year: number;
  employeeId: string;
  created: string;
  kind: string;
  stale: boolean;
  data: string;
  name: string;
}
export interface State {
  dataModel?: number;
  company: Company;
  employees: Employee[];
  rules: Rules[];
  payrolls: Payroll[];
  revisions: Revision[];
  exports: AnnualExport[];
  version: number;
}
