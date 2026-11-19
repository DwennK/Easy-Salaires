<script setup lang="ts">
import { computed, ref } from "vue";
import { CalendarDays } from "lucide-vue-next";
import { displayDate, isCalendarDate, parseDateInput } from "../domain/dates";
import { lang, tr } from "../lib/i18n";

const props = defineProps<{
  id: string;
  label: string;
  pastOnly?: boolean;
  disabled?: boolean;
  required?: boolean;
  error?: string;
  describedBy?: string;
}>();
const model = defineModel<string | null>({ required: true });
const draft = ref<string | null>(null);
const previous = ref("");
const formatted = computed(() => displayDate(model.value ?? ""));
const invalid = computed(() => !!model.value && !isCalendarDate(model.value));

function focus() {
  previous.value = model.value ?? "";
  draft.value = formatted.value;
}
function edit(event: Event) {
  const input = event.target as HTMLInputElement;
  draft.value = input.value;
  model.value =
    parseDateInput(input.value, previous.value, !!props.pastOnly) ??
    input.value;
}
function openPicker(event: MouseEvent) {
  const input = event.currentTarget as HTMLInputElement;
  if (input.showPicker) {
    try {
      input.showPicker();
      event.preventDefault();
    } catch {
      /* The native control handles the click in embedded views. */
    }
  }
}
</script>

<template>
  <div class="date-input">
    <input
      :id="id"
      type="text"
      :aria-label="label"
      :value="draft ?? formatted"
      :placeholder="lang === 'fr' ? 'JJ/MM/AA' : 'DD/MM/YY'"
      :disabled="disabled"
      :required="required"
      :maxlength="10"
      :aria-invalid="!!error || invalid || undefined"
      :aria-describedby="describedBy"
      autocomplete="off"
      @focus="focus"
      @input="edit"
      @blur="draft = null"
    />
    <div class="date-picker">
      <CalendarDays :size="16" aria-hidden="true" />
      <input
        type="date"
        :value="isCalendarDate(model ?? '') ? model : ''"
        :disabled="disabled"
        :aria-label="tr('chooseDate') + ' · ' + label"
        @click="openPicker"
        @input="model = ($event.target as HTMLInputElement).value"
      />
    </div>
  </div>
</template>

<style scoped>
.date-input {
  position: relative;
}
.date-input > input {
  padding-right: 42px;
}
.date-picker {
  position: absolute;
  inset-block: 1px;
  right: 1px;
  width: 36px;
  display: grid;
  place-items: center;
  color: var(--muted);
}
.date-picker input {
  position: absolute;
  inset: 0;
  height: 100%;
  opacity: 0;
  cursor: pointer;
}
.date-picker:focus-within {
  outline: 2px solid var(--green);
  border-radius: var(--control-radius);
}
</style>
