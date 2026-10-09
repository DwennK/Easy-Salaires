<script setup lang="ts">
import { useId } from "vue";
import { tr } from "../lib/i18n";
const model = defineModel<string>({ required: true });
const props = defineProps<{
  items: { id: string; label: string }[];
  label: string;
}>();
const id = useId();
function move(event: KeyboardEvent, index: number) {
  let next = index;
  if (event.key === "ArrowRight") next = (index + 1) % props.items.length;
  else if (event.key === "ArrowLeft")
    next = (index + props.items.length - 1) % props.items.length;
  else if (event.key === "Home") next = 0;
  else if (event.key === "End") next = props.items.length - 1;
  else return;
  event.preventDefault();
  model.value = props.items[next]!.id;
  (event.currentTarget as HTMLElement).parentElement
    ?.querySelectorAll<HTMLButtonElement>("[role=tab]")
    [next]?.focus();
}
</script>
<template>
  <div class="section-tabs" role="tablist" :aria-label="label">
    <button
      v-for="(item, index) in items"
      :key="item.id"
      type="button"
      role="tab"
      :id="`${id}-${item.id}`"
      :aria-selected="model === item.id"
      :tabindex="model === item.id ? 0 : -1"
      :aria-controls="`${id}-panel`"
      @click="model = item.id"
      @keydown="move($event, index)"
    >
      {{ tr(item.label) }}
    </button>
  </div>
  <div
    role="tabpanel"
    :id="`${id}-panel`"
    :aria-labelledby="`${id}-${model}`"
    tabindex="0"
    class="tab-panel"
  >
    <slot />
  </div>
</template>
