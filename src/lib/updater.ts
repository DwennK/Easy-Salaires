import { computed, ref, shallowRef } from "vue";
import { getVersion } from "@tauri-apps/api/app";
import {
  check,
  type DownloadEvent,
  type Update,
} from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { command, native } from "./bridge";
import { version as bundledVersion } from "../../package.json";

export type UpdatePackage = Pick<
  Update,
  "version" | "body" | "downloadAndInstall" | "close"
>;
export interface UpdateBackend {
  enabled: boolean;
  version(): Promise<string>;
  check(): Promise<UpdatePackage | null>;
  prepare(): Promise<unknown>;
  restart(): Promise<void>;
}
const backend: UpdateBackend = {
  enabled: native,
  version: getVersion,
  check: () => check({ timeout: 15000 }),
  prepare: () => command("prepareUpdate"),
  restart: relaunch,
};
type Status =
  | "idle"
  | "checking"
  | "current"
  | "available"
  | "downloading"
  | "installing"
  | "ready"
  | "error";

export function createUpdater(api: UpdateBackend = backend) {
  const status = ref<Status>("idle");
  const version = ref(bundledVersion);
  const update = shallowRef<UpdatePackage | null>(null);
  const progress = ref<number | null>(null);
  const error = ref<"check" | "install" | "restart" | null>(null);
  const working = computed(() =>
    ["downloading", "installing"].includes(status.value),
  );
  let disposed = false;

  async function refresh() {
    if (
      !api.enabled ||
      disposed ||
      working.value ||
      status.value === "checking" ||
      status.value === "ready"
    )
      return;
    status.value = "checking";
    error.value = null;
    try {
      version.value = await api.version();
      const next = await api.check();
      if (disposed) {
        await next?.close();
        return;
      }
      const previous = update.value;
      update.value = next;
      await previous?.close().catch(() => {});
      status.value = next ? "available" : "current";
    } catch {
      // An unreachable update server must never block local payroll work.
      status.value = update.value ? "available" : "error";
      error.value = "check";
    }
  }
  async function restart() {
    if (status.value !== "ready") return;
    error.value = null;
    try {
      await api.restart();
    } catch {
      error.value = "restart";
    }
  }
  async function install(blocked: () => boolean) {
    if (
      !api.enabled ||
      disposed ||
      !update.value ||
      blocked() ||
      working.value ||
      status.value === "checking" ||
      status.value === "ready"
    )
      return;
    status.value = "downloading";
    error.value = null;
    progress.value = null;
    let total = 0,
      received = 0;
    try {
      // A fresh consistent backup is required before replacing the application.
      await api.prepare();
      if (blocked()) {
        status.value = "available";
        return;
      }
      await update.value.downloadAndInstall(
        (event: DownloadEvent) => {
          if (event.event === "Started") {
            total = event.data.contentLength ?? 0;
            received = 0;
          }
          if (event.event === "Progress") received += event.data.chunkLength;
          progress.value =
            total > 0
              ? Math.min(100, Math.round((received / total) * 100))
              : null;
          if (event.event === "Finished") status.value = "installing";
        },
        { timeout: 120000 },
      );
      status.value = "ready";
      await restart();
    } catch {
      status.value = "available";
      error.value = "install";
    }
  }
  function dispose() {
    disposed = true;
    if (!working.value) void update.value?.close().catch(() => {});
  }
  return {
    enabled: api.enabled,
    version,
    status,
    update,
    progress,
    error,
    working,
    refresh,
    install,
    restart,
    dispose,
  };
}
