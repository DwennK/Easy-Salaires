# Build storage

- Prefer the GitHub release workflow for public installers; do not build both release targets locally.
- For a local packaged application, use `pnpm build:desktop`. It uses a temporary Cargo directory, removes intermediates after the command finishes, and retains only the latest packages for that platform in `output/builds/`.
- `pnpm tauri dev`, direct Cargo commands and advanced `pnpm tauri build` still retain caches. After native QA, inspect and remove only the build artifacts and temporary app copies created by that task, once their processes have stopped. Retain small validation reports and screenshots.
- Never clean all of `output/`: it also contains design assets and QA evidence. Never delete payroll databases, backups, source snapshots, signing keys or unrelated project caches as build cleanup.
- Verify the storage helper with `pnpm test:build-storage`; do not generate a full native build merely to test cleanup.
