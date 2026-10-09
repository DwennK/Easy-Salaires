<script setup lang="ts">
import { ref, watch } from "vue";
import { tr } from "../lib/i18n";
const themes = ["kiwi", "ocean", "lavender", "terracotta"];
const defaultTheme = "ocean";
let stored = defaultTheme;
try {
  stored = localStorage.getItem("easy-salaires-theme") || defaultTheme;
} catch {
  /* Theme preference is optional. */
}
const selected = ref(themes.includes(stored) ? stored : defaultTheme);
watch(
  selected,
  (value) => {
    document.documentElement.dataset.theme = value;
    try {
      localStorage.setItem("easy-salaires-theme", value);
    } catch {}
  },
  { immediate: true },
);
</script>
<template>
  <fieldset class="theme-picker">
    <legend>{{ tr("theme") }}</legend>
    <div>
      <button
        v-for="theme in themes"
        :key="theme"
        :data-theme-swatch="theme"
        :aria-label="tr(theme)"
        :aria-pressed="selected === theme"
        :title="tr(theme)"
        @click="selected = theme"
      >
        <span></span>
      </button>
    </div>
  </fieldset>
</template>
