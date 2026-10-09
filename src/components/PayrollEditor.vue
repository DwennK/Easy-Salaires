<script setup lang="ts">
import { computed, ref } from "vue";
import {
  Plus,
  Trash2,
  FileText,
  Download,
  ExternalLink,
} from "lucide-vue-next";
import type { Payroll, State, Element, Revision } from "../domain/types";
import { clone, uid } from "../domain/defaults";
import { applicable, calculate } from "../domain/payroll";
import { missingEarlier } from "../domain/service";
import { d, francs, money as formatMoney } from "../domain/money";
import { tr, periodLabel, lang } from "../lib/i18n";
import Modal from "./Modal.vue";
import Field from "./Field.vue";
import { addressReady } from "../lib/ux";
import TermsForm from "./TermsForm.vue";
const money = (value: number) => formatMoney(value, lang.value);
const props = defineProps<{ payroll: Payroll; state: State; busy: boolean }>();
const emit = defineEmits<{
  save: [Payroll];
  issue: [Payroll];
  preview: [Payroll];
  original: [Revision, boolean];
  payment: [string, string, string | null];
  close: [];
  settings: [string];
  employee: [];
  earlier: [string];
}>();
const draft = ref(clone(props.payroll)),
  editing = ref(!props.payroll.issued),
  adding = ref(false),
  payment = ref(
    props.payroll.paidDate || new Date().toLocaleDateString("sv-SE"),
  ),
  localError = ref("");
const paymentAmount = ref<string | null>(
  francs(props.payroll.paidAmount ?? props.payroll.result.net),
);
draft.value.terms.workDays ??= "5";
const initialInput = JSON.stringify(draft.value);
const leaveTarget = ref<"close" | "settings" | string>("");
const leavePrompt = ref(false);
function requestLeave(target = "close") {
  if (JSON.stringify(draft.value) !== initialInput) {
    leaveTarget.value = target;
    leavePrompt.value = true;
  } else leave(target);
}
function leave(target: string) {
  if (target === "settings") emit("settings", "rules");
  else if (target === "company") emit("settings", "company");
  else if (target === "employee") emit("employee");
  else if (target === "close") emit("close");
  else emit("earlier", target);
}
const addressesMissing = computed(
  () =>
    !addressReady(draft.value.company) || !addressReady(draft.value.employee),
);
const conditionsOpen = ref(false);
const correctionMode = ref(false);
const correctionPrompt = ref(false);
const result = computed(() =>
  editing.value
    ? calculate(
        draft.value.employee,
        draft.value.terms,
        draft.value.rules,
        draft.value.input,
        draft.value.period,
        props.state.payrolls,
      )
    : draft.value.result,
);
const earlier = computed(() => missingEarlier(props.state, draft.value));
const revisions = computed(() =>
  props.state.revisions
    .filter((r) => r.payrollId === draft.value.id)
    .sort((a, b) => b.number - a.number),
);
function add(kind: Element["kind"]) {
  draft.value.input.elements.push({
    id: uid(),
    kind,
    label: "",
    quantity: "1",
    unit: "hours",
    rate:
      kind === "overtime" && draft.value.terms.mode === "hourly"
        ? draft.value.terms.salary
        : "",
    premium: "",
    amount: "",
    paid: kind === "absence",
    avs: true,
    laa: true,
    thirteen: false,
  });
  adding.value = false;
}
function propose(el: Element) {
  try {
    const terms = draft.value.terms;
    const hours = d(terms.weeklyHours).mul(52).div(12);
    const hourly =
      terms.mode === "monthly" ? d(terms.salary).div(hours) : d(terms.salary);
    el.amount = hourly
      .mul(el.quantity)
      .mul(el.unit === "days" ? d(terms.weeklyHours).div(terms.workDays) : 1)
      .toFixed(2);
  } catch {
    localError.value = tr("invalidNumber");
  }
}
function current() {
  const e = props.state.employees.find((e) => e.id === draft.value.employeeId)!;
  draft.value.employee = clone(e);
  draft.value.company = clone(props.state.company);
  draft.value.terms = clone(
    applicable(e.terms, draft.value.period) ?? draft.value.terms,
  );
  draft.value.rules = clone(
    applicable(
      props.state.rules.filter(
        (r) => r.year === Number(draft.value.period.slice(0, 4)),
      ),
      draft.value.period,
    ) ?? draft.value.rules,
  );
}
function payload() {
  return {
    ...clone(draft.value),
    issued: editing.value ? false : draft.value.issued,
    result: clone(result.value),
  };
}
</script>
<template>
  <Modal
    :title="`${draft.employee.firstName} ${draft.employee.lastName}`"
    drawer
    @close="requestLeave()"
    ><div v-if="leavePrompt" class="notice" role="alert">
      <p>{{ tr("leaveChanges") }}</p>
      <div class="inline-actions">
        <button class="button secondary" @click="leavePrompt = false">
          {{ tr("stay") }}</button
        ><button class="button secondary" @click="leave(leaveTarget)">
          {{ tr("leave") }}
        </button>
      </div>
    </div>
    <div class="drawer-subtitle">
      {{ periodLabel(draft.period) }}
      <span class="badge" :class="editing ? 'amber' : 'green'">{{
        tr(editing ? "draft" : "complete")
      }}</span>
    </div>
    <p v-if="localError" class="notice error" role="alert">{{ localError }}</p>
    <div class="pay-hero">
      <span>{{ tr("net") }}</span
      ><strong
        >{{ result.errors.length ? "—" : money(result.net) }}
        <small>CHF</small></strong
      >
      <div>
        <span
          >{{ tr("gross") }}
          <b>{{ result.errors.length ? "—" : money(result.gross) }}</b></span
        ><span
          >{{ tr("deductions") }}
          <b>{{
            result.errors.length ? "—" : money(result.deductions)
          }}</b></span
        >
      </div>
    </div>
    <template v-if="editing"
      ><div class="notice error" v-if="result.errors.length">
        <strong>{{ tr("helpMissing") }}</strong>
        <ul>
          <li v-for="err in result.errors" :key="err">{{ tr(err) }}</li>
        </ul>
      </div>
      <div class="notice" v-if="earlier.length">
        <p>{{ tr("earlierMissing") }}</p>
        <div class="inline-actions">
          <button
            v-for="p in earlier"
            :key="p"
            class="text-button"
            @click="requestLeave(p)"
          >
            {{ periodLabel(p) }}
          </button>
        </div>
      </div>
      <div class="notice" v-if="addressesMissing">
        <p>{{ tr("addressMissing") }}</p>
        <button
          v-if="!addressReady(draft.company)"
          class="text-button"
          @click="requestLeave('company')"
        >
          {{ tr("resolveSettings") }}
        </button>
        <template v-if="!addressReady(draft.employee)"
          ><p class="hint">{{ tr("employeeAddressHelp") }}</p>
          <button class="text-button" @click="requestLeave('employee')">
            {{ tr("editEmployee") }}
          </button></template
        >
      </div>
      <p
        v-if="
          result.errors.some(
            (e) => e.startsWith('missing:') || e === 'yearNotVerified',
          )
        "
        class="hint"
      >
        <button class="text-button" @click="requestLeave('settings')">
          {{ tr("resolveSettings") }}
        </button>
      </p>
      <p
        v-if="
          result.errors.some((e) =>
            [
              'lppEmployeeRequired',
              'lppEmployerRequired',
              'salaryRequired',
              'referenceAgeReview',
              'exemptionReasonRequired',
            ].includes(e),
          )
        "
      >
        <button class="text-button" @click="conditionsOpen = true">
          {{ tr("completeConditions") }}
        </button>
      </p>
      <p class="notice" v-if="correctionMode">{{ tr("correctionsNotice") }}</p>
      <p class="notice" v-for="warning in result.warnings" :key="warning">
        {{ tr(warning) }}
      </p>
      <Field
        v-if="draft.terms.mode === 'hourly'"
        v-model="draft.input.hours"
        :label="tr('hours')"
        :hint="tr('hoursHelp')"
        :error="
          result.errors.includes('hoursRequired')
            ? tr('hoursRequired')
            : undefined
        "
        placeholder="—"
        inputmode="decimal" />
      <div v-else class="salary-line">
        <span>{{ tr("monthlySalary") }}</span
        ><strong>{{ draft.terms.salary }} CHF</strong>
      </div>
      <div v-for="el in draft.input.elements" :key="el.id" class="element">
        <header>
          <h3>{{ tr(el.kind) }}</h3>
          <button
            class="icon-button"
            :aria-label="tr('remove')"
            @click="
              draft.input.elements = draft.input.elements.filter(
                (x) => x.id !== el.id,
              )
            "
          >
            <Trash2 :size="16" />
          </button>
        </header>
        <Field v-model="el.label" :label="tr('label')" />
        <div class="form-grid" v-if="el.kind !== 'adjustment'">
          <Field
            v-model="el.quantity"
            :label="tr('quantity')"
            inputmode="decimal"
          /><label class="field"
            ><span>{{ tr("unit") }}</span
            ><select v-model="el.unit">
              <option value="hours">{{ tr("hoursUnit") }}</option>
              <option v-if="el.kind === 'absence'" value="days">
                {{ tr("days") }}
              </option>
            </select></label
          >
        </div>
        <div class="form-grid" v-if="el.kind === 'overtime'">
          <Field
            v-model="el.rate"
            :label="tr('rate')"
            inputmode="decimal"
          /><Field
            v-model="el.premium"
            :label="tr('premium')"
            inputmode="decimal"
          />
        </div>
        <template v-if="el.kind === 'absence'"
          ><label class="check"
            ><input type="checkbox" v-model="el.paid" />{{
              tr("paidAbsence")
            }}</label
          ><template v-if="!el.paid"
            ><Field
              v-model="el.amount"
              :label="tr('deductAmount')"
              inputmode="decimal"
            /><button class="text-button" @click="propose(el)">
              {{ tr("proposeAbsence") }}
            </button>
            <p class="hint">{{ tr("absenceHelp") }}</p></template
          ></template
        ><template v-if="el.kind === 'adjustment'"
          ><Field
            v-model="el.amount"
            :label="tr('amount')"
            inputmode="decimal"
          /><label class="check"
            ><input type="checkbox" v-model="el.avs" />{{
              tr("avsSubject")
            }}</label
          ><label class="check"
            ><input type="checkbox" v-model="el.laa" />{{
              tr("laaSubject")
            }}</label
          ></template
        ><label
          class="check"
          v-if="draft.terms.thirteen && el.kind !== 'absence'"
          ><input type="checkbox" v-model="el.thirteen" />{{
            tr("thirteenSubject")
          }}</label
        >
      </div>
      <div class="add-element">
        <button class="button secondary" @click="adding = !adding">
          <Plus :size="16" />{{ tr("addElement") }}
        </button>
        <div v-if="adding" class="inline-actions">
          <button
            v-for="kind in ['overtime', 'absence', 'adjustment'] as const"
            :key="kind"
            class="button secondary"
            @click="add(kind)"
          >
            {{ tr(kind) }}
          </button>
        </div>
      </div>
      <details class="form-section">
        <summary>{{ tr("prorata") }} · {{ result.prorata }}</summary>
        <p class="hint">{{ tr("prorataHelp") }}</p>
        <template v-if="draft.terms.mode === 'monthly'"
          ><Field
            v-model="draft.input.prorata"
            :label="tr('overrideRatio')"
            inputmode="decimal"
          /><Field
            v-if="draft.input.prorata !== null"
            v-model="draft.input.prorataReason"
            :label="tr('reason')"
          /><button class="text-button" @click="draft.input.prorata = null">
            {{ tr("resetRatio") }}
          </button></template
        >
      </details>
      <details
        class="form-section"
        :open="conditionsOpen"
        @toggle="conditionsOpen = ($event.target as HTMLDetailsElement).open"
      >
        <summary>{{ tr("conditions") }}</summary>
        <p class="hint">{{ tr("monthOnlyHelp") }}</p>
        <button class="button secondary" @click="current">
          {{ tr("applyCurrent") }}
        </button>
        <p class="hint">{{ tr("applyCurrentHelp") }}</p>
        <TermsForm
          v-model="draft.terms"
          :contributions="draft.rules.contributions"
        />
      </details>
      <Field v-model="draft.input.note" :label="tr('note')"
    /></template>
    <details class="form-section">
      <summary>{{ tr("details") }}</summary>
      <div class="calc-line" v-for="line in result.lines" :key="line.id">
        <div>
          <strong>{{ tr(line.label) }}</strong
          ><small
            >{{ tr("base") }} {{ line.base }} CHF · {{ line.quantity }} ×
            {{ line.rate || "—" }} ·
            {{
              /^https:\/\//.test(line.origin)
                ? tr("sourcePreset")
                : tr(line.origin)
            }}</small
          >
        </div>
        <span>{{ money(line.amount) }}</span>
      </div>
      <div v-if="draft.terms.thirteen" class="form-grid">
        <p>
          {{ tr("acquired") }}<br /><b
            >{{ d(result.accrual).toFixed(2) }} CHF</b
          >
        </p>
        <p>
          {{ tr("balance") }}<br /><b
            >{{ d(result.thirteenBalance).toFixed(2) }} CHF</b
          >
        </p>
      </div>
    </details>
    <section class="form-section">
      <h3>{{ tr("payment") }}</h3>
      <p class="hint">{{ tr("paymentHelp") }}</p>
      <p class="notice" v-if="draft.paymentReview">{{ tr("paymentReview") }}</p>
      <div class="inline-actions">
        <Field
          v-model="paymentAmount"
          inputmode="decimal"
          :label="tr('paidAmount')"
        />
        <Field
          v-model="payment"
          type="date"
          :label="tr('paymentDate')"
        /><button
          class="button secondary"
          :disabled="
            busy || !payment || paymentAmount == null || paymentAmount === ''
          "
          @click="emit('payment', draft.id, payment, paymentAmount)"
        >
          {{ tr("markPaid") }}
        </button>
      </div>
      <button
        v-if="draft.paidDate"
        class="text-button"
        :disabled="busy"
        @click="emit('payment', draft.id, '', null)"
      >
        {{ tr("clearPayment") }}
      </button>
      <button
        v-if="!editing"
        class="button secondary"
        @click="correctionPrompt = true"
      >
        {{ tr("correction") }}
      </button>
      <div v-if="correctionPrompt" class="notice" role="alert">
        <p>{{ tr("correctionsNotice") }}</p>
        <div class="inline-actions">
          <button class="button secondary" @click="correctionPrompt = false">
            {{ tr("cancel") }}</button
          ><button
            class="button primary"
            @click="
              editing = true;
              correctionMode = true;
              correctionPrompt = false;
            "
          >
            {{ tr("correction") }}
          </button>
        </div>
      </div>
      <p class="hint">{{ tr("correctionHelp") }}</p>
    </section>
    <section class="form-section">
      <h3>{{ tr("history") }}</h3>
      <p v-if="!revisions.length" class="hint">{{ tr("noRevision") }}</p>
      <div class="history-item" v-for="r in revisions" :key="r.id">
        <span
          >r{{ r.number }} · {{ r.created.slice(0, 10) }} ·
          {{ r.lang.toUpperCase() }}</span
        >
        <div class="inline-actions">
          <button
            class="icon-button"
            :aria-label="tr('original')"
            @click="emit('original', r, false)"
          >
            <Download :size="17" /></button
          ><button
            class="icon-button"
            :aria-label="tr('print')"
            @click="emit('original', r, true)"
          >
            <ExternalLink :size="17" />
          </button>
        </div>
      </div>
    </section>
    <template #footer
      ><p class="footer-help" v-if="editing">{{ tr("issueHelp") }}</p>
      <button
        class="button secondary"
        @click="emit('preview', payload())"
        :disabled="busy || result.errors.length > 0"
      >
        <FileText :size="16" />{{ tr("preview") }}</button
      ><button
        v-if="editing"
        class="button secondary"
        :disabled="busy"
        @click="emit('save', payload())"
      >
        {{ tr("saveDraft") }}</button
      ><button
        v-if="editing"
        class="button primary"
        :disabled="
          busy ||
          result.errors.length > 0 ||
          earlier.length > 0 ||
          addressesMissing
        "
        @click="emit('issue', payload())"
      >
        {{ tr("issue") }}
      </button></template
    ></Modal
  >
</template>
