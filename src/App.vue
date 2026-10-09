<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch, provide } from "vue";
import {
  CalendarDays,
  Users,
  ChartNoAxesCombined,
  Settings2,
  FolderOpen,
  ShieldCheck,
  ChevronRight,
  Plus,
  Download,
  ArrowUpRight,
  FileText,
  Check,
  X,
  Building2,
  HardDrive,
} from "lucide-vue-next";
import type {
  State,
  Employee,
  Payroll,
  Revision,
  Company,
  Rules,
} from "./domain/types";
import {
  clone,
  uid,
  employeeDefaults,
  periodNow,
  today,
} from "./domain/defaults";
import {
  emptyState,
  prepareMonth,
  savePayroll,
  issueRevision,
  changeRules,
  archiveEmployee,
  annualRows,
  annualMissing,
  upgradeState,
  refreshPayrolls,
  ensurePayroll,
  updateEmployee,
  updateCompany,
  recordPayment,
} from "./domain/service";
import { applicable, activeIn } from "./domain/payroll";
import { demoState } from "./domain/demo";
import { money as formatMoney, sum, d, decimalText } from "./domain/money";
import { tr, lang, months, periodLabel } from "./lib/i18n";
import {
  native,
  command,
  persist,
  loadPreview,
  exportFile,
  toBase64,
  fromBase64,
  safeName,
} from "./lib/bridge";
import {
  payslipPdf,
  payslipName,
  mergePdfs,
  csvExport,
  xlsxExport,
  certificateNumbers,
  certificatePdf,
  accountingCsv,
} from "./lib/documents";
import Modal from "./components/Modal.vue";
import EmployeeEditor from "./components/EmployeeEditor.vue";
import PayrollEditor from "./components/PayrollEditor.vue";
import SettingsView from "./components/SettingsView.vue";
import Field from "./components/Field.vue";
import SetupGuide from "./components/SetupGuide.vue";
import { availableYears, payrollAction, rulesReady } from "./lib/ux";
import AnnualWorkspace from "./components/AnnualWorkspace.vue";
import AppUpdater from "./components/AppUpdater.vue";
import ThemePicker from "./components/ThemePicker.vue";
import icon from "./assets/app-icon.png";
const money = (value: number) => formatMoney(value, lang.value);
const state = ref<State | null>(null),
  page = ref("salaries"),
  period = ref(periodNow()),
  busy = ref(false),
  error = ref(""),
  toast = ref(""),
  path = ref(""),
  recents = ref<string[]>([]),
  backupDir = ref(""),
  filesOpen = ref(false),
  employeeEdit = ref<Employee | null>(null),
  payrollEdit = ref<Payroll | null>(null),
  showSecondary = ref(false),
  employeeFilter = ref(""),
  showArchived = ref(false),
  previewUrl = ref(""),
  createOpen = ref(false),
  companyName = ref(""),
  certificateEmployee = ref<Employee | null>(null),
  review = ref({ transport: false, meals: false, remarks: "" }),
  reviewChecked = ref(false);
provide("appError", error);
const settingsTab = ref("company");
const settingsView = ref<{ dirty: boolean }>();
const pendingNavigation = ref<(() => void) | null>(null);
const lastBackup = ref<{ date: string; path: string } | null>(null);
function requestNavigation(action: () => void) {
  if (settingsView.value?.dirty) pendingNavigation.value = action;
  else action();
}
function navigate(target: string) {
  requestNavigation(() => {
    page.value = target;
  });
}
function beforeUnload(e: BeforeUnloadEvent) {
  if (settingsView.value?.dirty) {
    e.preventDefault();
    e.returnValue = "";
  }
}
onMounted(() => window.addEventListener("beforeunload", beforeUnload));
onBeforeUnmount(() => window.removeEventListener("beforeunload", beforeUnload));
async function setupStep(index: number) {
  requestNavigation(() => {
    if (index < 2) {
      settingsTab.value = index === 0 ? "company" : "rules";
      page.value = "settings";
    } else if (index === 2) {
      page.value = "employees";
      employeeEdit.value = employeeDefaults();
    } else {
      const starts = state
        .value!.employees.filter((e) => !e.archived)
        .map((e) => e.start.slice(0, 7))
        .sort();
      const first = starts[0];
      if (first)
        period.value = first < `${year.value}-01` ? `${year.value}-01` : first;
      page.value = "salaries";
    }
  });
}
const eligible = computed(
  () =>
    state.value?.employees.filter(
      (e) =>
        !e.archived &&
        activeIn(e, period.value) &&
        applicable(e.terms, period.value),
    ) ?? [],
);
const monthReady = computed(
  () =>
    !!rows.value.length &&
    rows.value.every(
      (p) => p.issued && !p.needsReview && !p.result.errors.length,
    ),
);
const workflowStep = computed(() =>
  !rows.value.length
    ? 0
    : rows.value.some((p) => p.result.errors.length || p.needsReview)
      ? 1
      : !monthReady.value
        ? 2
        : 3,
);
async function loadBackupStatus() {
  lastBackup.value = native
    ? await command<{ date: string; path: string } | null>("backupStatus")
    : null;
}
watch(filesOpen, (value) => {
  if (value) run(loadBackupStatus);
});
let toastTimer: ReturnType<typeof setTimeout> | undefined;
const selectedEmployee = ref("");
const nav = [
  { id: "salaries", icon: FileText },
  { id: "monthly", icon: CalendarDays },
  { id: "employees", icon: Users },
  { id: "annual", icon: ChartNoAxesCombined },
  { id: "settings", icon: Settings2 },
];
const year = computed({
  get: () => Number(period.value.slice(0, 4)),
  set: (v: number) => (period.value = `${v}-${period.value.slice(5)}`),
});
const month = computed({
  get: () => Number(period.value.slice(5)),
  set: (v: number) =>
    (period.value = `${year.value}-${String(v).padStart(2, "0")}`),
});
const years = computed(() => availableYears(state.value, year.value));
const rows = computed(
  () => state.value?.payrolls.filter((p) => p.period === period.value) ?? [],
);
const totals = computed(() => ({
  gross: sum(
    rows.value
      .filter((p) => !p.result.errors.length)
      .map((p) => p.result.gross),
  ),
  net: sum(
    rows.value.filter((p) => !p.result.errors.length).map((p) => p.result.net),
  ),
  employer: sum(
    rows.value
      .filter((p) => !p.result.errors.length)
      .map((p) => p.result.employer),
  ),
  cost: sum(
    rows.value.filter((p) => !p.result.errors.length).map((p) => p.result.cost),
  ),
  deductions: sum(
    rows.value
      .filter((p) => !p.result.errors.length)
      .map((p) => p.result.deductions),
  ),
}));
const issued = computed(
  () => rows.value.filter((p) => p.issued && !p.needsReview).length,
);
const employees = computed(
  () =>
    state.value?.employees.filter((e) => showArchived.value || !e.archived) ??
    [],
);
const annual = computed(() =>
  state.value ? annualRows(state.value, year.value, employeeFilter.value) : [],
);
const missing = computed(() =>
  state.value
    ? annualMissing(state.value, year.value, employeeFilter.value)
    : [],
);
const annualTotal = computed(() => ({
  gross: sum(
    annual.value
      .filter((p) => !p.result.errors.length)
      .map((p) => p.result.gross),
  ),
  deductions: sum(
    annual.value
      .filter((p) => !p.result.errors.length)
      .map((p) => p.result.deductions),
  ),
  net: sum(
    annual.value
      .filter((p) => !p.result.errors.length)
      .map((p) => p.result.net),
  ),
  employer: sum(
    annual.value
      .filter((p) => !p.result.errors.length)
      .map((p) => p.result.employer),
  ),
  cost: sum(
    annual.value
      .filter((p) => !p.result.errors.length)
      .map((p) => p.result.cost),
  ),
}));
const certNumbers = computed(() =>
  state.value && certificateEmployee.value
    ? certificateNumbers(state.value, year.value, certificateEmployee.value.id)
    : null,
);
watch(
  () => state.value?.company.lang,
  (v) => {
    lang.value = v ?? "fr";
    document.documentElement.lang = lang.value;
  },
);
function notify(key: string) {
  toast.value = tr(key);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.value = ""), 4500);
}
async function run(fn: () => Promise<void>) {
  if (busy.value) return;
  busy.value = true;
  error.value = "";
  try {
    await fn();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    error.value =
      tr(msg) === msg && !/^[a-zA-Z]+$/.test(msg)
        ? `${tr("unknownError")} (${msg})`
        : tr(msg);
  } finally {
    busy.value = false;
  }
}
async function commit(next: State) {
  upgradeState(next);
  await persist(next);
  state.value = next;
}
function status(p: Payroll) {
  return p.needsReview
    ? "review"
    : p.result.errors.length
      ? "incomplete"
      : p.issued
        ? "complete"
        : "ready";
}
async function seed(): Promise<State> {
  const s = demoState();
  for (const p of s.payrolls.filter((p) => !p.result.errors.length)) {
    const bytes = await payslipPdf(p, 1, "fr");
    issueRevision(s, p, toBase64(bytes));
  }
  return s;
}
async function startDemo() {
  await run(async () => {
    if (native) {
      const r = await command<{ state: State | null; path: string } | null>(
        "demo",
      );
      if (!r) return;
      path.value = r.path;
      if (r.state) state.value = r.state ? upgradeState(r.state) : null;
      else await commit(await seed());
    } else await commit(await seed());
    period.value = "2026-10";
    page.value = "salaries";
    filesOpen.value = false;
  });
}
async function openCompany(action = "open", file = "") {
  await run(async () => {
    if (!native) {
      notify("nativeOnly");
      return;
    }
    const r = await command<{ state: State | null; path: string } | null>(
      action,
      { path: file },
    );
    if (!r) return;
    state.value = r.state ? upgradeState(r.state) : null;
    path.value = r.path;
    filesOpen.value = false;
    page.value = "salaries";
    if (!state.value) {
      const next = emptyState();
      await commit(next);
      page.value = "settings";
    }
  });
}
async function createCompany() {
  await run(async () => {
    if (!native) {
      notify("nativeOnly");
      return;
    }
    const r = await command<{ state: null; path: string } | null>("create");
    if (!r) return;
    const s = emptyState();
    s.company.name = companyName.value;
    await commit(s);
    path.value = r.path;
    createOpen.value = false;
    filesOpen.value = false;
    page.value = "settings";
  });
}
async function prepare() {
  await run(async () => {
    const s = clone(state.value!);
    const count = prepareMonth(s, period.value);
    await commit(s);
    notify(
      count ? "prepared" : eligible.value.length ? "allPrepared" : "noEligible",
    );
  });
}
async function employeeSave(e: Employee) {
  await run(async () => {
    const s = clone(state.value!);
    updateEmployee(s, e);
    selectedEmployee.value = e.id;
    await commit(s);
    employeeEdit.value = null;
    notify("saved");
  });
}
async function employeePayroll(id: string, selected: string) {
  await run(async () => {
    const s = clone(state.value!);
    const p = ensurePayroll(s, id, selected);
    await commit(s);
    payrollEdit.value = clone(p);
  });
}
async function annualCell(
  id: string,
  selected: string,
  key: "salary" | "hours",
  value: string,
  following: boolean,
) {
  await run(async () => {
    if (d(value).lt(0)) throw Error("numberPositive");
    const s = clone(state.value!);
    const last = following ? 12 : Number(selected.slice(5));
    for (let m = Number(selected.slice(5)); m <= last; m++) {
      const month = `${selected.slice(0, 4)}-${String(m).padStart(2, "0")}`;
      if (
        !activeIn(
          s.employees.find((e) => e.id === id)!,
          month,
        )
      )
        continue;
      const p = clone(ensurePayroll(s, id, month));
      if (key === "salary") p.terms.salary = value;
      else p.input.hours = value;
      savePayroll(s, p);
    }
    await commit(s);
    notify("saved");
  });
}
async function resetSalary(id: string, selected: string) {
  await run(async () => {
    const s = clone(state.value!);
    const p = ensurePayroll(s, id, selected);
    delete p.termOverrides?.salary;
    refreshPayrolls(s, id, Number(selected.slice(0, 4)));
    await commit(s);
    notify("saved");
  });
}
async function annualExtras(
  id: string,
  selected: string,
  bonus: string,
  expenses: string,
) {
  await run(async () => {
    if (d(expenses).lt(0)) throw Error("numberPositive");
    d(bonus);
    const s = clone(state.value!);
    const p = clone(ensurePayroll(s, id, selected));
    for (const [key, value, taxable, label] of [
      ["annual-bonus", bonus, true, tr("bonusAmount")],
      ["annual-expenses", expenses, false, tr("expensesAmount")],
    ] as const) {
      p.input.elements = p.input.elements.filter((e) => e.id !== key);
      if (!d(value).isZero())
        p.input.elements.push({
          id: key,
          kind: "adjustment",
          label,
          amount: value,
          quantity: "1",
          unit: "hours",
          rate: "0",
          premium: "0",
          paid: true,
          reimbursement: !taxable,
          avs: taxable,
          laa: taxable,
          thirteen: false,
        });
    }
    savePayroll(s, p);
    await commit(s);
    notify("saved");
  });
}
async function annualPayment(
  id: string,
  selected: string,
  date: string,
  amount: string | null,
) {
  await run(async () => {
    const s = clone(state.value!);
    const p = ensurePayroll(s, id, selected);
    recordPayment(s, p.id, date, amount);
    await commit(s);
    notify("saved");
  });
}
async function annualPdf(id: string, selected: string) {
  await run(async () => {
    const s = clone(state.value!);
    const p = ensurePayroll(s, id, selected);
    const previous = s.revisions
      .filter((r) => r.payrollId === p.id)
      .sort((a, b) => b.number - a.number)[0];
    let revision = previous;
    if (!p.issued || !previous) {
      const n = (previous?.number ?? 0) + 1;
      const bytes = await payslipPdf(p, n, s.company.lang);
      revision = issueRevision(s, p, toBase64(bytes));
      await commit(s);
    }
    if (await exportFile(payslipName(p, revision!.number), revision!.pdf))
      notify("exported");
  });
}
async function archive(e: Employee) {
  await run(async () => {
    const s = clone(state.value!);
    const target = s.employees.find((x) => x.id === e.id)!;
    if (target.archived) target.archived = false;
    else archiveEmployee(s, target);
    await commit(s);
    notify("saved");
  });
}
async function payrollSave(p: Payroll, issue = false) {
  await run(async () => {
    const s = clone(state.value!);
    const saved = savePayroll(s, p);
    if (issue) {
      const n = s.revisions.filter((r) => r.payrollId === p.id).length + 1;
      const pdf = await payslipPdf(saved, n, s.company.lang);
      issueRevision(s, saved, toBase64(pdf));
    }
    await commit(s);
    payrollEdit.value = clone(saved);
    notify("saved");
  });
}
async function setPayment(id: string, date: string, amount: string | null) {
  await run(async () => {
    const s = clone(state.value!);
    const p = s.payrolls.find((p) => p.id === id)!;
    recordPayment(s, id, date, amount);
    await commit(s);
    payrollEdit.value = clone(p);
    notify("saved");
  });
}
function closePreview() {
  URL.revokeObjectURL(previewUrl.value);
  previewUrl.value = "";
}
async function preview(p: Payroll) {
  await run(async () => {
    const originals = state
      .value!.revisions.filter((r) => r.payrollId === p.id)
      .sort((a, b) => b.number - a.number);
    const bytes =
      p.issued && originals[0]
        ? fromBase64(originals[0].pdf)
        : await payslipPdf(
            p,
            originals.length + 1,
            state.value!.company.lang,
            undefined,
            true,
          );
    if (previewUrl.value) URL.revokeObjectURL(previewUrl.value);
    previewUrl.value = URL.createObjectURL(
      new Blob([bytes as BlobPart], { type: "application/pdf" }),
    );
  });
}
async function original(r: Revision, print: boolean) {
  await run(async () => {
    if (await exportFile(payslipName(r.snapshot, r.number), r.pdf, print))
      notify("exported");
  });
}
async function exportMonth(individual = false) {
  await run(async () => {
    const chosen = rows.value.filter(
      (p) => p.issued && !p.needsReview && !p.result.errors.length,
    );
    if (chosen.length !== rows.value.length || !chosen.length)
      throw Error("incompletePayroll");
    const revisions = chosen.map(
      (p) =>
        state
          .value!.revisions.filter((r) => r.payrollId === p.id)
          .sort((a, b) => b.number - a.number)[0]!,
    );
    if (individual && native) {
      if (
        await command(
          "exportBatch",
          revisions.map((r) => ({
            name: payslipName(r.snapshot, r.number),
            data: r.pdf,
          })),
        )
      )
        notify("exported");
    } else {
      const bytes = await mergePdfs(revisions.map((r) => r.pdf));
      if (await exportFile(`${period.value}_salaires.pdf`, toBase64(bytes)))
        notify("exported");
    }
  });
}
async function exportAccounting() {
  await run(async () => {
    const s = clone(state.value!);
    const bytes = accountingCsv(s, period.value);
    const name = `${period.value}_piece_comptable.csv`,
      data = toBase64(bytes);
    s.exports.push({
      id: uid(),
      year: year.value,
      employeeId: "",
      created: new Date().toISOString(),
      kind: "accounting",
      stale: false,
      data,
      name,
    });
    await commit(s);
    if (await exportFile(name, data)) notify("exported");
  });
}
async function companySave(c: Company) {
  await run(async () => {
    const s = clone(state.value!);
    updateCompany(s, c);
    await commit(s);
    notify("savedCompany");
  });
}
async function rulesSave(r: Rules) {
  await run(async () => {
    const s = clone(state.value!);
    changeRules(s, r);
    await commit(s);
    notify(rulesReady(r) ? "savedRules" : "savedDraftRules");
  });
}
async function annualExport(kind: "csv" | "xlsx") {
  await run(async () => {
    const s = clone(state.value!);
    const bytes =
      kind === "csv"
        ? csvExport(s, year.value, employeeFilter.value)
        : await xlsxExport(s, year.value, employeeFilter.value);
    const data = toBase64(bytes),
      name = `${year.value}_${employeeFilter.value ? safeName(employeeFilter.value) : "entreprise"}_${missing.value.length ? "provisoire_" : ""}recap.${kind}`;
    s.exports.push({
      id: uid(),
      year: year.value,
      employeeId: employeeFilter.value,
      created: new Date().toISOString(),
      kind,
      stale: false,
      data,
      name,
    });
    await commit(s);
    if (await exportFile(name, data)) notify("exported");
  });
}
async function generateCertificate() {
  await run(async () => {
    const s = clone(state.value!),
      e = certificateEmployee.value!;
    if (annualMissing(s, year.value, e.id).length)
      throw Error("incompletePayroll");
    if (!e.avs || !e.address || !s.company.contact || !s.company.responsible)
      throw Error("documentAddressRequired");
    const data = toBase64(await certificatePdf(s, year.value, e, review.value));
    const name = `${year.value}_${safeName(e.lastName)}_certificat.pdf`;
    s.exports.push({
      id: uid(),
      year: year.value,
      employeeId: e.id,
      created: new Date().toISOString(),
      kind: "certificate",
      stale: false,
      data,
      name,
    });
    await commit(s);
    if (await exportFile(name, data)) notify("exported");
    certificateEmployee.value = null;
  });
}
async function template(name: string) {
  await run(async () => {
    const data = toBase64(
      new Uint8Array(await (await fetch(`/templates/${name}`)).arrayBuffer()),
    );
    if (await exportFile(name, data, true)) notify("exported");
  });
}
async function backup() {
  await run(async () => {
    if (await command("backup")) {
      await loadBackupStatus();
      notify("backupSuccess");
    }
  });
}
async function folder() {
  await run(async () => {
    const c = await command<{ backupDir: string } | null>("backupFolder");
    if (c) backupDir.value = c.backupDir;
  });
}
async function switchCompany() {
  await run(async () => {
    if (native) await command("close");
    state.value = null;
    filesOpen.value = false;
    path.value = "";
  });
}
onMounted(() =>
  run(async () => {
    if (native) {
      const r = await command<{
        state: State | null;
        path: string;
        config: { recent: string[]; backupDir: string };
      }>("startup");
      state.value = r.state ? upgradeState(r.state) : null;
      path.value = r.path;
      recents.value = r.config.recent;
      backupDir.value = r.config.backupDir;
    } else {
      const loaded = await loadPreview();
      state.value = loaded ? upgradeState(loaded) : null;
      if (state.value) period.value = "2026-10";
    }
  }),
);
</script>
<template>
  <div v-if="!state" class="welcome">
    <div class="welcome-top">
      <img :src="icon" alt="" /><span>Easy <b>Salaires</b></span
      ><small>SUISSE · SWITZERLAND</small>
    </div>
    <main>
      <div class="welcome-mark">
        <FileText :size="34" :stroke-width="1.5" />
      </div>
      <p class="eyebrow">EASY SALAIRES</p>
      <h1>{{ tr("welcome") }}</h1>
      <p>{{ tr("welcomeText") }}</p>
      <div class="welcome-actions">
        <button
          class="button primary"
          @click="native ? (createOpen = true) : notify('nativeOnly')"
        >
          <Plus :size="18" />{{ tr("create") }}</button
        ><button class="button secondary" @click="openCompany()">
          <FolderOpen :size="18" />{{ tr("open") }}</button
        ><button class="text-button" @click="startDemo" :disabled="busy">
          {{ busy ? tr("pending") : tr("demo") }} <ArrowUpRight :size="16" />
        </button>
      </div>
      <p class="notice" v-if="!native">{{ tr("webDemo") }}</p>
      <section v-if="recents.length" class="recent-list">
        <h3>{{ tr("recent") }}</h3>
        <button
          v-for="r in recents"
          :key="r"
          class="recent-row"
          @click="openCompany('recent', r)"
        >
          <FolderOpen :size="17" /><span>{{ r.split(/[\\/]/).at(-1) }}</span
          ><ChevronRight :size="16" />
        </button>
      </section>
    </main>
    <footer><ShieldCheck :size="16" />{{ tr("offline") }}</footer>
  </div>
  <div v-else class="app-shell">
    <aside class="sidebar">
      <a class="brand" href="#" @click.prevent="navigate('salaries')"
        ><span class="v2-mark"><FileText :size="22" :stroke-width="1.8" /></span
        ><span>Easy <b>Salaires</b></span></a
      ><button
        class="company-switch"
        @click="requestNavigation(() => (filesOpen = true))"
      >
        <span class="company-avatar"><Building2 :size="19" /></span
        ><span
          ><strong>{{ state.company.name || tr("company") }}</strong
          ><small>{{ state.company.city || "Neuchâtel" }}</small></span
        ><ChevronRight :size="14" />
      </button>
      <nav aria-label="Navigation">
        <button
          v-for="item in nav"
          :key="item.id"
          :class="{ selected: page === item.id }"
          @click="navigate(item.id)"
          :aria-current="page === item.id ? 'page' : undefined"
        >
          <component :is="item.icon" :size="19" :stroke-width="1.7" />{{
            tr(item.id)
          }}
        </button>
      </nav>
      <div class="sidebar-bottom">
        <button @click="requestNavigation(() => (filesOpen = true))">
          <FolderOpen :size="18" />{{ tr("files") }}
        </button>
        <div class="local-status"><i></i>{{ tr("offline") }}</div>
        <ThemePicker />
        <AppUpdater
          :blocked="
            busy ||
            !!settingsView?.dirty ||
            !!employeeEdit ||
            !!payrollEdit ||
            createOpen ||
            !!error
          "
        />
      </div>
    </aside>
    <div class="workspace">
      <header class="topbar">
        <span
          >{{ state.company.name || "Easy Salaires" }}
          <ChevronRight :size="13" /> <strong>{{ tr(page) }}</strong></span
        ><span class="topbar-right"
          ><span v-if="state.company.demo" class="demo-tag">{{
            tr("demoBadge")
          }}</span
          ><ShieldCheck :size="16" /><span>{{
            today().split("-").reverse().join(".")
          }}</span></span
        >
      </header>
      <div v-if="!native" class="web-banner">
        <HardDrive :size="15" />{{ tr("webDemo") }}
      </div>
      <main class="main">
        <SetupGuide
          v-if="!state.company.demo && !state.payrolls.some((p) => p.issued)"
          :state="state"
          :period="period"
          @step="setupStep"
        />
        <div class="page-heading" v-if="page !== 'salaries'">
          <div>
            <p class="eyebrow">
              {{
                page === "monthly"
                  ? `${state.company.canton} · ${year}`
                  : "EASY SALAIRES"
              }}
            </p>
            <h1>{{ tr(page) }}</h1>
            <p>
              {{
                tr(
                  page === "monthly"
                    ? "monthlySub"
                    : page === "employees"
                      ? "employeeSub"
                      : page === "annual"
                        ? "annualSub"
                        : "settingsSub",
                )
              }}
            </p>
          </div>
          <button
            v-if="page === 'monthly'"
            class="button primary"
            :disabled="busy"
            @click="
              state.employees.some((e) => !e.archived)
                ? prepare()
                : (employeeEdit = employeeDefaults())
            "
          >
            <Plus :size="18" />{{
              tr(
                state.employees.some((e) => !e.archived)
                  ? "prepare"
                  : "addEmployee",
              )
            }}</button
          ><button
            v-if="page === 'employees'"
            class="button primary"
            @click="employeeEdit = employeeDefaults()"
          >
            <Plus :size="18" />{{ tr("addEmployee") }}
          </button>
        </div>
        <template v-if="page === 'salaries'">
          <div class="v2-heading">
            <div>
              <p class="eyebrow">{{ tr("payrollWorkspace") }}</p>
              <h1>{{ tr("salaries") }}<span class="heading-dot">.</span></h1>
              <p>{{ tr("salariesSub") }}</p>
            </div>
            <button
              class="button primary"
              @click="employeeEdit = employeeDefaults()"
            >
              <Plus :size="16" />{{ tr("addEmployee") }}
            </button>
          </div>
          <AnnualWorkspace
            :state="state"
            :busy="busy"
            v-model:year="year"
            v-model:employee-id="selectedEmployee"
            @edit-employee="employeeEdit = $event"
            @add-employee="employeeEdit = employeeDefaults()"
            @detail="employeePayroll"
            @pdf="annualPdf"
            @cell="annualCell"
            @extras="annualExtras"
            @payment="annualPayment"
            @reset="resetSalary"
          />
        </template>
        <template v-if="page === 'monthly'"
          ><div class="period-toolbar">
            <div class="period-select">
              <label
                ><span class="sr-only">{{ tr("month") }}</span
                ><select :aria-label="tr('month')" v-model="month">
                  <option v-for="(m, i) in months()" :key="m" :value="i + 1">
                    {{ m }}
                  </option>
                </select></label
              ><label
                ><span class="sr-only">{{ tr("year") }}</span
                ><select :aria-label="tr('year')" v-model="year">
                  <option v-for="y in years" :key="y" :value="y">
                    {{ y }}
                  </option>
                </select></label
              >
            </div>
            <div class="inline-actions">
              <button
                class="button secondary"
                :disabled="
                  busy ||
                  !rows.length ||
                  rows.some((p) => p.result.errors.length)
                "
                @click="exportAccounting"
              >
                <Download :size="16" />{{ tr("accountingExport") }}
              </button>
              <button
                class="button secondary"
                :disabled="busy || !monthReady"
                @click="exportMonth()"
              >
                <Download :size="16" />{{ tr("exportMonth") }}</button
              ><button
                v-if="native"
                class="icon-button"
                :disabled="busy || !monthReady"
                @click="exportMonth(true)"
                :aria-label="tr('individualPdfs')"
              >
                <FolderOpen :size="18" />
              </button>
            </div>
          </div>
          <ol class="month-workflow" :aria-label="tr('monthlyWorkflow')">
            <li
              v-for="(step, i) in [
                'workflowPrepare',
                'workflowCheck',
                'workflowPdf',
                'workflowPay',
              ]"
              :key="step"
              :aria-current="workflowStep === i ? 'step' : undefined"
              :class="{ current: workflowStep === i, done: workflowStep > i }"
            >
              <span class="step-number">{{ i + 1 }}</span
              >{{ tr(step) }}
            </li>
          </ol>
          <p class="hint">
            {{
              tr(rows.length && !monthReady ? "exportBlocked" : "prepareHelp")
            }}
          </p>
          <p
            v-if="rows.some((p) => p.result.errors.length)"
            class="hint partial-hint"
          >
            {{ tr("incompleteTotals") }}
          </p>
          <div class="monthly-metrics">
            <div>
              <span>{{ tr("net") }}</span
              ><strong>{{ money(totals.net) }}<small>CHF</small></strong>
            </div>
            <div>
              <span>{{ tr("gross") }}</span
              ><strong>{{ money(totals.gross) }}<small>CHF</small></strong>
            </div>
            <div>
              <span>{{ tr("progress") }}</span
              ><strong
                >{{ issued }}<em>/ {{ rows.length }}</em></strong
              ><small>{{ tr("issuedCount") }}</small>
            </div>
          </div>
          <div class="table-heading">
            <h2>
              {{ periodLabel(period) }} <span>{{ rows.length }}</span>
            </h2>
            <label class="check compact"
              ><input type="checkbox" v-model="showSecondary" />{{
                tr("secondary")
              }}</label
            >
          </div>
          <div class="table-scroll" v-if="rows.length">
            <table>
              <thead>
                <tr>
                  <th>{{ tr("employee") }}</th>
                  <th>{{ tr("mode") }}</th>
                  <th class="num">{{ tr("gross") }}</th>
                  <th class="num">{{ tr("deductions") }}</th>
                  <th class="num">{{ tr("net") }}</th>
                  <th v-if="showSecondary" class="num">{{ tr("employer") }}</th>
                  <th v-if="showSecondary" class="num">{{ tr("cost") }}</th>
                  <th>{{ tr("status") }}</th>
                  <th>{{ tr("payment") }}</th>
                  <th>{{ tr("nextAction") }}</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="(p, i) in rows"
                  :key="p.id"
                  @click="payrollEdit = clone(p)"
                >
                  <td>
                    <button
                      class="person-cell"
                      @click.stop="payrollEdit = clone(p)"
                    >
                      <span class="avatar" :class="`tone-${i % 3}`"
                        >{{ p.employee.firstName[0]
                        }}{{ p.employee.lastName[0] }}</span
                      ><span
                        ><strong
                          >{{ p.employee.firstName }}
                          {{ p.employee.lastName }}</strong
                        ><small
                          >{{ decimalText(p.terms.activity) }} %{{
                            p.employee.role === "owner"
                              ? ` · ${tr("owner")}`
                              : ""
                          }}</small
                        ></span
                      >
                    </button>
                  </td>
                  <td>
                    <span>{{
                      tr(p.terms.mode === "monthly" ? "monthlyMode" : "hourly")
                    }}</span
                    ><small v-if="p.terms.mode === 'hourly'"
                      >{{
                        p.input.hours == null ? "—" : decimalText(p.input.hours)
                      }}
                      h × {{ decimalText(p.terms.salary) }} CHF</small
                    >
                  </td>
                  <td class="num">
                    {{ p.result.errors.length ? "—" : money(p.result.gross) }}
                  </td>
                  <td class="num muted">
                    {{
                      p.result.errors.length ? "—" : money(p.result.deductions)
                    }}
                  </td>
                  <td class="num strong">
                    {{ p.result.errors.length ? "—" : money(p.result.net) }}
                  </td>
                  <td v-if="showSecondary" class="num">
                    {{
                      p.result.errors.length ? "—" : money(p.result.employer)
                    }}
                  </td>
                  <td v-if="showSecondary" class="num">
                    {{ p.result.errors.length ? "—" : money(p.result.cost) }}
                  </td>
                  <td>
                    <span
                      class="badge"
                      :class="
                        status(p) === 'complete'
                          ? 'green'
                          : status(p) === 'ready'
                            ? 'neutral'
                            : 'amber'
                      "
                      ><span class="dot"></span>{{ tr(status(p)) }}</span
                    >
                  </td>
                  <td>
                    <span class="payment-status" :class="{ done: !!p.paidDate }"
                      ><Check v-if="p.paidDate" :size="14" />{{
                        tr(
                          p.paidDate
                            ? "paid"
                            : p.paymentReview
                              ? "review"
                              : "unpaid",
                        )
                      }}</span
                    >
                  </td>
                  <td>
                    <button
                      class="text-button row-action"
                      @click.stop="payrollEdit = clone(p)"
                    >
                      {{ tr(payrollAction(state, p))
                      }}<ChevronRight :size="14" />
                    </button>
                  </td>
                </tr>
              </tbody>
              <tfoot>
                <tr>
                  <td colspan="2">{{ tr("total") }} · CHF</td>
                  <td class="num">{{ money(totals.gross) }}</td>
                  <td class="num">{{ money(totals.deductions) }}</td>
                  <td class="num">{{ money(totals.net) }}</td>
                  <td v-if="showSecondary" class="num">
                    {{ money(totals.employer) }}
                  </td>
                  <td v-if="showSecondary" class="num">
                    {{ money(totals.cost) }}
                  </td>
                  <td colspan="3"></td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div v-else class="empty">
            <CalendarDays :size="34" :stroke-width="1.2" />
            <h2>{{ tr("emptyMonth") }}</h2>
            <p>
              {{
                tr(
                  state.employees.some((e) => !e.archived)
                    ? "emptyMonthText"
                    : "noEmployeesMonth",
                )
              }}
            </p>
            <p class="hint">{{ tr("monthlyFirstHelp") }}</p>
            <button
              class="button secondary"
              @click="
                state.employees.some((e) => !e.archived)
                  ? prepare()
                  : (employeeEdit = employeeDefaults())
              "
            >
              {{
                tr(
                  state.employees.some((e) => !e.archived)
                    ? "prepare"
                    : "addEmployee",
                )
              }}
            </button>
          </div>
          <div class="table-note">
            <ShieldCheck :size="16" /><span>{{
              state.company.demo ? tr("demoNotice") : tr("offline")
            }}</span
            ><span
              >{{ tr("settled") }} :
              {{ rows.filter((p) => p.paidDate).length }} /
              {{ rows.length }}</span
            >
          </div></template
        >
        <template v-else-if="page === 'employees'"
          ><div class="period-toolbar">
            <span>{{ employees.length }} {{ tr("people") }}</span
            ><label class="check"
              ><input type="checkbox" v-model="showArchived" />{{
                tr("archived")
              }}</label
            >
          </div>
          <div class="employee-list" v-if="employees.length">
            <article v-for="(e, i) in employees" :key="e.id">
              <span class="avatar large" :class="`tone-${i % 3}`"
                >{{ e.firstName[0] }}{{ e.lastName[0] }}</span
              >
              <div class="employee-description">
                <h2>
                  {{ e.firstName }} {{ e.lastName }}
                  <span class="badge neutral" v-if="e.archived">{{
                    tr("archived")
                  }}</span>
                </h2>
                <p>
                  {{ e.role === "owner" ? tr("owner") : tr("employee") }} ·
                  {{ e.city }} · {{ tr("start") }} {{ e.start }}
                </p>
              </div>
              <div class="employee-salary">
                <strong
                  >{{
                    decimalText(
                      applicable(e.terms, period)?.salary ??
                        e.terms.at(-1)?.salary,
                    )
                  }}
                  CHF</strong
                ><small>{{
                  tr(
                    (applicable(e.terms, period) ?? e.terms.at(-1))?.mode ===
                      "monthly"
                      ? "monthlyMode"
                      : "hourly",
                  )
                }}</small>
              </div>
              <button class="button secondary" @click="employeeEdit = clone(e)">
                {{ tr("edit") }}</button
              ><button class="text-button muted" @click="archive(e)">
                {{ tr(e.archived ? "restoreEmployee" : "archive") }}
              </button>
            </article>
          </div>
          <div v-else class="empty">
            <Users :size="36" />
            <h2>{{ tr("noEmployees") }}</h2>
            <p>{{ tr("noEmployeesText") }}</p>
            <button
              class="button primary"
              @click="employeeEdit = employeeDefaults()"
            >
              {{ tr("addEmployee") }}
            </button>
          </div></template
        >
        <template v-else-if="page === 'annual'"
          ><div class="period-toolbar">
            <div class="inline-actions">
              <label
                ><span class="sr-only">{{ tr("year") }}</span
                ><select :aria-label="tr('year')" v-model="year">
                  <option v-for="y in years" :key="y" :value="y">
                    {{ y }}
                  </option>
                </select></label
              ><label
                ><span class="sr-only">{{ tr("employee") }}</span
                ><select :aria-label="tr('employee')" v-model="employeeFilter">
                  <option value="">{{ tr("all") }}</option>
                  <option
                    v-for="e in state.employees"
                    :key="e.id"
                    :value="e.id"
                  >
                    {{ e.firstName }} {{ e.lastName }}
                  </option>
                </select></label
              >
            </div>
            <div class="inline-actions">
              <button
                class="button secondary"
                :disabled="busy || !annual.length"
                @click="annualExport('csv')"
              >
                CSV</button
              ><button
                class="button secondary"
                :disabled="busy || !annual.length"
                @click="annualExport('xlsx')"
              >
                <Download :size="16" />{{ tr("exportExcel") }}</button
              ><button
                class="button primary"
                :disabled="!employeeFilter"
                @click="
                  certificateEmployee = clone(
                    state.employees.find((e) => e.id === employeeFilter)!,
                  );
                  reviewChecked = false;
                "
              >
                {{ tr("certificate") }}
              </button>
            </div>
          </div>
          <p class="hint">
            {{
              tr(employeeFilter ? "certificateReadyHelp" : "certificateSelect")
            }}
          </p>
          <details v-if="missing.length" class="notice">
            <summary>{{ tr("partialYear") }} ({{ missing.length }})</summary>
            <p>{{ missing.join(" · ") }}</p>
          </details>
          <div class="table-scroll" v-if="annual.length">
            <table>
              <thead>
                <tr>
                  <th>{{ tr("employee") }}</th>
                  <th>{{ tr("month") }}</th>
                  <th
                    v-for="k in [
                      'gross',
                      'deductions',
                      'net',
                      'employer',
                      'cost',
                    ]"
                    :key="k"
                    class="num"
                  >
                    {{ tr(k) }}
                  </th>
                  <th v-if="annual.some((p) => p.terms.thirteen)" class="num">
                    {{ tr("thirteenPaid") }}
                  </th>
                  <th>{{ tr("status") }}</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="p in annual"
                  :key="p.id"
                  @click="payrollEdit = clone(p)"
                >
                  <td>
                    <button
                      class="text-button"
                      @click.stop="payrollEdit = clone(p)"
                    >
                      {{ p.employee.firstName }} {{ p.employee.lastName }}
                    </button>
                  </td>
                  <td>{{ months()[Number(p.period.slice(5)) - 1] }}</td>
                  <td
                    v-for="k in [
                      'gross',
                      'deductions',
                      'net',
                      'employer',
                      'cost',
                    ] as const"
                    :key="k"
                    class="num"
                  >
                    {{ p.result.errors.length ? "—" : money(p.result[k]) }}
                  </td>
                  <td v-if="annual.some((p) => p.terms.thirteen)" class="num">
                    {{
                      p.result.errors.length
                        ? "—"
                        : money(p.result.thirteenPaid)
                    }}
                  </td>
                  <td>
                    <span
                      class="badge"
                      :class="p.issued && !p.needsReview ? 'green' : 'amber'"
                      >{{ tr(status(p)) }}</span
                    >
                  </td>
                </tr>
              </tbody>
              <tfoot>
                <tr>
                  <td colspan="2">{{ tr("total") }} CHF</td>
                  <td
                    v-for="k in [
                      'gross',
                      'deductions',
                      'net',
                      'employer',
                      'cost',
                    ] as const"
                    :key="k"
                    class="num"
                  >
                    {{ money(annualTotal[k]) }}
                  </td>
                  <td v-if="annual.some((p) => p.terms.thirteen)" class="num">
                    {{
                      money(
                        sum(
                          annual
                            .filter((p) => !p.result.errors.length)
                            .map((p) => p.result.thirteenPaid),
                        ),
                      )
                    }}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div v-else class="empty">
            <ChartNoAxesCombined :size="34" />
            <h2>{{ tr("noData") }}</h2>
            <p>{{ tr("annualNoData") }}</p>
            <button class="button secondary" @click="navigate('salaries')">
              {{ tr("monthly") }}
            </button>
          </div>
          <section class="form-section">
            <h2>{{ tr("exportHistory") }}</h2>
            <p v-if="!state.exports.length" class="hint">
              {{ tr("emptyHistory") }}
            </p>
            <div
              class="history-item"
              v-for="exp in state.exports
                .filter((x) => x.year === year)
                .slice()
                .reverse()"
              :key="exp.id"
            >
              <span
                >{{ exp.name
                }}<small>{{
                  exp.created.slice(0, 16).replace("T", " ")
                }}</small></span
              ><span class="badge amber" v-if="exp.stale">{{
                tr("stale")
              }}</span
              ><button
                class="button secondary"
                @click="
                  run(async () => {
                    await exportFile(exp.name, exp.data);
                  })
                "
              >
                {{ tr("reopen") }}
              </button>
            </div>
          </section></template
        >
        <SettingsView
          v-else-if="page === 'settings'"
          ref="settingsView"
          v-model:tab="settingsTab"
          :state="state"
          :busy="busy"
          @save="companySave"
          @rules="rulesSave"
        />
      </main>
      <footer class="workspace-footer">
        Easy Salaires <span>CHF · {{ tr("offline") }}</span>
      </footer>
    </div>
  </div>
  <div class="toast" v-if="toast" role="status">
    <Check :size="17" />{{ toast }}
  </div>
  <Modal
    v-if="pendingNavigation"
    :title="tr('leaveChanges')"
    @close="pendingNavigation = null"
    ><p>{{ tr("unsaved") }}</p>
    <template #footer
      ><button class="button secondary" @click="pendingNavigation = null">
        {{ tr("stay") }}</button
      ><button
        class="button primary"
        @click="
          pendingNavigation();
          pendingNavigation = null;
        "
      >
        {{ tr("leave") }}
      </button></template
    ></Modal
  >
  <div class="global-error" v-if="error" role="alert">
    <span>{{ error }}</span
    ><button :aria-label="tr('close')" class="icon-button" @click="error = ''">
      <X :size="18" />
    </button>
  </div>
  <div class="busy-indicator" v-if="busy" role="status">
    {{ tr("pending") }}
  </div>
  <Modal v-if="createOpen" :title="tr('create')" @close="createOpen = false"
    ><form id="create-form" @submit.prevent="createCompany">
      <Field v-model="companyName" :label="tr('companyName')" required />
      <p class="hint">{{ tr("rulesHelp") }}</p>
    </form>
    <template #footer
      ><button class="button primary" form="create-form" :disabled="busy">
        {{ tr("create") }}
      </button></template
    ></Modal
  >
  <EmployeeEditor
    v-if="employeeEdit && state"
    :employee="employeeEdit"
    :is-new="!state.employees.some((e) => e.id === employeeEdit!.id)"
    :has-payroll="state.payrolls.some((p) => p.employeeId === employeeEdit!.id)"
    :contributions="state.rules.at(-1)!.contributions"
    :busy="busy"
    @save="employeeSave"
    @payroll="employeePayroll"
    @close="employeeEdit = null"
  />
  <PayrollEditor
    v-if="payrollEdit && state"
    :key="payrollEdit.id + payrollEdit.updated"
    :payroll="payrollEdit"
    :state="state"
    :busy="busy"
    @close="payrollEdit = null"
    @save="payrollSave"
    @issue="(p) => payrollSave(p, true)"
    @preview="preview"
    @original="original"
    @payment="setPayment"
    @settings="
      (tab) => {
        payrollEdit = null;
        settingsTab = tab;
        navigate('settings');
      }
    "
    @employee="
      employeeEdit = clone(
        state.employees.find((e) => e.id === payrollEdit!.employeeId)!,
      );
      payrollEdit = null;
      page = 'employees';
    "
    @earlier="
      (selected) => {
        payrollEdit = null;
        period = selected;
        page = 'monthly';
      }
    "
  />
  <Modal v-if="previewUrl" :title="tr('preview')" wide @close="closePreview"
    ><iframe
      class="pdf-preview"
      :src="previewUrl"
      :title="tr('preview')"
    ></iframe
  ></Modal>
  <Modal v-if="filesOpen" :title="tr('files')" @close="filesOpen = false"
    ><h3>{{ tr("fileLocation") }}</h3>
    <p class="file-path">{{ path || tr("webDemo") }}</p>
    <div class="backup-status">
      <h3>{{ tr("lastBackup") }}</h3>
      <p v-if="lastBackup">
        {{
          new Date(lastBackup.date).toLocaleString(
            lang === "fr" ? "fr-CH" : "en-CH",
          )
        }}<br /><span class="file-path">{{ lastBackup.path }}</span>
      </p>
      <p v-else class="hint">{{ tr("backupUnknown") }}</p>
    </div>
    <p class="hint">{{ tr("backupManualHelp") }}</p>
    <div class="file-actions">
      <button
        class="button secondary"
        :disabled="!native || busy"
        @click="backup"
      >
        <Download :size="17" />{{ tr("backup") }}</button
      ><button
        class="button secondary"
        :disabled="!native || busy"
        @click="openCompany('restore')"
      >
        <FolderOpen :size="17" />{{ tr("restore") }}
      </button>
      <p class="hint">{{ tr("restoreHelp") }}</p>
      <h3>{{ tr("backupFolder") }}</h3>
      <p class="hint">{{ tr("backupHelp") }}</p>
      <p class="file-path">{{ backupDir || tr("backupDefault") }}</p>
      <button
        class="button secondary"
        :disabled="!native || busy"
        @click="folder"
      >
        {{ tr("chooseFolder") }}</button
      ><button class="text-button" :disabled="busy" @click="switchCompany">
        {{ tr("switchCompany") }} <ArrowUpRight :size="16" />
      </button></div
  ></Modal>
  <Modal
    v-if="certificateEmployee && state"
    :title="tr('certificateReview')"
    @close="certificateEmployee = null"
    ><h3>
      {{ certificateEmployee.firstName }} {{ certificateEmployee.lastName }} ·
      {{ year }}
    </h3>
    <p class="hint">{{ tr("certificateHelp") }}</p>
    <p
      v-if="annualMissing(state, year, certificateEmployee.id).length"
      class="notice"
    >
      {{ tr("certificateIncomplete") }}
    </p>
    <div class="calc-line" v-for="(value, key) in certNumbers" :key="key">
      <strong>{{
        tr(
          (
            {
              gross: "taxGross",
              social: "taxContributions",
              pension: "taxPension",
              net: "taxNet",
            } as const
          )[key],
        )
      }}</strong
      ><span>{{ money(value) }} CHF</span>
    </div>
    <label class="check"
      ><input v-model="review.transport" type="checkbox" />{{
        tr("freeTransport")
      }}</label
    ><label class="check"
      ><input v-model="review.meals" type="checkbox" />{{ tr("meals") }}</label
    ><Field
      v-model="review.remarks"
      :label="tr('remarks15')"
      :max-length="190"
    /><label class="check"
      ><input v-model="reviewChecked" type="checkbox" />{{
        tr("reviewConfirm")
      }}</label
    >
    <div class="inline-actions">
      <button class="text-button" @click="template('form-11-dfe.pdf')">
        {{ tr("blankForm") }}</button
      ><button class="text-button" @click="template('guide-2026-fr.pdf')">
        {{ tr("guide") }}
      </button>
    </div>
    <template #footer
      ><button
        class="button primary"
        :disabled="
          busy ||
          !reviewChecked ||
          annualMissing(state, year, certificateEmployee.id).length > 0
        "
        @click="generateCertificate"
      >
        {{ tr("generateCertificate") }}
      </button></template
    ></Modal
  >
</template>
