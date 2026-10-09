<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import type { Employee, Contribution } from "../domain/types";
import { clone, periodNow } from "../domain/defaults";
import { tr } from "../lib/i18n";
import { termsDiff, validateEmployee } from "../domain/service";
import { d, decimalText } from "../domain/money";
import { addressReady, validAmount } from "../lib/ux";
import Modal from "./Modal.vue";
import Field from "./Field.vue";
import TermsForm from "./TermsForm.vue";
import Tabs from "./Tabs.vue";
const props = defineProps<{
  employee: Employee;
  hasPayroll: boolean;
  isNew?: boolean;
  contributions: Contribution[];
  busy: boolean;
}>();
const emit = defineEmits<{
  save: [Employee];
  payroll: [string, string];
  close: [];
}>();
const selectedPeriod = ref(periodNow());
const draft = ref(clone(props.employee)),
  error = ref("");
const term = ref(clone(draft.value.terms[draft.value.terms.length - 1]!));
term.value.workDays ??= "5";
const initial = JSON.stringify({ draft: draft.value, term: term.value });
const tab = ref("identity");
const tabs = [
  { id: "identity", label: "identityShort" },
  { id: "contract", label: "contractShort" },
  { id: "insurance", label: "insuranceShort" },
  { id: "summary", label: "summaryShort" },
];
const fields = ref<Record<string, string>>({});
const closePrompt = ref(false);
const insuranceIncomplete = computed(
  () =>
    term.value.lpp &&
    (!validAmount(term.value.lppEmployee) ||
      !validAmount(term.value.lppEmployer)),
);
function close() {
  if (JSON.stringify({ draft: draft.value, term: term.value }) !== initial)
    closePrompt.value = true;
  else emit("close");
}
async function validate(scope: "identity" | "contract" | "all") {
  fields.value = {};
  error.value = "";
  if (scope !== "contract") {
    for (const key of ["firstName", "lastName", "birthDate"] as const)
      if (!draft.value[key].trim()) fields.value[key] = tr("required");
    try {
      validateEmployee(draft.value);
    } catch (e) {
      const key = (e as Error).message;
      if (key === "invalidAvs") fields.value.avs = tr(key);
      else if (key === "invalidIban") fields.value.iban = tr(key);
      else if (key === "invalidDate") {
        if (draft.value.end && draft.value.end < draft.value.start)
          fields.value.end = tr(key);
        else error.value = tr(key);
      } else if (key === "employeeRequired" && !draft.value.start)
        fields.value.start = tr("required");
      else error.value = tr(key);
    }
  }
  if (scope !== "identity") {
    if (!validAmount(term.value.salary))
      fields.value.salary = tr("salaryRequired");
    try {
      if (d(term.value.activity).lte(0) || d(term.value.activity).gt(100))
        fields.value.activity = tr("activityError");
    } catch {
      fields.value.activity = tr("activityError");
    }
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(term.value.effective))
      fields.value.effective = tr("invalidPeriod");
    if (
      !draft.value.start ||
      (draft.value.end && draft.value.end < draft.value.start)
    )
      fields.value.start = tr("invalidDate");
  }
  if (Object.keys(fields.value).length || error.value) {
    const identity = ["firstName", "lastName", "birthDate", "avs", "iban"];
    tab.value = Object.keys(fields.value).some((k) => identity.includes(k))
      ? "identity"
      : "contract";
    await nextTick();
    document
      .querySelector<HTMLInputElement>("#employee-form [aria-invalid=true]")
      ?.focus();
    return false;
  }
  return true;
}
async function next() {
  if (tab.value === "identity" && !(await validate("identity"))) return;
  if (tab.value === "contract" && !(await validate("contract"))) return;
  tab.value =
    tabs[Math.min(tabs.findIndex((t) => t.id === tab.value) + 1, 3)]!.id;
}
async function submit() {
  if (!(await validate("all"))) return;
  const result = clone(draft.value);
  const terms = clone(term.value);
  if (terms.mode === "monthly") {
    terms.vacation = false;
    terms.holiday = false;
  }
  const previous = props.employee.terms.at(-1)!;
  const patch = termsDiff(previous, terms);
  result.terms = props.hasPayroll
    ? result.terms.map((t) => ({ ...t, ...clone(patch) }))
    : [{ ...terms, effective: result.start.slice(0, 7) }];
  emit("save", result);
}
</script>
<template>
  <Modal
    :title="isNew ? tr('addEmployee') : `${draft.firstName} ${draft.lastName}`"
    drawer
    @close="close"
  >
    <div v-if="closePrompt" class="notice" role="alert">
      <p>{{ tr("leaveChanges") }}</p>
      <div class="inline-actions">
        <button class="button secondary" @click="closePrompt = false">
          {{ tr("stay") }}</button
        ><button class="button secondary" @click="emit('close')">
          {{ tr("leave") }}
        </button>
      </div>
    </div>
    <form
      id="employee-form"
      @submit.prevent="isNew && tab !== 'summary' ? next() : submit()"
      novalidate
    >
      <p class="hint">{{ tr("optionalHelp") }}</p>
      <p v-if="error" role="alert" class="notice error">{{ error }}</p>
      <Tabs v-model="tab" :items="tabs" :label="tr('employeeTabs')">
        <section v-show="tab === 'identity'">
          <h3>{{ tr("identity") }}</h3>
          <p class="hint">{{ tr("employeeIdentityHelp") }}</p>
          <div class="form-grid">
            <Field
              v-model="draft.firstName"
              :label="tr('firstName')"
              required
              :error="fields.firstName"
            /><Field
              v-model="draft.lastName"
              :label="tr('lastName')"
              required
              :error="fields.lastName"
            />
            <Field
              class="span-2"
              v-model="draft.address"
              :label="tr('address')"
            /><Field v-model="draft.postal" :label="tr('postal')" /><Field
              v-model="draft.city"
              :label="tr('city')"
            />
            <Field
              v-model="draft.birthDate"
              type="date"
              :label="tr('birthDate')"
              required
              :error="fields.birthDate"
            />
            <Field
              v-model="draft.avs"
              :label="tr('avsNumber')"
              placeholder="756.XXXX.XXXX.XX"
              :hint="tr('avsHelp')"
              :error="fields.avs"
            />
            <Field
              class="span-2"
              v-model="draft.iban"
              :label="tr('iban')"
              :hint="tr('ibanHelp')"
              :error="fields.iban"
            />
          </div>
        </section>
        <section v-show="tab === 'contract'">
          <p class="hint">{{ tr("globalContractHelp") }}</p>
          <h3>{{ tr("contractShort") }}</h3>
          <p class="hint">{{ tr("contractHelp") }}</p>
          <div class="form-grid">
            <Field
              v-model="draft.start"
              type="date"
              :label="tr('start')"
              required
              :error="fields.start"
            /><Field
              v-model="draft.end"
              type="date"
              :label="tr('end')"
              :hint="tr('endHelp')"
              :error="fields.end"
            /><label class="field"
              ><span>{{ tr("role") }}</span
              ><select v-model="draft.role">
                <option value="employee">{{ tr("employee") }}</option>
                <option value="owner">{{ tr("owner") }}</option>
              </select></label
            >
          </div>
          <TermsForm
            v-model="term"
            :contributions="contributions"
            part="contract"
            :errors="fields"
          />
        </section>
        <section v-show="tab === 'insurance'">
          <TermsForm
            v-model="term"
            :contributions="contributions"
            part="insurance"
          />
          <p class="notice">{{ tr("noWithholding") }}</p>
        </section>
        <section v-show="tab === 'summary'">
          <h3>{{ tr("summaryShort") }}</h3>
          <p class="hint">{{ tr("summaryHelp") }}</p>
          <dl class="review-list">
            <div>
              <dt>{{ tr("employee") }}</dt>
              <dd>{{ draft.firstName }} {{ draft.lastName }}</dd>
            </div>
            <div>
              <dt>{{ tr("address") }}</dt>
              <dd>
                {{ draft.address || tr("notEntered") }}<br />{{ draft.postal }}
                {{ draft.city }}
              </dd>
            </div>
            <div>
              <dt>{{ tr("start") }}</dt>
              <dd>
                {{
                  draft.start
                    ? draft.start.split("-").reverse().join(".")
                    : tr("notEntered")
                }}
              </dd>
            </div>
            <div>
              <dt>{{ tr("salaryConfirm") }}</dt>
              <dd>
                {{ decimalText(term.salary) || tr("notEntered") }} CHF
                {{ tr(term.mode === "monthly" ? "perMonth" : "perHour") }} ·
                {{ decimalText(term.activity) }} %
              </dd>
            </div>
            <div>
              <dt>{{ tr("thirteen") }}</dt>
              <dd>
                {{
                  tr(
                    term.thirteen
                      ? "contributionActive"
                      : "contributionInactive",
                  )
                }}
              </dd>
            </div>
            <div>
              <dt>{{ tr("lppEmployee") }}</dt>
              <dd>
                {{
                  term.lpp
                    ? `${term.lppEmployee ?? tr("notEntered")} CHF`
                    : tr("contributionInactive")
                }}
              </dd>
            </div>
            <div>
              <dt>{{ tr("lppEmployer") }}</dt>
              <dd>
                {{
                  term.lpp
                    ? `${term.lppEmployer ?? tr("notEntered")} CHF`
                    : tr("contributionInactive")
                }}
              </dd>
            </div>
          </dl>
          <p v-if="insuranceIncomplete" class="notice">
            {{ tr("insuranceMissing") }}
          </p>
          <p v-if="!addressReady(draft)" class="notice">
            {{ tr("addressMissing") }}
          </p>
          <section v-if="hasPayroll" class="form-section">
            <Field
              v-model="selectedPeriod"
              type="month"
              :label="tr('month')"
            /><button
              type="button"
              class="button secondary"
              :disabled="JSON.stringify({ draft, term }) !== initial"
              @click="emit('payroll', employee.id, selectedPeriod)"
            >
              {{ tr("payroll") }}
            </button>
            <p v-if="JSON.stringify({ draft, term }) !== initial" class="hint">
              {{ tr("unsaved") }}
            </p>
          </section>
        </section>
      </Tabs>
    </form>
    <template #footer>
      <button class="button secondary" @click="close">
        {{ tr("cancel") }}
      </button>
      <button
        v-if="tab !== 'identity'"
        class="button secondary"
        @click="tab = tabs[tabs.findIndex((t) => t.id === tab) - 1]!.id"
      >
        {{ tr("back") }}
      </button>
      <button
        v-if="isNew && tab !== 'summary'"
        class="button primary"
        :disabled="busy"
        @click="next"
      >
        {{ tr("next") }}
      </button>
      <button
        v-else
        form="employee-form"
        class="button primary"
        :disabled="busy"
      >
        {{ tr("saveEmployee") }}
      </button>
    </template>
  </Modal>
</template>
