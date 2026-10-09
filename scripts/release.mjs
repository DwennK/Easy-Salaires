import {
  readFileSync,
  writeFileSync,
  readdirSync,
  mkdirSync,
  copyFileSync,
} from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { verifyArtifact as verifySignature } from "./release-signature.mjs";
const verifyArtifact = (file, signature) =>
  verifySignature(file, signature, config.plugins.updater.pubkey, version);

const [mode, tag, target] = process.argv.slice(2);
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const config = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8"));
const version = pkg.version;
const repo = "DwennK/Easy-Salaires";
const notes = `Easy Salaires ${version}\n\nDeux versions uniquement :\n- macOS Apple Silicon (M1 et suivants), macOS 12 minimum : fichier .dmg\n- Windows 64 bits (x64) : installateur .exe\n\nL’application vérifie les mises à jour depuis le bas du menu. Une sauvegarde du dossier ouvert précède l’installation.\n\nLes fichiers .app.tar.gz, .sig et latest.json servent aux mises à jour intégrées. Les paquets sont signés pour le mécanisme Tauri ; ils ne sont pas notariés par Apple et ne disposent pas de certificat de distribution Apple/Microsoft. Le système peut afficher un avertissement au premier lancement.\n\nSur Mac, déplacer l’application dans Applications avant de l’utiliser.`;
function fail(message) {
  throw new Error(message);
}
function gh(...args) {
  const r = spawnSync("gh", [...args, "--repo", repo], { encoding: "utf8" });
  if (r.status !== 0) fail(r.stderr || "GitHub command failed");
  return r.stdout.trim();
}
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  );
}
function validateVersion() {
  if (!/^v\d+\.\d+\.\d+$/.test(tag ?? "") || tag !== `v${version}`)
    fail("Tag must match the stable package version");
  if (config.version !== version)
    fail("Tauri version differs from package.json");
  const cargo = readFileSync("src-tauri/Cargo.toml", "utf8").match(
    /^version = "([^"]+)"/m,
  )?.[1];
  const lock = readFileSync("src-tauri/Cargo.lock", "utf8").match(
    /name = "easy-salaires"\nversion = "([^"]+)"/,
  )?.[1];
  if (cargo !== version || lock !== version)
    fail("Rust versions differ from package.json");
}
const names = {
  mac: `Easy-Salaires_${version}_macOS-arm64`,
  win: `Easy-Salaires_${version}_Windows-x64-setup`,
};
const expected = [
  `${names.mac}.dmg`,
  `${names.mac}.app.tar.gz`,
  `${names.mac}.app.tar.gz.sig`,
  `${names.win}.exe`,
  `${names.win}.exe.sig`,
];

validateVersion();
if (mode === "validate") {
  console.log(`Version ${version}: package, Tauri, Cargo and lockfile match.`);
} else if (mode === "prepare") {
  const existing = spawnSync(
    "gh",
    ["release", "view", tag, "--repo", repo, "--json", "isDraft"],
    { encoding: "utf8" },
  );
  if (existing.status === 0) {
    if (!JSON.parse(existing.stdout).isDraft)
      fail("Refusing to overwrite an already published release");
  } else {
    mkdirSync("output/release", { recursive: true });
    writeFileSync("output/release/notes.md", notes);
    gh(
      "release",
      "create",
      tag,
      "--verify-tag",
      "--draft",
      "--title",
      `Easy Salaires ${version}`,
      "--notes-file",
      "output/release/notes.md",
    );
  }
} else if (mode === "upload") {
  if (!["aarch64-apple-darwin", "x86_64-pc-windows-msvc"].includes(target))
    fail("Unsupported build target");
  const files = walk(`src-tauri/target/${target}/release/bundle`);
  const mac = target === "aarch64-apple-darwin";
  const suffixes = mac
    ? [".dmg", ".app.tar.gz", ".app.tar.gz.sig"]
    : [".exe", ".exe.sig"];
  mkdirSync("output/release", { recursive: true });
  const assets = suffixes.map((suffix) => {
    const matches = files.filter((f) => f.endsWith(suffix));
    if (matches.length !== 1)
      fail(`Expected one ${suffix} artifact, found ${matches.length}`);
    const dest = join(
      "output/release",
      `${mac ? names.mac : names.win}${suffix}`,
    );
    copyFileSync(matches[0], dest);
    return dest;
  });
  verifyArtifact(assets[mac ? 1 : 0], assets[mac ? 2 : 1]);
  gh("release", "upload", tag, ...assets, "--clobber");
} else if (mode === "publish" || mode === "verify") {
  const dir = "output/release";
  mkdirSync(dir, { recursive: true });
  const release = JSON.parse(
    gh("release", "view", tag, "--json", "assets,isDraft"),
  );
  if (mode === "publish" && !release.isDraft)
    fail("Release is already published");
  const actual = release.assets.map((a) => a.name);
  if (
    expected.some((n) => !actual.includes(n)) ||
    actual.some((n) => ![...expected, "latest.json"].includes(n))
  )
    fail(
      "Release must contain exactly the two supported targets and their updater files",
    );
  gh("release", "download", tag, "--dir", dir, "--clobber");
  const platforms = {};
  for (const [platform, file] of [
    ["darwin-aarch64", `${names.mac}.app.tar.gz`],
    ["windows-x86_64", `${names.win}.exe`],
  ]) {
    verifyArtifact(join(dir, file), join(dir, `${file}.sig`));
    platforms[platform] = {
      signature: readFileSync(join(dir, `${file}.sig`), "utf8").trim(),
      url: `https://github.com/${repo}/releases/download/${tag}/${file}`,
    };
  }
  const manifest = {
    version,
    notes,
    pub_date: new Date().toISOString(),
    platforms,
  };
  if (mode === "publish") {
    writeFileSync(
      join(dir, "latest.json"),
      JSON.stringify(manifest, null, 2) + "\n",
    );
    gh("release", "upload", tag, join(dir, "latest.json"), "--clobber");
    gh("release", "edit", tag, "--draft=false", "--latest");
  } else {
    const published = JSON.parse(
      readFileSync(join(dir, "latest.json"), "utf8"),
    );
    if (
      published.version !== version ||
      JSON.stringify(published.platforms) !== JSON.stringify(platforms)
    )
      fail("Published updater manifest differs from verified artifacts");
  }
  console.log(`Verified both signed targets for ${tag}.`);
} else
  fail(
    "Usage: node scripts/release.mjs validate|prepare|upload|publish|verify vX.Y.Z [target]",
  );
