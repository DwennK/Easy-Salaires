import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(resolve(root, path));
// Git may check text out as CRLF on Windows; hash its canonical LF content.
const hash = (path) =>
  createHash("sha256")
    .update(read(path).toString("utf8").replace(/\r\n/g, "\n"))
    .digest("hex");
const contractPath = "tests/fixtures/data/compatibility.json";
const contract = JSON.parse(read(contractPath));
const fail = (message) => {
  throw new Error(`Data compatibility: ${message}`);
};
const migrations = readdirSync(resolve(root, "src-tauri/migrations"))
  .filter((name) => name.endsWith(".sql"))
  .sort();
for (const [index, name] of migrations.entries()) {
  if (!name.startsWith(`${String(index + 1).padStart(3, "0")}_`))
    fail(`non-consecutive migration ${name}`);
  if (index > 0) {
    const sql = read(`src-tauri/migrations/${name}`)
      .toString()
      .replace(/--[^\n]*/g, "")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    if (
      /(^|;)\s*(BEGIN|COMMIT|ROLLBACK|END\s+TRANSACTION|VACUUM|ATTACH|DETACH|PRAGMA)\b/i.test(
        sql,
      )
    )
      fail(`${name}: transactions and PRAGMAs belong to the migration runner`);
  }
}
const protectedFiles = [
  ...migrations.map((name) => `src-tauri/migrations/${name}`),
  ...readdirSync(resolve(root, "tests/fixtures/data"))
    .filter((name) => /^(schema-v\d+\.sql|model-v\d+\.json)$/.test(name))
    .map((name) => `tests/fixtures/data/${name}`),
];
for (const path of protectedFiles) {
  if (contract.immutable[path] !== hash(path))
    fail(
      `${path} is missing from the contract or was changed. Keep historical files immutable; append a migration/fixture. See AGENTS.md.`,
    );
}
for (const path of Object.keys(contract.immutable)) {
  if (!protectedFiles.includes(path)) fail(`historical file removed: ${path}`);
}
if (contract.persistedTypesSha256 !== hash("src/domain/types.ts"))
  fail(
    "Persisted types changed. Add the required migration and historical compatibility tests, then explicitly update the contract and its review note. See AGENTS.md.",
  );
const format = JSON.parse(read("data-format.json"));
if (
  !Number.isInteger(format.dataModel) ||
  format.dataModel < 2 ||
  format.dataModel !== contract.dataModel
)
  fail("data-format.json and the compatibility contract disagree");
for (let version = 1; version <= format.dataModel; version++) {
  if (!contract.immutable[`tests/fixtures/data/model-v${version}.json`])
    fail(`missing frozen fixture for JSON model ${version}`);
}
if (!contract.review?.trim()) fail("missing compatibility review note");

// CI also compares with the previous revision: editing the hashes cannot silently
// rewrite migrations or fixtures that were already distributed.
const base = process.env.COMPATIBILITY_BASE;
if (base && !/^0+$/.test(base)) {
  if (!/^[a-f0-9]{40,64}$/i.test(base)) fail("invalid baseline commit");
  const files = execFileSync(
    "git",
    ["ls-tree", "--name-only", base, "--", contractPath],
    { cwd: root, encoding: "utf8" },
  );
  if (files.trim()) {
    const previous = JSON.parse(
      execFileSync("git", ["show", `${base}:${contractPath}`], {
        cwd: root,
        encoding: "utf8",
      }),
    );
    for (const [path, digest] of Object.entries(previous.immutable)) {
      if (contract.immutable[path] !== digest)
        fail(`released history was rewritten: ${path}`);
    }
    if (format.dataModel < previous.dataModel)
      fail("data model version went backwards");
    if (
      contract.persistedTypesSha256 !== previous.persistedTypesSha256 &&
      contract.review === previous.review
    )
      fail(
        "persisted types changed without an updated compatibility review note",
      );
  }
}
console.log(
  `Data compatibility contract OK (${migrations.length} SQL migrations, JSON model ${format.dataModel}).`,
);
