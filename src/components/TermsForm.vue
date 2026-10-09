<script setup lang="ts">
import { computed } from "vue";
import type { Terms, Contribution } from "../domain/types";
import { tr, months } from "../lib/i18n";
import { isMissing, validAmount } from "../lib/ux";
import Field from "./Field.vue";
import ContributionOverrides from "./ContributionOverrides.vue";
const model = defineModel<Terms>({ required: true });
const props = withDefaults(
  defineProps<{
    contributions: Contribution[];
    part?: "contract" | "insurance" | "all";
    errors?: Record<string, string>;
  }>(),
  { part: "all" },
);
const salaryValid = computed(() => validAmount(model.value.salary));
</script>
<template>
  <template v-if="part !== 'insurance'">
    <div class="form-grid">
      <label class="field"
        ><span>{{ tr("mode") }}</span
        ><select v-model="model.mode">
          <option value="monthly">{{ tr("monthlyMode") }}</option>
          <option value="hourly">{{ tr("hourly") }}</option>
        </select></label
      >
      <Field
        v-model="model.activity"
        :label="tr('activity')"
        inputmode="decimal"
        :error="errors?.activity"
      />
      <Field
        class="span-2"
        v-model="model.salary"
        :label="tr(model.mode === 'monthly' ? 'salary' : 'rate')"
        inputmode="decimal"
        required
        :hint="model.mode === 'monthly' ? tr('salaryHelp') : undefined"
        :error="errors?.salary"
      />
    </div>
    <p class="salary-confirmation" v-if="salaryValid" role="status">
      {{ tr("salaryConfirm") }} :
      <strong
        >{{ model.salary }} CHF
        {{ tr(model.mode === "monthly" ? "perMonth" : "perHour") }}</strong
      ><span v-if="model.mode === 'monthly'">
        · {{ tr("atActivity") }} {{ model.activity }} %</span
      >
    </p>
    <div class="form-grid">
      <Field
        v-model="model.weeklyHours"
        :label="tr('weeklyHours')"
        inputmode="decimal"
      /><Field
        v-model="model.workDays"
        :label="tr('workDays')"
        inputmode="decimal"
      />
    </div>
    <section class="form-section">
      <h3>{{ tr("optional") }}</h3>
      <label class="check"
        ><input v-model="model.thirteen" type="checkbox" />{{
          tr("thirteen")
        }}</label
      >
      <div class="form-grid inset" v-if="model.thirteen">
        <label class="field"
          ><span>{{ tr("thirteenMonth") }}</span
          ><select v-model="model.thirteenMonth">
            <option :value="0">{{ tr("monthlyPayment") }}</option>
            <option v-for="(m, i) in months()" :key="m" :value="i + 1">
              {{ m }}
            </option>
          </select></label
        >
        <label class="field"
          ><span>{{ tr("thirteenBase") }}</span
          ><select v-model="model.thirteenBase">
            <option value="base">{{ tr("baseOnly") }}</option>
            <option value="salary">{{ tr("salaryAll") }}</option>
          </select></label
        >
      </div>
      <label class="check"
        ><input type="checkbox" v-model="model.family" />{{
          tr("family")
        }}</label
      ><Field
        class="inset"
        v-if="model.family"
        v-model="model.familyAmount"
        :label="tr('familyAmount')"
        inputmode="decimal"
      />
      <template v-if="model.mode === 'hourly'">
        <label class="check"
          ><input type="checkbox" v-model="model.holiday" />{{
            tr("holiday")
          }}</label
        >
        <div v-if="model.holiday" class="form-grid inset">
          <Field
            v-model="model.holidayRate"
            :label="tr('holidayRate')"
            inputmode="decimal"
          /><label class="field"
            ><span>{{ tr("base") }}</span
            ><select v-model="model.holidayBase">
              <option value="base">{{ tr("monthlySalary") }}</option>
              <option value="baseOvertime">{{ tr("baseOvertime") }}</option>
            </select></label
          >
        </div>
        <label class="check"
          ><input type="checkbox" v-model="model.vacation" />{{
            tr("vacation")
          }}</label
        >
        <div v-if="model.vacation" class="form-grid inset">
          <Field
            v-model="model.vacationRate"
            :label="tr('vacationRate')"
            inputmode="decimal"
          /><label class="field"
            ><span>{{ tr("base") }}</span
            ><select v-model="model.vacationBase">
              <option value="base">{{ tr("monthlySalary") }}</option>
              <option value="baseHoliday">{{ tr("baseHoliday") }}</option>
            </select></label
          >
        </div>
        <p v-if="model.vacation || model.holiday" class="notice">
          {{ tr("contractAllowanceReview") }}
        </p>
      </template>
    </section>
  </template>
  <section
    v-if="part !== 'contract'"
    :class="{ 'form-section': part === 'all' }"
  >
    <h3>{{ tr("pensionTitle") }}</h3>
    <p class="hint">{{ tr("insuranceEmployeeHelp") }}</p>
    <label class="check"
      ><input type="checkbox" v-model="model.lpp" />{{ tr("lpp") }}</label
    >
    <div class="form-grid" v-if="model.lpp">
      <Field
        v-model="model.lppEmployee"
        :label="tr('lppEmployee')"
        inputmode="decimal"
        :placeholder="tr('required')"
        :hint="isMissing(model.lppEmployee) ? tr('required') : undefined"
      /><Field
        v-model="model.lppEmployer"
        :label="tr('lppEmployer')"
        inputmode="decimal"
        :placeholder="tr('required')"
        :hint="isMissing(model.lppEmployer) ? tr('required') : undefined"
      />
    </div>
    <p class="hint">{{ tr("lppHelp") }}</p>
    <details class="form-section">
      <summary>{{ tr("advanced") }}</summary>
      <label class="field"
        ><span>{{ tr("avsStatus") }}</span
        ><select v-model="model.avsStatus">
          <option
            v-for="v in ['standard', 'exempt', 'retired', 'retiredWaiver']"
            :value="v"
            :key="v"
          >
            {{ tr(v) }}
          </option>
        </select></label
      >
      <Field v-model="model.exemptionReason" :label="tr('exemptionReason')" />
      <details class="form-section">
        <summary>{{ tr("overrides") }}</summary>
        <p class="hint">{{ tr("overrideHelpV2") }}</p>
        <ContributionOverrides
          v-model="model.overrides"
          :contributions="contributions"
        />
      </details>
    </details>
  </section>
</template>
