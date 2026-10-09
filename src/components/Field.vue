<script setup lang="ts">
import { computed, useId } from "vue";
import { periodLabel } from "../lib/i18n";
const props = withDefaults(
  defineProps<{
    label: string;
    type?: string;
    placeholder?: string;
    required?: boolean;
    disabled?: boolean;
    hint?: string;
    error?: string;
    inputmode?: "decimal" | "text" | "numeric";
    maxLength?: number;
  }>(),
  { type: "text" },
);
const id = useId();
const model = defineModel<string | null>({ required: true });
const help = computed(
  () =>
    props.hint ||
    (props.type === "month" && /^\d{4}-(0[1-9]|1[0-2])$/.test(model.value || "")
      ? periodLabel(model.value!)
      : ""),
);
</script>
<template>
  <label class="field" :class="{ 'field-invalid': error }" :for="id">
    <span>{{ label }} <b v-if="required" aria-hidden="true">*</b></span>
    <input
      :id="id"
      :aria-label="label"
      :value="model ?? ''"
      @input="model = ($event.target as HTMLInputElement).value"
      :type="type"
      :required="required"
      :disabled="disabled"
      :placeholder="placeholder"
      :inputmode="inputmode"
      :maxlength="maxLength ?? 500"
      :aria-invalid="error ? true : undefined"
      :aria-describedby="error || help ? `${id}-help` : undefined"
    />
    <small
      v-if="error || help"
      :id="`${id}-help`"
      :class="{ 'field-error': error }"
      >{{ error || help }}</small
    >
  </label>
</template>
