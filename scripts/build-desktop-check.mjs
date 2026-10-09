import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  access,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildDesktop } from "./build-desktop.mjs";

for (const [platform, arch] of [
  ["darwin", "arm64"],
  ["win32", "x64"],
]) {
  for (const fails of [false, true]) {
    test(`temporary compiler files are removed after ${fails ? "failure" : "success"} (${platform})`, async () => {
      const project = await mkdtemp(
        join(tmpdir(), "easy-salaires-build-test-"),
      );
      let cache;
      try {
        const destination = join(project, `output/builds/${platform}-${arch}`);
        await mkdir(destination, { recursive: true });
        await writeFile(join(destination, "old.dmg"), "previous build");
        const task = buildDesktop({
          project,
          platform,
          arch,
          run: async (options) => {
            cache = options.cache;
            const bundle = join(cache, options.target, "release/bundle");
            await mkdir(bundle, { recursive: true });
            await writeFile(
              join(cache, "compiler-cache"),
              "large intermediate",
            );
            if (fails) throw new Error("Compilation failed");
            await writeFile(join(bundle, "new.dmg"), "new build");
          },
        });
        if (fails) {
          await assert.rejects(task, /Compilation failed/);
          assert.equal(
            await readFile(join(destination, "old.dmg"), "utf8"),
            "previous build",
          );
        } else {
          assert.equal(await task, destination);
          assert.equal(
            await readFile(join(destination, "new.dmg"), "utf8"),
            "new build",
          );
          await assert.rejects(access(join(destination, "old.dmg")));
        }
        await assert.rejects(access(cache));
        await assert.rejects(
          access(join(project, `output/builds/${platform}-${arch}.lock`)),
        );
      } finally {
        await rm(project, { recursive: true, force: true });
      }
    });
  }
}

test("unsupported platforms are rejected before creating files", async () => {
  await assert.rejects(
    buildDesktop({ platform: "darwin", arch: "x64" }),
    /Apple Silicon/,
  );
});
