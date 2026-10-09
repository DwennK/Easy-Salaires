<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, inject, useId } from "vue";
import { X } from "lucide-vue-next";
import { tr } from "../lib/i18n";
defineProps<{ title: string; wide?: boolean; drawer?: boolean }>();
const titleId = useId();
const appError = inject<import("vue").Ref<string>>("appError");
const emit = defineEmits<{ close: [] }>(),
  dialog = ref<HTMLDialogElement>();
onMounted(() => dialog.value?.showModal());
onBeforeUnmount(() => dialog.value?.close());
</script>
<template>
  <Teleport to="body"
    ><dialog
      ref="dialog"
      :class="{ wide, drawer }"
      @cancel.prevent="emit('close')"
      :aria-labelledby="titleId"
    >
      <header class="dialog-header">
        <h2 :id="titleId">{{ title }}</h2>
        <button
          class="icon-button"
          :aria-label="tr('close')"
          @click="emit('close')"
        >
          <X :size="20" />
        </button>
      </header>
      <div class="dialog-content">
        <p v-if="appError" class="notice error" role="alert">{{ appError }}</p>
        <slot />
      </div>
      <footer v-if="$slots.footer" class="dialog-footer">
        <slot name="footer" />
      </footer></dialog
  ></Teleport>
</template>
