<script setup lang="ts">
import { computed, ref } from "vue";
import type { State } from "../domain/types";
import { setupState } from "../lib/ux";
import { tr } from "../lib/i18n";
const props = defineProps<{ state: State; period: string }>();
const emit = defineEmits<{ step: [number] }>();
const expanded = ref(true);
const done = computed(() => setupState(props.state, props.period));
const current = computed(() =>
  Math.max(
    0,
    done.value.findIndex((value) => !value),
  ),
);
const steps = ["setupCompany", "setupRules", "setupEmployee", "setupPayroll"];
</script>
<template>
  <aside class="setup-guide" :aria-label="tr('setupTitle')">
    <div class="setup-heading">
      <div>
        <h2>{{ tr("setupTitle") }}</h2>
        <p class="hint" v-if="expanded">{{ tr("setupHelp") }}</p>
      </div>
      <button
        class="text-button"
        :aria-expanded="expanded"
        @click="expanded = !expanded"
      >
        {{ tr(expanded ? "hideGuide" : "showGuide") }}
      </button>
    </div>
    <template v-if="expanded">
      <ol class="setup-steps">
        <li v-for="(step, i) in steps" :key="step">
          <button
            @click="emit('step', i)"
            :aria-current="current === i ? 'step' : undefined"
          >
            <span class="step-number" :class="{ done: done[i] }">{{
              done[i] ? "✓" : i + 1
            }}</span
            ><span
              >{{ tr(step)
              }}<small>{{
                tr(done[i] ? "completed" : "toComplete")
              }}</small></span
            >
          </button>
        </li>
      </ol>
      <div class="setup-next">
        <span>{{ tr(`${steps[current]}Help`) }}</span
        ><button class="button secondary" @click="emit('step', current)">
          {{ tr("continueSetup") }}
        </button>
      </div>
    </template>
  </aside>
</template>
