import { readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

// Only generated release assets belong to this cleanup, never arbitrary files.
export function cleanReleaseStorage(project, { keepVersion } = {}) {
  const directory = join(project, "output", "release");
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const file = join(directory, entry.name);
    const artifact = entry.name.match(
      /^Easy-Salaires_(\d+\.\d+\.\d+)_(?:macOS-arm64\.(?:dmg|app\.tar\.gz(?:\.sig)?)|Windows-x64-setup\.exe(?:\.sig)?)$/,
    );
    if (artifact && artifact[1] !== keepVersion) rmSync(file);
    if (entry.name === "latest.json") {
      if (!keepVersion) rmSync(file);
      else if (JSON.parse(readFileSync(file, "utf8")).version !== keepVersion)
        rmSync(file);
    }
  }
}
