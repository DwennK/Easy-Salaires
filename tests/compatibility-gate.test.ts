import { afterEach, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";

const temporary: string[] = [];
afterEach(() =>
  temporary
    .splice(0)
    .forEach((dir) => rmSync(dir, { recursive: true, force: true })),
);
function sandbox() {
  const dir = mkdtempSync(join(tmpdir(), "easy-salaires-contract-test-"));
  temporary.push(dir);
  for (const path of [
    "scripts/check-data-compatibility.mjs",
    "src-tauri/migrations",
    "src/domain/types.ts",
    "tests/fixtures/data",
    "data-format.json",
  ]) {
    const dest = join(dir, path);
    mkdirSync(dirname(dest), { recursive: true });
    cpSync(path, dest, { recursive: true });
  }
  return dir;
}
function check(dir: string, base = "") {
  return spawnSync(process.execPath, ["scripts/check-data-compatibility.mjs"], {
    cwd: dir,
    encoding: "utf8",
    env: { ...process.env, COMPATIBILITY_BASE: base },
  });
}

it("accepts the current contract", () => {
  expect(check(sandbox()).status).toBe(0);
});
it("accepts Windows checkout line endings without changing the contract", () => {
  const dir = sandbox();
  const contract = JSON.parse(
    readFileSync(join(dir, "tests/fixtures/data/compatibility.json"), "utf8"),
  );
  for (const path of ["src/domain/types.ts", ...Object.keys(contract.immutable)]) {
    const file = join(dir, path);
    writeFileSync(file, readFileSync(file, "utf8").replace(/\r?\n/g, "\r\n"));
  }
  expect(check(dir).status).toBe(0);
});
it("blocks an unreviewed persisted type change", () => {
  const dir = sandbox();
  writeFileSync(
    join(dir, "src/domain/types.ts"),
    "export interface NewFormat {}\n",
  );
  const result = check(dir);
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("Persisted types changed");
});
it("blocks a rewritten historical migration", () => {
  const dir = sandbox();
  writeFileSync(join(dir, "src-tauri/migrations/001_initial.sql"), "SELECT 1;");
  expect(check(dir).stderr).toContain("Keep historical files immutable");
});
it("rejects SQL that could escape the runner transaction", () => {
  const dir = sandbox();
  writeFileSync(
    join(dir, "src-tauri/migrations/003_unsafe.sql"),
    "-- test\nCOMMIT;\n",
  );
  expect(check(dir).stderr).toContain(
    "transactions and PRAGMAs belong to the migration runner",
  );
});
it("rejects migration gaps", () => {
  const dir = sandbox();
  writeFileSync(join(dir, "src-tauri/migrations/004_gap.sql"), "SELECT 1;");
  expect(check(dir).stderr).toContain("non-consecutive migration");
});
it("CI rejects rewriting historical hashes as well as the files", () => {
  const dir = sandbox();
  const git = (...args: string[]) =>
    execFileSync("git", args, {
      cwd: dir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  git("init");
  git("add", "tests/fixtures/data/compatibility.json");
  git(
    "-c",
    "user.name=Compatibility test",
    "-c",
    "user.email=test@example.invalid",
    "-c",
    "commit.gpgsign=false",
    "-c",
    "core.hooksPath=empty-hooks",
    "commit",
    "-m",
    "Baseline",
  );
  const base = git("rev-parse", "HEAD").trim();
  const path = "src-tauri/migrations/001_initial.sql";
  writeFileSync(join(dir, path), "SELECT 1;");
  const contractPath = join(dir, "tests/fixtures/data/compatibility.json");
  const contract = JSON.parse(readFileSync(contractPath, "utf8"));
  contract.immutable[path] = createHash("sha256")
    .update(readFileSync(join(dir, path)))
    .digest("hex");
  writeFileSync(contractPath, JSON.stringify(contract));
  expect(check(dir, base).stderr).toContain("released history was rewritten");
});
