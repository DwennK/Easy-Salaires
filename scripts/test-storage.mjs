import { spawn } from "node:child_process";
import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Compile the actual storage module without linking a complete Tauri application.
// Keep Cargo's cache entirely in this task's temporary directory.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const temp = await mkdtemp(join(tmpdir(), "easy-salaires-storage-tests-"));
try {
  const manifest = await readFile(join(root, "src-tauri/Cargo.toml"), "utf8");
  const dependencies = [
    "serde_json",
    "rusqlite",
    "fs2",
    "chrono",
    "base64",
    "tempfile",
  ]
    .map((name) => {
      const line = manifest
        .split("\n")
        .find((line) => line.startsWith(`${name} = `));
      if (!line) throw new Error(`Missing dependency: ${name}`);
      return line;
    })
    .join("\n");
  await writeFile(
    join(temp, "Cargo.toml"),
    `[package]
name = "easy-salaires-storage-tests"
version = "0.0.0"
edition = "2021"
[lib]
path = "lib.rs"
[dependencies]
${dependencies}
`,
  );
  await copyFile(join(root, "src-tauri/Cargo.lock"), join(temp, "Cargo.lock"));
  await writeFile(
    join(temp, "lib.rs"),
    `#[path = ${JSON.stringify(join(root, "src-tauri/src/storage.rs"))}] mod storage;`,
  );
  await writeFile(
    join(temp, "build.rs"),
    `#[path = ${JSON.stringify(join(root, "src-tauri/migration_catalog.rs"))}] mod migration_catalog;
fn main() { migration_catalog::generate(std::path::Path::new(${JSON.stringify(join(root, "src-tauri"))}), std::path::Path::new(&std::env::var("OUT_DIR").unwrap())); }
`,
  );
  const child = spawn(
    "cargo",
    ["test", "--lib", "--manifest-path", join(temp, "Cargo.toml")],
    {
      stdio: "inherit",
      env: { ...process.env, CARGO_TARGET_DIR: join(temp, "target") },
    },
  );
  const stop = () => child.kill("SIGTERM");
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  try {
    const code = await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code) => resolve(code ?? 1));
    });
    if (code !== 0) process.exitCode = code;
  } finally {
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
  }
} finally {
  await rm(temp, { recursive: true, force: true });
}
