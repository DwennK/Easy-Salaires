<script setup lang="ts">
import { Download, FolderOpen, HardDrive, RotateCcw } from "lucide-vue-next";
import { lang, tr } from "../lib/i18n";
defineProps<{
  native: boolean;
  busy: boolean;
  dirty: boolean;
  path: string;
  backupDir: string;
  lastBackup: { date: string; path: string } | null;
  statusError: boolean;
}>();
defineEmits<{ backup: []; folder: []; restore: [] }>();
</script>

<template>
  <div class="backup-settings">
    <p v-if="!native" class="backup-web-note">
      <HardDrive :size="18" aria-hidden="true" />{{ tr("backupDesktopOnly") }}
    </p>
    <section class="backup-card">
      <div class="backup-card-heading">
        <Download :size="21" aria-hidden="true" />
        <h2>{{ tr("backupNow") }}</h2>
      </div>
      <p>{{ tr("backupCopyHelp") }}</p>
      <p class="backup-last" role="status">
        <span>{{ tr("backupLastExport") }}</span>
        <strong>{{
          statusError
            ? tr("backupStatusUnavailable")
            : lastBackup
              ? new Date(lastBackup.date).toLocaleString(
                  lang === "fr" ? "fr-CH" : "en-CH",
                )
              : tr("backupNone")
        }}</strong>
      </p>
      <p v-if="dirty" class="backup-dirty" role="status">
        {{ tr("backupSaveFirst") }}
      </p>
      <button
        class="button primary"
        :disabled="!native || busy || dirty"
        @click="$emit('backup')"
      >
        <Download :size="17" aria-hidden="true" />{{ tr("backup") }}
      </button>
    </section>
    <section class="backup-card">
      <div class="backup-card-heading">
        <HardDrive :size="21" aria-hidden="true" />
        <h2>{{ tr("backupAutomatic") }}</h2>
      </div>
      <p>{{ tr("backupAutomaticHelp") }}</p>
      <div class="backup-folder-row">
        <div>
          <span class="backup-label">{{ tr("backupFolderLabel") }}</span>
          <p class="backup-path">{{ backupDir || tr("backupDefault") }}</p>
        </div>
        <button
          class="button secondary"
          :disabled="!native || busy"
          @click="$emit('folder')"
        >
          <FolderOpen :size="17" aria-hidden="true" />{{
            tr("backupChangeFolder")
          }}
        </button>
      </div>
    </section>
    <section class="backup-card">
      <div class="backup-card-heading">
        <RotateCcw :size="21" aria-hidden="true" />
        <h2>{{ tr("restore") }}</h2>
      </div>
      <p>{{ tr("backupRestoreHelp") }}</p>
      <button
        class="button secondary"
        :disabled="!native || busy"
        @click="$emit('restore')"
      >
        <FolderOpen :size="17" aria-hidden="true" />{{ tr("backupChoose") }}
      </button>
    </section>
    <details class="backup-details">
      <summary>{{ tr("backupFileDetails") }}</summary>
      <dl>
        <dt>{{ tr("fileLocation") }}</dt>
        <dd>{{ path || tr("webDemo") }}</dd>
        <dt>{{ tr("backupFormat") }}</dt>
        <dd>{{ tr("backupFormatHelp") }}</dd>
        <template v-if="lastBackup">
          <dt>{{ tr("backupLastExport") }}</dt>
          <dd>{{ lastBackup.path }}</dd>
        </template>
      </dl>
    </details>
  </div>
</template>

<style scoped>
.backup-settings {
  display: grid;
  gap: 16px;
}
.backup-web-note {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0;
  color: var(--muted);
}
.backup-web-note svg,
.backup-card-heading svg {
  flex-shrink: 0;
}
.backup-card {
  padding: 24px;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--surface);
}
.backup-card-heading {
  display: flex;
  align-items: center;
  gap: 12px;
}
.backup-card-heading svg {
  color: var(--green);
}
.backup-card h2 {
  margin: 0;
  font-size: 19px;
}
.backup-card p {
  margin: 10px 0 18px;
  color: var(--muted);
  line-height: 1.6;
}
.backup-card .backup-last {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 14px;
  padding: 12px 0;
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
}
.backup-last strong {
  color: var(--ink);
  font-weight: 600;
}
.backup-settings .button {
  margin: 0;
}
.backup-folder-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
}
.backup-folder-row > div {
  min-width: 0;
}
.backup-folder-row .button {
  flex-shrink: 0;
}
.backup-label {
  font-size: 12px;
  color: var(--muted);
}
.backup-card .backup-path {
  margin: 4px 0 0;
  color: var(--ink);
  overflow-wrap: anywhere;
}
.backup-details {
  padding: 4px 2px;
  color: var(--muted);
}
.backup-details summary {
  cursor: pointer;
  padding: 8px 0;
}
.backup-details dl {
  margin: 12px 0;
}
.backup-details dt {
  font-weight: 600;
  margin-top: 14px;
}
.backup-details dd {
  margin: 5px 0 0;
  overflow-wrap: anywhere;
}
@media (max-width: 600px) {
  .backup-card {
    padding: 18px;
  }
  .backup-card h2 {
    font-size: 17px;
  }
  .backup-folder-row {
    align-items: stretch;
    flex-direction: column;
    gap: 14px;
  }
  .backup-card .button {
    width: 100%;
  }
}
</style>
