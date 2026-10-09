import { spawn } from "node:child_process";
import { cp, mkdir, mkdtemp, readdir, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);

async function runTauri({ root, target, config, cache }) {
  const child = spawn(
    process.execPath,
    [
      require.resolve("@tauri-apps/cli/tauri.js"),
      "build",
      "--target",
      target,
      "--config",
      config,
    ],
    {
      cwd: root,
      stdio: "inherit",
      env: { ...process.env, CARGO_TARGET_DIR: cache },
    },
  );
  const signals = ["SIGINT", "SIGTERM"];
  const handlers = signals.map((signal) => () => child.kill(signal));
  signals.forEach((signal, i) => process.on(signal, handlers[i]));
  try {
    await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code, signal) =>
        code === 0
          ? resolve()
          : reject(new Error(`Tauri build stopped (${signal ?? code}).`)),
      );
    });
  } finally {
    signals.forEach((signal, i) => process.off(signal, handlers[i]));
  }
}

export async function buildDesktop({
  project = root,
  platform = process.platform,
  arch = process.arch,
  run = runTauri,
} = {}) {
  const targets = {
    "darwin-arm64": ["aarch64-apple-darwin", "tauri.macos.conf.json"],
    "win32-x64": ["x86_64-pc-windows-msvc", "tauri.windows.conf.json"],
  };
  const key = `${platform}-${arch}`;
  if (!targets[key])
    throw new Error("Build on an Apple Silicon Mac or Windows x64.");
  const [target, config] = targets[key];
  const output = join(project, "output", "builds");
  await mkdir(output, { recursive: true });
  const lock = join(output, `${key}.lock`);
  await mkdir(lock); // Refuse concurrent builds that could replace the same output.
  let cache;
  try {
    cache = await mkdtemp(join(tmpdir(), "easy-salaires-build-"));
    await run({
      root: project,
      target,
      config: join(project, "src-tauri", config),
      cache,
    });
    const bundle = join(cache, target, "release", "bundle");
    if (!(await readdir(bundle)).length)
      throw new Error("No desktop bundle was generated.");
    const staging = join(lock, "bundle");
    await cp(bundle, staging, { recursive: true, verbatimSymlinks: true });
    const destination = join(output, key);
    await rm(destination, { recursive: true, force: true });
    await rename(staging, destination);
    return destination;
  } finally {
    try {
      if (cache) await rm(cache, { recursive: true, force: true });
    } finally {
      await rm(lock, { recursive: true, force: true });
    }
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    if (process.argv.length > 2)
      throw new Error(
        "This command takes no arguments; use pnpm tauri for advanced builds.",
      );
    console.log(`Desktop packages: ${await buildDesktop()}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
