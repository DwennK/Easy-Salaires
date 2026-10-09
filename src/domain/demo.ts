import { emptyState, prepareMonth } from "./service";
import { employeeDefaults } from "./defaults";
import { calculate } from "./payroll";
export function demoState() {
  const s = emptyState();
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
  const rules = s.rules[0]!;
  rules.contributions.find((c) => c.id === "aap")!.employer = "0.8";
  rules.contributions.find((c) => c.id === "aanp")!.employee = "1.2";
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
    e.start = "2026-01-01";
    e.role = i === 0 ? "owner" : "employee";
    const t = e.terms[0]!;
    t.effective = "2026-01";
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
  for (let m = 1; m <= 10; m++) {
    const period = `2026-${String(m).padStart(2, "0")}`;
    prepareMonth(s, period);
    for (const p of s.payrolls.filter((p) => p.period === period)) {
      if (p.terms.mode === "hourly")
        p.input.hours = m === 10 ? null : String(140 + m);
      p.result = calculate(
        p.employee,
        p.terms,
        p.rules,
        p.input,
        p.period,
        s.payrolls,
      );
      p.paidDate = m < 10 ? `${period}-28` : "";
    }
  }
  return s;
}
