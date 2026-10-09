import { invoke, isTauri } from "@tauri-apps/api/core";
import type { State } from "../domain/types";
import { assertSupportedDataModel } from "../domain/data-format";
export const native = isTauri();
export const command = <T = unknown>(
  action: string,
  payload: unknown = {},
): Promise<T> => invoke("native", { action, payload });
function openPreview(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open("easy-salaires-preview", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("demo");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
export async function loadPreview(): Promise<State | null> {
  const db = await openPreview();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("demo", "readonly"),
      r = tx.objectStore("demo").get("state");
    r.onsuccess = () => resolve(r.result ?? null);
    r.onerror = () => reject(r.error);
    tx.oncomplete = () => db.close();
  });
}
export async function persist(s: State): Promise<void> {
  assertSupportedDataModel(s);
  if (native) {
    s.version = await command<number>("save", s);
    return;
  }
  const db = await openPreview();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("demo", "readwrite");
    tx.objectStore("demo").put(JSON.parse(JSON.stringify(s)), "state");
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}
export function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 32768)
    s += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(s);
}
export const fromBase64 = (s: string) =>
  Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
export async function exportFile(
  name: string,
  data: string,
  open = false,
): Promise<boolean> {
  if (native) return !!(await command("export", { name, data, open }));
  const blob = new Blob([fromBase64(data) as BlobPart], {
    type: name.endsWith(".pdf")
      ? "application/pdf"
      : name.endsWith(".csv")
        ? "text/csv"
        : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return true;
}
export const safeName = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_.-]/g, "_")
    .slice(0, 100);
