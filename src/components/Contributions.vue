<script setup lang="ts">
import type { Contribution } from "../domain/types";
import { tr } from "../lib/i18n";
import { isMissing, validAmount } from "../lib/ux";
import Field from "./Field.vue";
const model = defineModel<Contribution[]>({ required: true });
defineProps<{ disabled?: boolean; group?: "preset" | "insurance" }>();
function markCustom(c: Contribution) {
  if (/^https:\/\//.test(c.source)) c.source = "manual";
}
const insurance = (c: Contribution) => ["aap", "aanp", "ijm"].includes(c.id);
</script>
<template>
  <div class="contributions">
    <section
      v-for="c in model.filter(
        (c) => !group || (group === 'insurance') === insurance(c),
      )"
      :key="c.id"
      class="contribution"
      :aria-label="tr(c.label)"
    >
      <div class="contribution-heading">
        <label class="check"
          ><input
            type="checkbox"
            v-model="c.active"
            :disabled="disabled"
          /><strong>{{ tr(c.label) }}</strong></label
        >
        <span
          class="badge"
          :class="
            !c.active
              ? 'neutral'
              : isMissing(c.employee) || isMissing(c.employer)
                ? 'amber'
                : 'green'
          "
          >{{
            tr(
              !c.active
                ? "contributionInactive"
                : isMissing(c.employee) || isMissing(c.employer)
                  ? "toComplete"
                  : "contributionActive",
            )
          }}</span
        >
      </div>
      <template v-if="c.active">
        <div class="form-grid contribution-rates">
          <Field
            v-model="c.employee"
            @update:model-value="markCustom(c)"
            :label="`${tr('employeePays')} (${c.kind === 'percent' ? '%' : 'CHF'})`"
            inputmode="decimal"
            :disabled="disabled"
            :placeholder="tr('required')"
            :hint="isMissing(c.employee) ? tr('required') : undefined"
            :error="
              !isMissing(c.employee) && !validAmount(c.employee)
                ? tr('numberPositive')
                : undefined
            "
          />
          <Field
            v-model="c.employer"
            @update:model-value="markCustom(c)"
            :label="`${tr('employerPays')} (${c.kind === 'percent' ? '%' : 'CHF'})`"
            inputmode="decimal"
            :disabled="disabled"
            :placeholder="tr('required')"
            :hint="isMissing(c.employer) ? tr('required') : undefined"
            :error="
              !isMissing(c.employer) && !validAmount(c.employer)
                ? tr('numberPositive')
                : undefined
            "
          />
        </div>
        <p class="hint calculation-summary">
          {{
            c.kind === "fixed"
              ? tr("fixedHelp")
              : `${tr("base")} : ${tr(`calculation_${c.base}`)}`
          }}
        </p>
        <details class="calculation-options">
          <summary>{{ tr("calculationDetails") }}</summary>
          <p class="hint">{{ tr("calculationHelp") }}</p>
          <div class="form-grid">
            <label class="field"
              ><span>{{ tr("calculationMode") }}</span
              ><select
                :aria-label="tr('calculationMode')"
                v-model="c.kind"
                @change="markCustom(c)"
                :disabled="disabled"
              >
                <option value="percent">{{ tr("percent") }}</option>
                <option value="fixed">{{ tr("fixed") }}</option>
              </select></label
            >
            <label v-if="c.kind === 'percent'" class="field"
              ><span>{{ tr("base") }}</span
              ><select
                :aria-label="tr('base')"
                v-model="c.base"
                @change="markCustom(c)"
                :disabled="disabled"
              >
                <option
                  v-for="b in [
                    'avs',
                    'ac',
                    'laa',
                    'salary',
                    'gross',
                    'avsContributions',
                  ]"
                  :value="b"
                  :key="b"
                >
                  {{ tr(`calculation_${b}`) }}
                </option>
              </select></label
            >
          </div>
          <p class="hint" v-if="c.kind === 'percent'">
            {{ tr("calculationExample") }}
          </p>
          <p class="hint source-line">
            {{ tr("provenance") }} :
            {{ /^https:\/\//.test(c.source) ? tr("sourcePreset") : tr(c.source)
            }}<br v-if="/^https:\/\//.test(c.source)" /><span
              v-if="/^https:\/\//.test(c.source)"
              >{{ c.source }}</span
            >
          </p>
        </details>
      </template>
    </section>
  </div>
</template>
