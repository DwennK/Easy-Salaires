<script setup lang="ts">
import type { Contribution, Terms } from "../domain/types";
import { tr } from "../lib/i18n";
import Field from "./Field.vue";
const model = defineModel<Terms["overrides"]>({ required: true });
defineProps<{ contributions: Contribution[] }>();
function set(id: string, key: "employee" | "employer", value: string | null) {
  let item = model.value.find((c) => c.id === id);
  if (!item) {
    item = { id };
    model.value.push(item);
  }
  if (value == null || value === "") delete item[key];
  else item[key] = value;
  model.value = model.value.filter((c) => Object.keys(c).length > 1);
}
</script>
<template>
  <div class="override-list">
    <details v-for="c in contributions" :key="c.id" class="form-section">
      <summary>
        {{ tr(c.label) }}
        <span class="muted"
          >·
          {{
            tr(
              model.some((o) => o.id === c.id) ? "customRate" : "inheritedRate",
            )
          }}</span
        >
      </summary>
      <div class="form-grid">
        <Field
          :model-value="model.find((o) => o.id === c.id)?.employee ?? ''"
          @update:model-value="set(c.id, 'employee', $event)"
          :label="`${tr('employeePays')} (${c.kind === 'percent' ? '%' : 'CHF'})`"
          :placeholder="c.employee ?? tr('notEntered')"
          :hint="tr('emptyInherits')"
        />
        <Field
          :model-value="model.find((o) => o.id === c.id)?.employer ?? ''"
          @update:model-value="set(c.id, 'employer', $event)"
          :label="`${tr('employerPays')} (${c.kind === 'percent' ? '%' : 'CHF'})`"
          :placeholder="c.employer ?? tr('notEntered')"
          :hint="tr('emptyInherits')"
        />
      </div>
      <button
        v-if="model.some((o) => o.id === c.id)"
        type="button"
        class="text-button"
        @click="model = model.filter((o) => o.id !== c.id)"
      >
        {{ tr("restoreDefault") }}
      </button>
    </details>
  </div>
</template>
