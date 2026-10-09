import { emptyState, prepareMonth } from "./service";
import { clone, employeeDefaults, preset2026, uid } from "./defaults";
import { applicable, calculate } from "./payroll";
import type { Payroll, State } from "./types";

function demoRules(year: number) {
  const rules = preset2026();
  rules.contributions.find((c) => c.id === "aap")!.employer = "0.8";
  rules.contributions.find((c) => c.id === "aanp")!.employee = "1.2";
  if (year !== 2026) {
    // Fictional demo rates, not verified historical statutory presets.
    rules.year = year;
    rules.effective = `${year}-01`;
    rules.sources = [];
    rules.contributions.forEach((c) => (c.source = "contract"));
  }
  return rules;
}

/** Add missing history once, retaining existing inputs, payments and PDF snapshots. */
export function backfillDemoHistory(s: State): Payroll[] | null {
  if (!s.company.demo || (s.company.demoHistoryVersion ?? 0) >= 1) return null;
  const names = new Set(["Camille Favre", "Alex Morel", "Léa Perret"]);
  const isOriginal = (e: State["employees"][number]) =>
    names.has(`${e.firstName} ${e.lastName}`);
  const employees = s.employees.filter(
    (e) =>
      !e.archived &&
      (isOriginal(e) ||
        s.payrolls.some(
          (p) =>
            p.employeeId === e.id && p.company.demo && isOriginal(p.employee),
        )),
  );
  for (const e of employees) {
    if (e.start === "2026-01-01") e.start = "2024-01-01";
    if (!applicable(e.terms, e.start.slice(0, 7))) {
      const first = [...e.terms].sort((a, b) =>
        a.effective.localeCompare(b.effective),
      )[0];
      if (first)
        e.terms.unshift({
          ...clone(first),
          id: uid(),
          effective: e.start.slice(0, 7),
        });
    }
  }
  const added: Payroll[] = [];
  for (const year of [2024, 2025]) {
    if (!s.rules.some((r) => r.year === year)) s.rules.push(demoRules(year));
    for (let m = 1; m <= 12; m++) {
      const period = `${year}-${String(m).padStart(2, "0")}`;
      for (const e of employees) {
        if (!prepareMonth(s, period, e.id)) continue;
        const p = s.payrolls.at(-1)!;
        if (p.terms.mode === "hourly") p.input.hours = String(140 + m);
        p.result = calculate(
          p.employee,
          p.terms,
          p.rules,
          p.input,
          period,
          s.payrolls,
        );
        if (!p.result.errors.length) {
          p.paidDate = `${period}-28`;
          p.paidAmount = p.result.net;
        }
        added.push(p);
      }
    }
    for (const exp of s.exports)
      if (
        exp.year === year &&
        added.some(
          (p) =>
            p.period.startsWith(String(year)) &&
            (!exp.employeeId || exp.employeeId === p.employeeId),
        )
      )
        exp.stale = true;
  }
  s.company.demoHistoryVersion = 1;
  return added;
}

export function demoState() {
  const s = emptyState();
  s.company.demoHistoryVersion = 1;
  s.company = {
    ...s.company,
    name: "Atelier du Lac Sàrl",
    address: "Rue du Seyon 12",
    postal: "2000",
    city: "Neuchâtel",
    contact: "032 555 01 24",
    responsible: "Camille Favre",
    footer: "Merci pour votre travail.",
    demo: true,
  };
  s.rules = [2026, 2024, 2025].map(demoRules);
  const names = [
    ["Camille", "Favre"],
    ["Alex", "Morel"],
    ["Léa", "Perret"],
  ];
  s.employees = names.map(([firstName, lastName], i) => {
    const e = employeeDefaults();
    e.firstName = firstName!;
    e.lastName = lastName!;
    e.address = [
      "Avenue du Premier-Mars 8",
      "Rue des Moulins 24",
      "Chemin des Écoliers 5",
    ][i]!;
    e.postal = "2000";
    e.city = "Neuchâtel";
    e.birthDate = ["1985-04-12", "1994-11-03", "1990-07-21"][i]!;
    e.start = "2024-01-01";
    e.role = i === 0 ? "owner" : "employee";
    const t = e.terms[0]!;
    t.effective = "2024-01";
    t.salary = ["5200", "32", "3000"][i]!;
    t.mode = i === 1 ? "hourly" : "monthly";
    t.activity = i === 2 ? "60" : "100";
    t.lppEmployee = ["245", "160", "120"][i]!;
    t.lppEmployer = t.lppEmployee;
    t.thirteen = i === 2;
    t.family = i === 2;
    t.familyAmount = i === 2 ? "250" : null;
    return e;
  });
  // Keep the current demo year first, calculating each year's months in order.
  for (const year of [2026, 2024, 2025]) {
    for (let m = 1; m <= (year === 2026 ? 10 : 12); m++) {
      const period = `${year}-${String(m).padStart(2, "0")}`;
      const currentMonth = period === "2026-10";
      prepareMonth(s, period);
      for (const p of s.payrolls.filter((p) => p.period === period)) {
        if (p.terms.mode === "hourly")
          p.input.hours = currentMonth ? null : String(140 + m);
        p.result = calculate(
          p.employee,
          p.terms,
          p.rules,
          p.input,
          p.period,
          s.payrolls,
        );
        p.paidDate = currentMonth ? "" : `${period}-28`;
        p.paidAmount = currentMonth ? null : p.result.net;
      }
    }
  }
  return s;
}
