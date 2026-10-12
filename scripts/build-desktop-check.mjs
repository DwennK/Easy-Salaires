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
import { cleanReleaseStorage } from "./release-storage.mjs";

const releaseAssets = (version) => [
  `Easy-Salaires_${version}_macOS-arm64.dmg`,
  `Easy-Salaires_${version}_macOS-arm64.app.tar.gz`,
  `Easy-Salaires_${version}_macOS-arm64.app.tar.gz.sig`,
  `Easy-Salaires_${version}_Windows-x64-setup.exe`,
  `Easy-Salaires_${version}_Windows-x64-setup.exe.sig`,
];

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
        const release = join(project, "output/release");
        await mkdir(release, { recursive: true });
        const oldAssets = [...releaseAssets("0.1.0"), "latest.json"];
        for (const name of oldAssets)
          await writeFile(join(release, name), "previous release");
        await writeFile(join(release, "notes.md"), "release notes");
        const evidence = join(project, "output/qa/report.txt");
        await mkdir(join(project, "output/qa"), { recursive: true });
        await writeFile(evidence, "QA evidence");
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
        for (const name of oldAssets) {
          if (fails)
            assert.equal(
              await readFile(join(release, name), "utf8"),
              "previous release",
            );
          else
            await assert.rejects(access(join(release, name)), {
              code: "ENOENT",
            });
        }
        assert.equal(
          await readFile(join(release, "notes.md"), "utf8"),
          "release notes",
        );
        assert.equal(await readFile(evidence, "utf8"), "QA evidence");
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

test("release cleanup retains the current version and unrelated files", async () => {
  const project = await mkdtemp(join(tmpdir(), "easy-salaires-release-test-"));
  const release = join(project, "output/release");
  try {
    // A checkout with no downloaded releases is also supported.
    cleanReleaseStorage(project);
    await mkdir(join(release, "backups"), { recursive: true });
    const preserved = [
      "notes.md",
      "company.sqlite",
      "backup.zip",
      "backups/data.json",
    ];
    for (const name of [
      ...releaseAssets("0.1.0"),
      ...releaseAssets("0.1.1"),
      ...preserved,
    ])
      await writeFile(join(release, name), name);
    await writeFile(
      join(release, "latest.json"),
      JSON.stringify({ version: "0.1.1" }),
    );
    cleanReleaseStorage(project, { keepVersion: "0.1.1" });
    for (const name of releaseAssets("0.1.0"))
      await assert.rejects(access(join(release, name)), { code: "ENOENT" });
    for (const name of [...releaseAssets("0.1.1"), ...preserved])
      assert.equal(await readFile(join(release, name), "utf8"), name);
    assert.equal(
      JSON.parse(await readFile(join(release, "latest.json"), "utf8")).version,
      "0.1.1",
    );
    await writeFile(
      join(release, "latest.json"),
      JSON.stringify({ version: "0.1.0" }),
    );
    cleanReleaseStorage(project, { keepVersion: "0.1.1" });
    await assert.rejects(access(join(release, "latest.json")), {
      code: "ENOENT",
    });
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});
