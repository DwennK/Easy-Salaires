<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
  ArrowRight,
  FileText,
  Eye,
  Plus,
  Pencil,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Users,
} from "lucide-vue-next";
import type { State, Payroll, Employee } from "../domain/types";
import { clone, today } from "../domain/defaults";
import { activeIn } from "../domain/payroll";
import { prepareMonth } from "../domain/service";
import { money, sum, francs, decimalText } from "../domain/money";
import { tr, months, lang } from "../lib/i18n";
import Modal from "./Modal.vue";
import Field from "./Field.vue";
const props = defineProps<{ state: State; busy: boolean }>();
const year = defineModel<number>("year", { required: true });
const employeeId = defineModel<string>("employeeId", { required: true });
const emit = defineEmits<{
  editEmployee: [Employee];
  addEmployee: [];
  detail: [string, string];
  pdf: [string, string];
  preview: [string, string];
  cell: [string, string, "salary" | "hours", string, boolean];
  extras: [string, string, string, string];
  payment: [string, string, string, string | null];
  reset: [string, string];
}>();
const allEmployees = computed(() =>
  props.state.employees.filter(
    (e) =>
      !e.archived ||
      props.state.payrolls.some(
        (p) => p.employeeId === e.id && p.period.startsWith(String(year.value)),
      ),
  ),
);
watch(
  allEmployees,
  (list) => {
    if (!list.some((e) => e.id === employeeId.value))
      employeeId.value = list[0]?.id ?? "";
  },
  { immediate: true },
);
const employee = computed(() =>
  props.state.employees.find((e) => e.id === employeeId.value),
);
const rows = computed(() => {
  const s = clone(props.state);
  return Array.from({ length: 12 }, (_, i) => {
    const period = `${year.value}-${String(i + 1).padStart(2, "0")}`;
    const stored = props.state.payrolls.find(
      (p) => p.employeeId === employeeId.value && p.period === period,
    );
    const active = !!employee.value && activeIn(employee.value, period);
    if (active && !stored) {
      try {
        prepareMonth(s, period, employeeId.value);
      } catch {
        /* Missing year is displayed, never defaulted to zero. */
      }
    }
    return {
      period,
      stored: !!stored,
      active,
      p: s.payrolls.find(
        (p) => p.employeeId === employeeId.value && p.period === period,
      ),
    };
  });
});
const saved = computed(() =>
  rows.value
    .filter((r) => r.stored && r.p && !r.p.result.errors.length)
    .map((r) => r.p!),
);
const totals = computed(() => ({
  net: sum(saved.value.map((p) => p.result.net)),
  gross: sum(saved.value.map((p) => p.result.gross)),
  deductions: sum(saved.value.map((p) => p.result.deductions)),
  paid: sum(
    rows.value.map(
      (r) => r.p?.paidAmount ?? (r.p?.paidDate ? r.p.result.net : 0),
    ),
  ),
}));
const fmt = (n: number) => money(n, lang.value);
const extra = computed(() =>
  extraPeriod.value
    ? rows.value.find((r) => r.period === extraPeriod.value)?.p
    : null,
);
const extraPeriod = ref(""),
  bonus = ref<string | null>(""),
  expenses = ref<string | null>("");
function showExtras(p: Payroll) {
  extraPeriod.value = p.period;
  bonus.value =
    p.input.elements.find((e) => e.id === "annual-bonus")?.amount ?? "";
  expenses.value =
    p.input.elements.find((e) => e.id === "annual-expenses")?.amount ?? "";
}
const paymentPeriod = ref(""),
  paymentDate = ref<string | null>(""),
  paymentAmount = ref<string | null>("");
function showPayment(p: Payroll) {
  paymentPeriod.value = p.period;
  paymentDate.value = p.paidDate || today();
  paymentAmount.value = francs(p.paidAmount ?? p.result.net);
}
const repeat = ref<{ period: string; value: string } | null>(null);
function change(period: string, key: "salary" | "hours", event: Event) {
  const input = event.target as HTMLInputElement;
  input.value = decimalText(input.value);
  emit("cell", employeeId.value, period, key, input.value, false);
}
function rowStatus(row: (typeof rows.value)[number]) {
  return !row.active
    ? "outsideContract"
    : !row.p
      ? "yearNotVerified"
      : row.p.result.errors.length
        ? "incomplete"
        : !row.stored
          ? "forecast"
          : row.p.issued
            ? "pdfCreated"
            : props.state.revisions.some((r) => r.payrollId === row.p!.id)
              ? "pdfOutdated"
              : "draft";
}
watch(
  () => props.state,
  () => {
    extraPeriod.value = "";
    paymentPeriod.value = "";
    repeat.value = null;
  },
);
</script>
<template>
  <section class="annual-workspace">
    <div class="year-workbar">
      <label class="employee-picker"
        ><span>{{ tr("employee") }}</span
        ><select v-model="employeeId" :aria-label="tr('employee')">
          <option v-for="e in allEmployees" :key="e.id" :value="e.id">
            {{ e.firstName }} {{ e.lastName
            }}{{ e.archived ? ` · ${tr("archived")}` : "" }}
          </option>
        </select></label
      >
      <div class="year-stepper">
        <button
          class="icon-button"
          :aria-label="tr('previousYear')"
          @click="year--"
        >
          <ChevronLeft :size="17" /></button
        ><input
          type="number"
          min="2000"
          max="2100"
          v-model.number="year"
          :aria-label="tr('year')"
        /><button
          class="icon-button"
          :aria-label="tr('nextYear')"
          @click="year++"
        >
          <ChevronRight :size="17" />
        </button>
      </div>
      <button
        v-if="employee"
        class="button secondary"
        @click="emit('editEmployee', clone(employee))"
      >
        <Pencil :size="15" />{{ tr("employeeInformation") }}
      </button>
      <button v-else class="button primary" @click="emit('addEmployee')">
        <Plus :size="16" />{{ tr("addEmployee") }}
      </button>
    </div>
    <template v-if="employee">
      <div class="year-overview">
        <div class="year-identity">
          <span class="v2-avatar"
            >{{ employee.firstName[0] }}{{ employee.lastName[0] }}</span
          >
          <div>
            <h2>{{ employee.firstName }} {{ employee.lastName }}</h2>
            <span>{{ tr("yearOverview") }} · {{ year }}</span>
          </div>
        </div>
        <div class="year-total">
          <span>{{ tr("netRecorded") }}</span
          ><strong>{{ fmt(totals.net) }} <small>CHF</small></strong>
        </div>
        <div class="year-total">
          <span>{{ tr("paidRecorded") }}</span
          ><strong>{{ fmt(totals.paid) }} <small>CHF</small></strong>
        </div>
      </div>
      <div class="year-table-caption">
        <span>{{ tr("annualEditingHelp") }}</span
        ><span class="table-legend"><i></i>{{ tr("editableCells") }}</span>
      </div>
      <div class="year-table-scroll" tabindex="0" :aria-label="tr('yearTable')">
        <table class="year-grid">
          <thead>
            <tr>
              <th>{{ tr("month") }}</th>
              <th>{{ tr("baseSalary") }}</th>
              <th>{{ tr("extras") }}</th>
              <th>{{ tr("deductions") }}</th>
              <th>{{ tr("net") }}</th>
              <th>{{ tr("paidAmount") }}</th>
              <th>{{ tr("paymentDate") }}</th>
              <th>
                <span class="sr-only">{{ tr("actions") }}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(row, i) in rows"
              :key="row.period"
              :data-period="row.period"
              :class="{
                'inactive-month': !row.active,
                'forecast-month': !row.stored,
              }"
            >
              <th scope="row">
                <button
                  class="month-link"
                  :disabled="!row.active || busy"
                  @click="emit('detail', employeeId, row.period)"
                >
                  <span>{{ String(i + 1).padStart(2, "0") }}</span
                  >{{ months()[i] }}</button
                ><small
                  :class="{ 'needs-attention': row.p?.result.errors.length }"
                  >{{ tr(rowStatus(row)) }}</small
                >
              </th>
              <template v-if="row.p && row.active">
                <td>
                  <div class="salary-cell">
                    <input
                      class="grid-input"
                      inputmode="decimal"
                      :aria-label="`${tr('baseSalary')} ${months()[i]}`"
                      :value="decimalText(row.p.terms.salary)"
                      :disabled="busy"
                      @change="change(row.period, 'salary', $event)"
                    /><button
                      class="cell-repeat"
                      :disabled="busy"
                      :aria-label="`${tr('applyFollowing')} ${months()[i]}`"
                      @click="
                        repeat = {
                          period: row.period,
                          value: row.p!.terms.salary,
                        }
                      "
                    >
                      <ArrowRight :size="13" />
                    </button>
                  </div>
                  <label v-if="row.p.terms.mode === 'hourly'" class="hours-cell"
                    ><input
                      class="grid-input"
                      inputmode="decimal"
                      :aria-label="`${tr('hours')} ${months()[i]}`"
                      :value="decimalText(row.p.input.hours)"
                      :placeholder="tr('hours')"
                      :disabled="busy"
                      @change="change(row.period, 'hours', $event)"
                    />
                    h</label
                  ><button
                    v-if="row.p.termOverrides?.salary !== undefined"
                    class="inherited-reset"
                    :disabled="busy"
                    @click="emit('reset', employeeId, row.period)"
                  >
                    <RotateCcw :size="10" />{{ tr("restoreSalary") }}
                  </button>
                </td>
                <td>
                  <button
                    class="grid-edit-button"
                    :disabled="busy"
                    :aria-label="`${tr('extras')} ${months()[i]}`"
                    @click="showExtras(row.p)"
                  >
                    {{
                      row.p.result.errors.length
                        ? "—"
                        : fmt(
                            row.p.result.gross +
                              (row.p.result.reimbursements ?? 0) -
                              (row.p.result.lines.find(
                                (l) =>
                                  l.id === "monthlySalary" ||
                                  l.id === "hourlySalary",
                              )?.amount ?? 0),
                          )
                    }}
                    <Plus :size="12" />
                  </button>
                </td>
                <td class="numeric">
                  <button
                    class="amount-detail"
                    :disabled="busy"
                    :aria-label="`${tr('deductions')} ${months()[i]}`"
                    @click="emit('detail', employeeId, row.period)"
                  >
                    {{
                      row.p.result.errors.length
                        ? "—"
                        : fmt(row.p.result.deductions)
                    }}
                  </button>
                </td>
                <td class="numeric net-cell">
                  {{ row.p.result.errors.length ? "—" : fmt(row.p.result.net) }}
                </td>
                <td>
                  <button
                    class="grid-edit-button payment-cell"
                    :class="{ difference: row.p.paymentReview }"
                    :disabled="busy || row.p.result.errors.length > 0"
                    :aria-label="`${tr('payment')} ${months()[i]}`"
                    @click="showPayment(row.p)"
                  >
                    {{
                      row.p.paidAmount != null
                        ? fmt(row.p.paidAmount)
                        : tr("recordPaymentShort")
                    }}</button
                  ><small v-if="row.p.paymentReview" class="needs-attention"
                    >{{ tr("paymentDifference") }}
                    {{ fmt((row.p.paidAmount ?? 0) - row.p.result.net) }}</small
                  >
                </td>
                <td class="payment-date">
                  {{
                    row.p.paidDate
                      ? row.p.paidDate.split("-").reverse().join(".")
                      : "—"
                  }}
                </td>
                <td>
                  <div class="payroll-pdf-actions">
                    <button
                      class="icon-button pdf-action"
                      :disabled="busy || row.p.result.errors.length > 0"
                      :aria-label="`${tr('viewPdf')} ${months()[i]}`"
                      :title="tr('viewPdf')"
                      @click="emit('preview', employeeId, row.period)"
                    >
                      <Eye :size="17" />
                    </button>
                    <button
                      class="icon-button pdf-action"
                      :disabled="busy || row.p.result.errors.length > 0"
                      :aria-label="`PDF ${months()[i]}`"
                      :title="tr('downloadPdf')"
                      @click="emit('pdf', employeeId, row.period)"
                    >
                      <FileText :size="17" />
                    </button>
                  </div>
                </td>
              </template>
              <td v-else colspan="7" class="unavailable-month">
                {{ tr(row.active ? "configureYearFirst" : "outsideContract") }}
              </td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <th colspan="3">
                {{ tr("recordedTotals") }}
                <small>{{ saved.length }} {{ tr("monthsRecorded") }}</small>
              </th>
              <td class="numeric">{{ fmt(totals.deductions) }}</td>
              <td class="numeric">{{ fmt(totals.net) }}</td>
              <td class="numeric">{{ fmt(totals.paid) }}</td>
              <td colspan="2">CHF</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p class="year-footnote">{{ tr("forecastHelp") }}</p>
    </template>
    <div v-else class="empty-state">
      <Users :size="32" />
      <h2>{{ tr("startWithEmployee") }}</h2>
      <p>{{ tr("startWithEmployeeHelp") }}</p>
      <button class="button primary" @click="emit('addEmployee')">
        <Plus :size="16" />{{ tr("addEmployee") }}
      </button>
    </div>
  </section>
  <Modal
    v-if="extraPeriod"
    :title="`${tr('extras')} · ${months()[Number(extraPeriod.slice(5)) - 1]}`"
    @close="extraPeriod = ''"
  >
    <p class="hint">{{ tr("extrasHelp") }}</p>
    <Field
      v-model="bonus"
      :label="tr('bonusAmount')"
      inputmode="decimal"
    /><Field
      v-model="expenses"
      :label="tr('expensesAmount')"
      inputmode="decimal"
    />
    <p v-if="extra" class="hint">{{ tr("otherElementsPreserved") }}</p>
    <button
      class="text-button"
      @click="
        emit('detail', employeeId, extraPeriod);
        extraPeriod = '';
      "
    >
      {{ tr("allMonthDetails") }} <ArrowRight :size="14" />
    </button>
    <template #footer
      ><button
        class="button primary"
        :disabled="busy"
        @click="
          emit('extras', employeeId, extraPeriod, bonus || '0', expenses || '0')
        "
      >
        {{ tr("save") }}
      </button></template
    >
  </Modal>
  <Modal
    v-if="paymentPeriod"
    :title="`${tr('payment')} · ${months()[Number(paymentPeriod.slice(5)) - 1]}`"
    @close="paymentPeriod = ''"
  >
    <p class="hint">{{ tr("paymentHelp") }}</p>
    <Field
      v-model="paymentAmount"
      :label="tr('paidAmount')"
      inputmode="decimal"
    /><Field v-model="paymentDate" :label="tr('paymentDate')" type="date" />
    <template #footer
      ><button
        class="button secondary"
        :disabled="busy"
        @click="emit('payment', employeeId, paymentPeriod, '', null)"
      >
        {{ tr("clearPayment") }}</button
      ><button
        class="button primary"
        :disabled="
          busy || !paymentDate || paymentAmount == null || paymentAmount === ''
        "
        @click="
          emit(
            'payment',
            employeeId,
            paymentPeriod,
            paymentDate!,
            paymentAmount,
          )
        "
      >
        {{ tr("save") }}
      </button></template
    >
  </Modal>
  <Modal v-if="repeat" :title="tr('applyFollowing')" @close="repeat = null"
    ><p>{{ tr("followingHelp") }}</p>
    <Field
      v-model="repeat.value"
      :label="tr('baseSalary')"
      inputmode="decimal"
    /><template #footer
      ><button
        class="button primary"
        :disabled="busy"
        @click="
          emit(
            'cell',
            employeeId,
            repeat!.period,
            'salary',
            repeat!.value,
            true,
          )
        "
      >
        {{ tr("applyFollowing") }}
      </button></template
    ></Modal
  >
</template>
