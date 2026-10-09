import { describe, expect, it, vi } from "vitest";
import {
  createUpdater,
  type UpdateBackend,
  type UpdatePackage,
} from "../src/lib/updater";
function fixture() {
  const update: UpdatePackage = {
    version: "1.0.2",
    body: "Changes",
    close: vi.fn(async () => {}),
    downloadAndInstall: vi.fn(async (callback) => {
      callback?.({ event: "Started", data: { contentLength: 100 } });
      callback?.({ event: "Progress", data: { chunkLength: 100 } });
      callback?.({ event: "Finished" });
    }),
  };
  const backend: UpdateBackend = {
    enabled: true,
    version: vi.fn(async () => "1.0.1"),
    check: vi.fn(async () => update),
    prepare: vi.fn(async () => {}),
    restart: vi.fn(async () => {}),
  };
  return { update, backend, updater: createUpdater(backend) };
}
describe("in-app updates", () => {
  it("does not invoke native APIs in the browser preview", async () => {
    const { backend } = fixture();
    backend.enabled = false;
    const updater = createUpdater(backend);
    await updater.refresh();
    await updater.install(() => false);
    expect(backend.check).not.toHaveBeenCalled();
    expect(backend.prepare).not.toHaveBeenCalled();
  });
  it("treats offline checks as non-blocking and supports retry", async () => {
    const { updater, backend } = fixture();
    vi.mocked(backend.check).mockRejectedValueOnce(new Error("offline"));
    await updater.refresh();
    expect(updater.error.value).toBe("check");
    await updater.refresh();
    expect(updater.status.value).toBe("available");
    expect(updater.error.value).toBeNull();
  });
  it("reports current when no newer release is available", async () => {
    const { updater, backend } = fixture();
    vi.mocked(backend.check).mockResolvedValue(null);
    await updater.refresh();
    expect(updater.status.value).toBe("current");
  });
  it("never installs while there are unsaved changes", async () => {
    const { updater, update, backend } = fixture();
    await updater.refresh();
    await updater.install(() => true);
    expect(backend.prepare).not.toHaveBeenCalled();
    expect(update.downloadAndInstall).not.toHaveBeenCalled();
  });
  it("backs up before installation, tracks progress and restarts only after success", async () => {
    const { updater, backend, update } = fixture();
    await updater.refresh();
    await updater.install(() => false);
    expect(backend.prepare).toHaveBeenCalledOnce();
    expect(updater.progress.value).toBe(100);
    expect(updater.status.value).toBe("ready");
    expect(backend.restart).toHaveBeenCalledOnce();
    expect(vi.mocked(backend.prepare).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(update.downloadAndInstall).mock.invocationCallOrder[0]!,
    );
    expect(
      vi.mocked(update.downloadAndInstall).mock.invocationCallOrder[0],
    ).toBeLessThan(vi.mocked(backend.restart).mock.invocationCallOrder[0]!);
  });
  it("does not install or restart if the backup fails", async () => {
    const { updater, backend, update } = fixture();
    await updater.refresh();
    vi.mocked(backend.prepare).mockRejectedValue(new Error("disk full"));
    await updater.install(() => false);
    expect(updater.error.value).toBe("install");
    expect(update.downloadAndInstall).not.toHaveBeenCalled();
    expect(backend.restart).not.toHaveBeenCalled();
  });
  it("never restarts after a failed download or signature check", async () => {
    const { updater, backend, update } = fixture();
    await updater.refresh();
    vi.mocked(update.downloadAndInstall).mockRejectedValue(
      new Error("invalid signature"),
    );
    await updater.install(() => false);
    expect(updater.error.value).toBe("install");
    expect(updater.status.value).toBe("available");
    expect(backend.restart).not.toHaveBeenCalled();
  });
  it("offers restart retry without installing twice", async () => {
    const { updater, backend, update } = fixture();
    await updater.refresh();
    vi.mocked(backend.restart).mockRejectedValueOnce(
      new Error("restart failed"),
    );
    await updater.install(() => false);
    expect(updater.status.value).toBe("ready");
    expect(updater.error.value).toBe("restart");
    await updater.install(() => false);
    await updater.restart();
    expect(update.downloadAndInstall).toHaveBeenCalledOnce();
    expect(backend.restart).toHaveBeenCalledTimes(2);
  });
  it("ignores concurrent checks and closes resources on disposal", async () => {
    const { updater, backend, update } = fixture();
    await Promise.all([updater.refresh(), updater.refresh()]);
    expect(backend.check).toHaveBeenCalledOnce();
    updater.dispose();
    expect(update.close).toHaveBeenCalledOnce();
    await updater.refresh();
    expect(backend.check).toHaveBeenCalledOnce();
  });
});
