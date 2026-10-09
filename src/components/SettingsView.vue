<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { PDFDocument } from "pdf-lib";
import type { Company, Rules, State } from "../domain/types";
import { clone, uid } from "../domain/defaults";
import { tr } from "../lib/i18n";
import Field from "./Field.vue";
import Contributions from "./Contributions.vue";
import Tabs from "./Tabs.vue";
import {
  availableYears as payrollYears,
  isMissing,
  missingRates,
  validAmount,
} from "../lib/ux";
const props = defineProps<{ state: State; busy: boolean }>();
const tab = defineModel<string>("tab", { default: "company" });
function newYear(year: number) {
  rules.value = {
    ...clone(rules.value),
    id: uid(),
    year,
    effective: `${year}-01`,
    verified: false,
    acCap: "",
    laaCap: "",
    sources: [{ url: "", year, verified: "" }],
    contributions: rules.value.contributions.map((c) => ({
      ...c,
      employee: null,
      employer: null,
      source: "manual",
    })),
  };
}
const emit = defineEmits<{ save: [Company]; rules: [Rules] }>();
const company = ref(clone(props.state.company)),
  rules = ref(clone(props.state.rules[props.state.rules.length - 1]!)),
  error = ref("");
const savedCompany = ref(JSON.stringify(company.value));
const savedRules = ref(JSON.stringify(rules.value));
const companyDirty = computed(
  () => JSON.stringify(company.value) !== savedCompany.value,
);
const rulesDirty = computed(
  () => JSON.stringify(rules.value) !== savedRules.value,
);
const nameError = ref("");
const dirty = computed(() => companyDirty.value || rulesDirty.value);
defineExpose({ dirty });
watch(
  () => props.state.company,
  (value) => {
    if (JSON.stringify(value) !== savedCompany.value) {
      company.value = clone(value);
      savedCompany.value = JSON.stringify(value);
    }
  },
);
watch(
  () => props.state.rules.map((r) => r.id).join("|"),
  () => {
    const latest = props.state.rules.at(-1)!;
    // A company save must not erase an in-progress contribution form.
    if (latest.id !== JSON.parse(savedRules.value).id) {
      rules.value = clone(latest);
      savedRules.value = JSON.stringify(latest);
    }
  },
);
const availableYears = computed(() =>
  payrollYears(props.state, rules.value.year),
);
const demoWithoutSources = computed(
  () =>
    props.state.company.demo &&
    rules.value.verified &&
    !rules.value.sources.length,
);
function setSource(key: "url" | "verified", value: string | null) {
  rules.value.sources[0] ??= { url: "", year: rules.value.year, verified: "" };
  rules.value.sources[0][key] = value ?? "";
}
function selectYear(year: number) {
  if (rulesDirty.value || props.busy) return;
  const existing = props.state.rules.filter((r) => r.year === year).at(-1);
  if (!existing) {
    newYear(year);
    error.value = "";
    return;
  }
  rules.value = clone(existing);
  savedRules.value = JSON.stringify(existing);
  error.value = "";
}
function resetRules() {
  rules.value = JSON.parse(savedRules.value);
  error.value = "";
}
async function saveCompany() {
  nameError.value = company.value.name.trim() ? "" : tr("requiredName");
  if (!nameError.value) emit("save", clone(company.value));
  else {
    await nextTick();
    document
      .querySelector<HTMLInputElement>(".settings-layout [aria-invalid=true]")
      ?.focus();
  }
}
async function logo(ev: Event) {
  const file = (ev.target as HTMLInputElement).files?.[0];
  if (!file) return;
  if (
    !["image/png", "image/jpeg"].includes(file.type) ||
    file.size > 2 * 1024 * 1024
  ) {
    error.value = tr("largeLogo");
    return;
  }
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const doc = await PDFDocument.create();
    if (file.type === "image/png") await doc.embedPng(bytes);
    else await doc.embedJpg(bytes);
    await doc.save();
    const reader = new FileReader();
    reader.onload = () => {
      company.value.logo = reader.result as string;
      error.value = "";
    };
    reader.onerror = () => (error.value = tr("invalidLogo"));
    reader.readAsDataURL(file);
  } catch {
    error.value = tr("invalidLogo");
  }
}
function saveRules() {
  error.value = "";
  try {
    for (const c of rules.value.contributions.filter((c) => c.active)) {
      for (const v of [c.employee, c.employer])
        if (!isMissing(v) && !validAmount(v)) throw Error("numberPositive");
    }
    if (
      !new RegExp(`^${rules.value.year}-(0[1-9]|1[0-2])$`).test(
        rules.value.effective,
      )
    )
      throw Error("dateMonthError");
    // An unverified year can be saved as a draft; the engine still blocks issuing.
    if (
      rules.value.verified &&
      ((!props.state.company.demo && !rules.value.sources.length) ||
        rules.value.sources.some(
          (s) =>
            !/^https:\/\//.test(s.url) ||
            !/^\d{4}-\d{2}-\d{2}$/.test(s.verified),
        ) ||
        !validAmount(rules.value.acCap, true) ||
        !validAmount(rules.value.laaCap, true))
    )
      throw Error("yearNotVerified");
    emit("rules", { ...clone(rules.value), id: uid() });
  } catch (e) {
    error.value = tr((e as Error).message);
  }
}
</script>
<template>
  <div class="settings-layout">
    <Tabs
      v-model="tab"
      :items="[
        { id: 'company', label: 'company' },
        { id: 'rules', label: 'rules' },
      ]"
      :label="tr('settingsTabs')"
    >
      <section v-show="tab === 'company'">
        <form @submit.prevent="saveCompany" novalidate>
          <section class="settings-section">
            <h2>{{ tr("companyContact") }}</h2>
            <p class="hint">{{ tr("companyContactHelp") }}</p>
            <div class="form-grid">
              <Field
                class="span-2"
                v-model="company.name"
                :label="tr('companyName')"
                required
                :error="nameError"
              />
              <Field
                class="span-2"
                v-model="company.address"
                :label="tr('address')"
              />
              <Field v-model="company.postal" :label="tr('postal')" /><Field
                v-model="company.city"
                :label="tr('city')"
              />
              <Field v-model="company.contact" :label="tr('contact')" /><Field
                v-model="company.responsible"
                :label="tr('responsible')"
              />
            </div>
          </section>
          <section class="settings-section">
            <h2>{{ tr("administration") }}</h2>
            <div class="form-grid">
              <Field v-model="company.canton" :label="tr('canton')" /><Field
                v-model="company.country"
                :label="tr('country')"
              /><Field
                class="span-2"
                v-model="company.uid"
                :label="tr('uid')"
                :hint="tr('uidHelp')"
              />
            </div>
          </section>
          <section class="settings-section">
            <h2>{{ tr("appearance") }}</h2>
            <div class="form-grid">
              <label class="field"
                ><span>{{ tr("language") }}</span
                ><select :aria-label="tr('language')" v-model="company.lang">
                  <option value="fr">Français</option>
                  <option value="en">English</option>
                </select></label
              >
              <div class="field">
                <span>{{ tr("logo") }}</span
                ><label class="button secondary upload-button"
                  >{{ tr("chooseLogo")
                  }}<input
                    class="sr-only"
                    type="file"
                    :aria-label="tr('logo')"
                    accept="image/png,image/jpeg"
                    @change="logo" /></label
                ><small>{{ tr("logoHelp") }}</small>
              </div>
              <Field
                class="span-2"
                v-model="company.footer"
                :label="tr('footer')"
              />
            </div>
            <p v-if="error" class="notice error" role="alert">{{ error }}</p>
            <div class="document-preview" :aria-label="tr('previewAppearance')">
              <span class="eyebrow">{{ tr("previewAppearance") }}</span>
              <div class="document-preview-heading">
                <img
                  v-if="company.logo"
                  :src="company.logo"
                  :alt="tr('logo')"
                />
                <div>
                  <strong>{{ company.name || tr("companyName") }}</strong>
                  <p>
                    {{ company.address }}<br />{{ company.postal }}
                    {{ company.city }}
                  </p>
                </div>
              </div>
              <div class="document-preview-footer">
                {{ company.footer || "Easy Salaires" }}
              </div>
            </div>
            <button
              v-if="company.logo"
              type="button"
              class="text-button"
              @click="company.logo = ''"
            >
              {{ tr("remove") }} · {{ tr("logo") }}
            </button>
            <p class="hint">{{ tr("appearanceHelp") }}</p>
          </section>
          <p class="hint">{{ tr("companyImpact") }}</p>
          <div class="save-bar">
            <span role="status">{{
              tr(companyDirty ? "unsaved" : "savedState")
            }}</span
            ><button class="button primary" :disabled="busy">
              {{ tr("saveCompany") }}
            </button>
          </div>
        </form>
      </section>
      <section v-show="tab === 'rules'">
        <div class="rules-intro">
          <div>
            <h2>{{ tr("rules") }} · {{ rules.year }}</h2>
            <p class="hint">
              {{
                state.company.demo
                  ? tr("demoRulesHelp")
                  : rules.year === 2026
                    ? tr("rulesHelp")
                    : tr("manualYearHelp")
              }}
            </p>
          </div>
          <div class="inline-actions">
            <button
              type="button"
              class="button secondary"
              :disabled="rulesDirty || busy"
              @click="selectYear(rules.year - 1)"
            >
              {{ tr("configurePreviousYear") }}
            </button>
            <button
              type="button"
              class="button secondary"
              :disabled="rulesDirty || busy"
              @click="selectYear(rules.year + 1)"
            >
              {{ tr("configureNextYear") }}
            </button>
          </div>
        </div>
        <div class="inline-actions rules-year">
          <label class="field"
            ><span>{{ tr("year") }}</span
            ><select
              :aria-label="tr('year')"
              :value="rules.year"
              :disabled="rulesDirty || busy"
              @change="
                selectYear(Number(($event.target as HTMLSelectElement).value))
              "
            >
              <option v-for="y in availableYears" :key="y" :value="y">
                {{ y }}
              </option>
            </select></label
          >
          <p class="hint">{{ tr("globalRulesHelp") }}</p>
          <button
            v-if="rulesDirty"
            type="button"
            class="text-button"
            @click="resetRules"
          >
            {{ tr("discardRules") }}
          </button>
        </div>
        <p v-if="rulesDirty" class="hint">{{ tr("nextYearHelp") }}</p>
        <div class="configuration-status" role="status">
          <strong>{{
            missingRates(rules.contributions)
              ? `${missingRates(rules.contributions)} ${tr("ratesMissing")}`
              : tr("ratesComplete")
          }}</strong
          ><span v-if="!rules.verified">{{ tr("yearDraft") }}</span>
          <p>{{ tr("zeroHelp") }}</p>
        </div>

        <details class="rules-impact">
          <summary>{{ tr("rulesScope") }}</summary>
          <p class="hint">{{ tr("rulesImpact") }}</p>
        </details>
        <section class="settings-section">
          <h3>{{ tr("insuranceGroup") }}</h3>
          <p class="hint">{{ tr("insuranceHelp") }}</p>
          <Contributions v-model="rules.contributions" group="insurance" />
        </section>
        <section class="settings-section">
          <h3>{{ tr("presetGroup") }}</h3>
          <p class="hint">{{ tr("presetHelp") }}</p>
          <Contributions v-model="rules.contributions" group="preset" />
        </section>
        <details class="form-section" :open="rules.year !== 2026">
          <summary>{{ tr("yearAdvanced") }}</summary>
          <div class="form-grid">
            <Field
              v-model="rules.acCap"
              :label="tr('acCap')"
              inputmode="decimal"
            /><Field
              v-model="rules.laaCap"
              :label="tr('laaCap')"
              inputmode="decimal"
            />
          </div>
          <template v-if="rules.year !== 2026 && !demoWithoutSources"
            ><Field
              :model-value="rules.sources[0]?.url ?? ''"
              @update:model-value="setSource('url', $event)"
              :label="tr('sourceUrl')"
            /><Field
              :model-value="rules.sources[0]?.verified ?? ''"
              @update:model-value="setSource('verified', $event)"
              :label="tr('verifiedDate')"
              type="date"
            /><label class="check"
              ><input type="checkbox" v-model="rules.verified" />{{
                tr("verifyRules")
              }}</label
            ></template
          >
        </details>
        <details class="form-section">
          <summary>{{ tr("sources") }}</summary>
          <p class="hint">
            {{ tr(state.company.demo ? "demoRulesHelp" : "sourceLimits") }}
          </p>
          <ul class="sources">
            <li v-for="s in rules.sources" :key="s.url">
              {{ s.url }} · {{ s.verified }}
            </li>
          </ul>
        </details>
        <details class="form-section">
          <summary>{{ tr("rulesHistory") }}</summary>
          <p v-for="r in state.rules" :key="r.id">
            {{ r.effective }} · {{ r.year }}
          </p>
        </details>
        <div class="save-bar">
          <p class="notice error save-error" role="alert" v-if="error">
            {{ error }}
          </p>
          <span role="status">{{
            tr(rulesDirty ? "unsaved" : "savedState")
          }}</span
          ><button class="button primary" :disabled="busy" @click="saveRules">
            {{ tr("saveRules") }}
          </button>
        </div>
      </section>
    </Tabs>
  </div>
</template>
