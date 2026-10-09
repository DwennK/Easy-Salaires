<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import {
  ArrowDownToLine,
  RefreshCw,
  CircleCheck,
  CloudOff,
} from "lucide-vue-next";
import { createUpdater } from "../lib/updater";
import { tr } from "../lib/i18n";
import Modal from "./Modal.vue";
const props = defineProps<{ blocked: boolean }>();
const updater = createUpdater();
const { enabled, version, status, update, progress, error, working } = updater;
const open = ref(false);
const label = computed(() => {
  if (!enabled) return "updateDesktopOnly";
  if (status.value === "checking") return "updateChecking";
  if (working.value) return "updateInstalling";
  if (status.value === "ready") return "updateRestart";
  if (update.value) return "updateAvailable";
  if (status.value === "current") return "updateCurrent";
  if (error.value) return "updateUnavailable";
  return "updateCheck";
});
let timer: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  if (!enabled) return;
  void updater.refresh();
  timer = setInterval(
    () => {
      if (document.visibilityState === "visible" && !open.value)
        void updater.refresh();
    },
    6 * 60 * 60 * 1000,
  );
});
onBeforeUnmount(() => {
  clearInterval(timer);
  updater.dispose();
});
</script>
<template>
  <div class="app-updater" :class="{ 'has-update': !!update }">
    <button
      class="update-trigger"
      :disabled="!enabled"
      @click="open = true"
      :title="tr(label)"
    >
      <ArrowDownToLine v-if="update" :size="17" />
      <CircleCheck v-else-if="status === 'current'" :size="17" />
      <CloudOff v-else-if="error" :size="17" />
      <RefreshCw
        v-else
        :size="17"
        :class="{ spinning: status === 'checking' }"
      />
      <span
        ><strong>{{ tr(label) }}</strong
        ><small>Easy Salaires · v{{ version }}</small></span
      >
      <i v-if="update" class="update-dot" aria-hidden="true"></i>
    </button>
    <Modal
      v-if="open"
      :title="tr('updateTitle')"
      @close="!working && (open = false)"
    >
      <p class="update-version">
        {{ tr("updateInstalled") }} <strong>v{{ version }}</strong>
      </p>
      <template v-if="update">
        <h3>{{ tr("updateNewVersion") }} {{ update.version }}</h3>
        <p>{{ tr("updateHelp") }}</p>
        <details v-if="update.body" class="update-notes">
          <summary>{{ tr("updateNotes") }}</summary>
          <p>{{ update.body }}</p>
        </details>
      </template>
      <p v-else role="status">{{ tr(label) }}</p>
      <p v-if="props.blocked" class="notice">{{ tr("updateSaveFirst") }}</p>
      <p v-if="error" class="notice error" role="alert">
        {{ tr(`updateError_${error}`) }}
      </p>
      <div
        v-if="working"
        class="update-progress"
        role="status"
        aria-live="polite"
      >
        <p>
          {{
            tr(
              status === "installing"
                ? "updateInstalling"
                : "updateDownloading",
            )
          }}<span v-if="progress !== null && status === 'downloading'">
            {{ progress }} %</span
          >
        </p>
        <progress
          :value="progress ?? undefined"
          max="100"
          :aria-label="tr('updateDownloading')"
        ></progress>
      </div>
      <template #footer>
        <button
          class="button secondary"
          :disabled="working"
          @click="open = false"
        >
          {{ tr("close") }}
        </button>
        <button
          v-if="status === 'ready'"
          class="button primary"
          :disabled="props.blocked"
          @click="updater.restart()"
        >
          {{ tr("updateRestart") }}
        </button>
        <button
          v-else-if="update"
          class="button primary"
          :disabled="working || props.blocked || status === 'checking'"
          @click="updater.install(() => props.blocked)"
        >
          {{ tr("updateInstall") }}
        </button>
        <button
          v-else
          class="button primary"
          :disabled="status === 'checking'"
          @click="updater.refresh()"
        >
          {{ tr("updateCheck") }}
        </button>
      </template>
    </Modal>
  </div>
</template>
<style scoped>
.app-updater {
  margin-top: 14px;
  border-top: 1px solid var(--border);
  padding-top: 12px;
}
.update-trigger {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  text-align: left;
  padding: 10px 8px;
  border-radius: 10px;
  color: var(--muted);
  background: transparent;
  border: 0;
}
.update-trigger > svg {
  flex-shrink: 0;
}
.update-trigger span {
  min-width: 0;
}
.update-trigger strong {
  display: block;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.5;
}
.update-trigger small {
  display: block;
  font-size: 10px;
  margin-top: 3px;
  opacity: 0.8;
}
.update-trigger:disabled {
  opacity: 0.7;
  cursor: default;
}
.update-trigger:not(:disabled):hover {
  background: var(--surface);
}
.has-update .update-trigger {
  background: var(--accent);
  color: var(--green);
}
.update-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--green);
  margin-left: auto;
  flex-shrink: 0;
}
.update-version {
  color: var(--muted);
}
.update-notes {
  margin: 18px 0;
}
.update-notes p {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-size: 12px;
}
.update-progress progress {
  width: 100%;
  accent-color: var(--green);
}
.spinning {
  animation: spin 1.4s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  .spinning {
    animation: none;
  }
}
@media (max-width: 800px) {
  .app-updater {
    margin: 0;
    padding: 0;
    border: 0;
  }
  .update-trigger {
    width: 32px;
    height: 32px;
    padding: 7px;
    position: relative;
  }
  .update-trigger span {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }
  .update-dot {
    position: absolute;
    top: 2px;
    right: 2px;
  }
}
</style>
