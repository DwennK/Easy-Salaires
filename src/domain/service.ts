import type { State, Employee, Payroll, Rules, Terms, Revision } from "./types";
import { clone, companyDefaults, preset2026, uid } from "./defaults";
import { activeIn, applicable, calculate } from "./payroll";
import { cents, d } from "./money";
export const emptyState = (): State => ({
  company: companyDefaults(),
  employees: [],
  rules: [preset2026()],
  payrolls: [],
  revisions: [],
  exports: [],
  version: 0,
});
export function prepareMonth(
  s: State,
  period: string,
  employeeId = "",
): number {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new Error("invalidPeriod");
  const rules = applicable(
    s.rules.filter((r) => r.year === Number(period.slice(0, 4))),
    period,
  );
  if (!rules) throw new Error("yearNotVerified");
  let count = 0;
  for (const employee of s.employees) {
    if (
      (employeeId && employee.id !== employeeId) ||
      employee.archived ||
      !activeIn(employee, period) ||
      s.payrolls.some(
        (p) => p.employeeId === employee.id && p.period === period,
      )
    )
      continue;
    const terms = applicable(employee.terms, period);
    if (!terms) continue;
    const input = {
      hours: null,
      elements: [],
      prorata: null,
      prorataReason: "",
      note: "",
    };
    const p: Payroll = {
      id: uid(),
      employeeId: employee.id,
      period,
      employee: clone(employee),
      company: clone(s.company),
      terms: clone(terms),
      rules: clone(rules),
      input,
      result: calculate(employee, terms, rules, input, period, s.payrolls),
      paidDate: "",
      paidAmount: null,
      termOverrides: {},
      paymentReview: false,
      needsReview: false,
      issued: false,
      updated: new Date().toISOString(),
    };
    s.payrolls.push(p);
    count++;
  }
  return count;
}
export function missingEarlier(s: State, p: Payroll): string[] {
  const result: string[] = [];
  for (let m = 1; m < Number(p.period.slice(5)); m++) {
    const period = `${p.period.slice(0, 4)}-${String(m).padStart(2, "0")}`;
    if (!activeIn(p.employee, period)) continue;
    const old = s.payrolls.find(
      (x) => x.employeeId === p.employeeId && x.period === period,
    );
    if (!old || old.result.errors.length || old.needsReview)
      result.push(period);
  }
  return result;
}
/** Only explicitly edited monthly fields are detached from employee defaults. */
export function termsDiff(base: Terms, edited: Terms): Partial<Terms> {
  return Object.fromEntries(
    Object.entries(edited).filter(
      ([key, value]) =>
        !["id", "effective"].includes(key) &&
        JSON.stringify(value) !== JSON.stringify(base[key as keyof Terms]),
    ),
  ) as Partial<Terms>;
}
function staleExports(s: State, employeeId: string, year: number) {
  for (const exp of s.exports)
    if (exp.year === year && (!exp.employeeId || exp.employeeId === employeeId))
      exp.stale = true;
}
function stable(value: unknown): string {
  return JSON.stringify(value, (_key, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v).sort(([a], [b]) => a.localeCompare(b)),
        )
      : v,
  );
}
function documentData(p: Payroll) {
  const { terms: _terms, archived: _archived, ...identity } = p.employee;
  const { modelVersion: _modelVersion, ...company } = p.company;
  return stable([
    identity,
    company,
    p.terms,
    p.rules,
    p.input,
    { ...p.result, reimbursements: p.result.reimbursements ?? 0 },
  ]);
}
/** Recalculate in chronological order so annual ceilings and the 13th salary stay coherent. */
export function refreshPayrolls(s: State, employeeId = "", year?: number) {
  for (const p of [...s.payrolls].sort((a, b) =>
    a.period.localeCompare(b.period),
  )) {
    if (
      (employeeId && p.employeeId !== employeeId) ||
      (year && !p.period.startsWith(String(year)))
    )
      continue;
    const e = s.employees.find((e) => e.id === p.employeeId);
    if (!e) continue;
    const before = documentData(p);
    const terms = applicable(e.terms, p.period);
    const rules = applicable(
      s.rules.filter((r) => r.year === Number(p.period.slice(0, 4))),
      p.period,
    );
    p.employee = clone(e);
    p.company = clone(s.company);
    if (terms) p.terms = { ...clone(terms), ...clone(p.termOverrides ?? {}) };
    if (rules) p.rules = clone(rules);
    p.result = calculate(
      p.employee,
      p.terms,
      p.rules,
      p.input,
      p.period,
      s.payrolls,
    );
    p.needsReview = false;
    p.paymentReview =
      p.paidAmount != null &&
      (p.result.errors.length > 0 || p.paidAmount !== p.result.net);
    if (before !== documentData(p)) {
      p.issued = false;
      p.updated = new Date().toISOString();
      staleExports(s, p.employeeId, Number(p.period.slice(0, 4)));
    }
  }
}
/** Additive upgrade: original PDF revisions and their snapshots are never changed. */
function narrowOverrides(terms: Terms, rules: Rules | undefined): Terms {
  const next = clone(terms);
  if (!rules) return next;
  next.overrides = next.overrides
    .map((o) => {
      const base = rules.contributions.find((c) => c.id === o.id);
      return Object.fromEntries(
        Object.entries(o).filter(
          ([key, value]) =>
            key === "id" ||
            !base ||
            JSON.stringify(value) !==
              JSON.stringify(base[key as keyof typeof base]),
        ),
      ) as Terms["overrides"][number];
    })
    .filter((o) => Object.keys(o).length > 1);
  return next;
}
export function upgradeState(s: State): State {
  if (s.dataModel === 2 || s.company.modelVersion === 2) {
    s.dataModel = 2;
    return s;
  }
  for (const p of s.payrolls) {
    const e = s.employees.find((e) => e.id === p.employeeId);
    const original =
      p.employee.terms.find((t) => t.id === p.terms.id) ??
      (e && applicable(e.terms, p.period));
    if (p.termOverrides === undefined) {
      p.terms = narrowOverrides(p.terms, p.rules);
      p.termOverrides = original
        ? termsDiff(narrowOverrides(original, p.rules), p.terms)
        : clone(p.terms);
    }
    p.paidAmount ??= p.paidDate ? p.result.net : null;
  }
  for (const e of s.employees)
    e.terms = e.terms.map((t) =>
      narrowOverrides(
        t,
        applicable(
          s.rules.filter((r) => r.year === Number(t.effective.slice(0, 4))),
          t.effective,
        ),
      ),
    );
  s.dataModel = 2;
  s.company.modelVersion = 2;
  refreshPayrolls(s);
  return s;
}
export function savePayroll(s: State, draft: Payroll): Payroll {
  const i = s.payrolls.findIndex((p) => p.id === draft.id);
  if (i < 0) throw new Error("notFound");
  const old = s.payrolls[i]!;
  const p = clone(draft);
  const employee = s.employees.find((e) => e.id === p.employeeId)!;
  const defaults = applicable(employee.terms, p.period);
  p.termOverrides = defaults ? termsDiff(defaults, p.terms) : p.termOverrides;
  // A monthly edit must never rewrite an already recorded payment.
  p.paidDate = old.paidDate;
  p.paidAmount = old.paidAmount ?? (old.paidDate ? old.result.net : null);
  p.issued = old.issued && documentData(old) === documentData(p);
  p.updated = new Date().toISOString();
  if (documentData(old) !== documentData(p))
    staleExports(s, p.employeeId, Number(p.period.slice(0, 4)));
  s.payrolls[i] = p;
  refreshPayrolls(s, p.employeeId, Number(p.period.slice(0, 4)));
  return p;
}
/** Preparing a selected month also resolves earlier default salaries used by cumulative calculations. */
export function ensurePayroll(
  s: State,
  employeeId: string,
  period: string,
): Payroll {
  for (let m = 1; m <= Number(period.slice(5)); m++)
    prepareMonth(
      s,
      `${period.slice(0, 4)}-${String(m).padStart(2, "0")}`,
      employeeId,
    );
  refreshPayrolls(s, employeeId, Number(period.slice(0, 4)));
  const p = s.payrolls.find(
    (p) => p.employeeId === employeeId && p.period === period,
  );
  if (!p) throw Error("outsideContract");
  return p;
}
export function recordPayment(
  s: State,
  id: string,
  date: string,
  amount: string | null,
) {
  const p = s.payrolls.find((p) => p.id === id);
  if (!p) throw Error("notFound");
  if (
    date &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(Date.parse(date)) ||
      new Date(date).toISOString().slice(0, 10) !== date)
  )
    throw Error("invalidDate");
  if (amount != null && d(amount).lt(0)) throw Error("numberPositive");
  if ((amount == null) !== !date) throw Error("paymentBothRequired");
  p.paidDate = date;
  p.paidAmount = amount == null ? null : cents(amount);
  p.paymentReview =
    p.paidAmount != null &&
    (p.result.errors.length > 0 || p.paidAmount !== p.result.net);
  p.updated = new Date().toISOString();
  staleExports(s, p.employeeId, Number(p.period.slice(0, 4)));
}
export function updateEmployee(s: State, employee: Employee) {
  validateEmployee(employee);
  employee = clone(employee);
  const first = [...employee.terms].sort((a, b) =>
    a.effective.localeCompare(b.effective),
  )[0];
  if (first && first.effective > employee.start.slice(0, 7))
    first.effective = employee.start.slice(0, 7);
  const i = s.employees.findIndex((e) => e.id === employee.id);
  if (i < 0) s.employees.push(clone(employee));
  else s.employees[i] = clone(employee);
  for (const exp of s.exports)
    if (!exp.employeeId || exp.employeeId === employee.id) exp.stale = true;
  refreshPayrolls(s, employee.id);
}
export function updateCompany(s: State, company: State["company"]) {
  s.company = clone(company);
  for (const exp of s.exports) exp.stale = true;
  refreshPayrolls(s);
}
export function issueRevision(s: State, p: Payroll, pdf: string): Revision {
  if (p.result.errors.length || p.needsReview || missingEarlier(s, p).length)
    throw new Error("incompletePayroll");
  if (
    !p.company.name ||
    !p.company.address ||
    !p.company.postal ||
    !p.company.city ||
    !p.employee.address ||
    !p.employee.postal ||
    !p.employee.city
  )
    throw new Error("documentAddressRequired");
  const revision: Revision = {
    id: uid(),
    payrollId: p.id,
    number: s.revisions.filter((r) => r.payrollId === p.id).length + 1,
    created: new Date().toISOString(),
    lang: s.company.lang,
    snapshot: clone(p),
    pdf,
  };
  p.issued = true;
  revision.snapshot.issued = true;
  s.revisions.push(revision);
  return revision;
}
export function changeTerms(s: State, id: string, terms: Terms): void {
  const e = s.employees.find((e) => e.id === id);
  if (!e) throw new Error("notFound");
  if (
    s.payrolls.some((p) => p.employeeId === id && p.period >= terms.effective)
  )
    throw new Error("futureTermsRequired");
  if (e.terms.some((t) => t.effective === terms.effective))
    throw new Error("duplicateEffective");
  e.terms.push(clone(terms));
}
export function changeRules(s: State, rules: Rules): void {
  const next = { ...clone(rules), effective: `${rules.year}-01` };
  s.rules = s.rules.map((r) =>
    r.year === rules.year ? { ...clone(next), id: r.id } : r,
  );
  s.rules.push(next);
  for (const exp of s.exports) if (exp.year === rules.year) exp.stale = true;
  refreshPayrolls(s, "", rules.year);
}
export function archiveEmployee(s: State, e: Employee): void {
  if (s.payrolls.some((p) => p.employeeId === e.id)) e.archived = true;
  else s.employees = s.employees.filter((x) => x.id !== e.id);
}
export function annualRows(s: State, year: number, employeeId = "") {
  return s.payrolls
    .filter(
      (p) =>
        p.period.startsWith(String(year)) &&
        (!employeeId || p.employeeId === employeeId),
    )
    .sort(
      (a, b) =>
        a.period.localeCompare(b.period) ||
        a.employee.lastName.localeCompare(b.employee.lastName),
    );
}
export function annualMissing(
  s: State,
  year: number,
  employeeId = "",
): string[] {
  const missing: string[] = [];
  for (const e of s.employees.filter(
    (e) => !employeeId || e.id === employeeId,
  )) {
    for (let m = 1; m <= 12; m++) {
      const period = `${year}-${String(m).padStart(2, "0")}`;
      if (!activeIn(e, period)) continue;
      const p = s.payrolls.find(
        (x) => x.employeeId === e.id && x.period === period,
      );
      if (!p || !p.issued || p.needsReview || p.result.errors.length)
        missing.push(`${e.firstName} ${e.lastName} · ${period}`);
    }
  }
  return missing;
}
export function validateEmployee(e: Employee): void {
  if (!e.firstName.trim() || !e.lastName.trim() || !e.start)
    throw new Error("employeeRequired");
  for (const date of [e.start, e.end, e.birthDate].filter(Boolean)) {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      new Date(date).toISOString().slice(0, 10) !== date
    )
      throw new Error("invalidDate");
  }
  if (e.end && e.end < e.start) throw new Error("invalidDate");
  if (e.avs) {
    const n = e.avs.replace(/[.\s]/g, "");
    if (
      !/^756\d{10}$/.test(n) ||
      Number(n[12]) !==
        (10 -
          ([...n.slice(0, 12)].reduce(
            (a, v, i) => a + Number(v) * (i % 2 ? 3 : 1),
            0,
          ) %
            10)) %
          10
    )
      throw new Error("invalidAvs");
  }
  if (e.iban) {
    const n = e.iban.replace(/\s/g, "").toUpperCase();
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(n))
      throw new Error("invalidIban");
    let rem = 0;
    for (const c of (n.slice(4) + n.slice(0, 4)).replace(/[A-Z]/g, (c) =>
      String(c.charCodeAt(0) - 55),
    ))
      rem = (rem * 10 + Number(c)) % 97;
    if (rem !== 1) throw new Error("invalidIban");
  }
}
