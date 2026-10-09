# Build storage

- Prefer the GitHub release workflow for public installers; do not build both release targets locally.
- For a local packaged application, use `pnpm build:desktop`. It uses a temporary Cargo directory, removes intermediates after the command finishes, and retains only the latest packages for that platform in `output/builds/`.
- `pnpm tauri dev`, direct Cargo commands and advanced `pnpm tauri build` still retain caches. After native QA, inspect and remove only the build artifacts and temporary app copies created by that task, once their processes have stopped. Retain small validation reports and screenshots.
- Never clean all of `output/`: it also contains design assets and QA evidence. Never delete payroll databases, backups, source snapshots, signing keys or unrelated project caches as build cleanup.
- Verify the storage helper with `pnpm test:build-storage`; do not generate a full native build merely to test cleanup.

# Database compatibility (mandatory for every persistence change)

- Compatibility is part of implementation, not an optional follow-up. Do not ask the user to remember migrations or approve routine compatibility work already required by their feature.
- Before changing persisted fields, JSON meaning, SQLite storage, backup/restore, or loading/saving, inspect `docs/architecture.md`, `data-format.json`, and `tests/fixtures/data/compatibility.json`.
- SQL migrations are append-only `src-tauri/migrations/NNN_description.sql`, numbered consecutively. The build discovers them automatically. Never edit/delete an existing migration or a frozen historical fixture, and never update its checksum to disguise a change. Add a new migration instead.
- New SQL migrations must not manage transactions, `user_version`, journal mode, or connections. The runner owns these, takes a verified backup before migration, and commits the entire upgrade atomically. Keep archived revision JSON and PDF bytes unchanged.
- SQLite schema versions, JSON `dataModel` (`data-format.json`), application releases, and `State.version` (optimistic write counter) are distinct. A breaking JSON change requires the next model version and an ordered, idempotent upgrade in `upgradeState`; preserve every supported old path and reject future versions before mutation. Optional backward-compatible additions may keep the model version after explicit compatibility testing.
- A persisted type change intentionally fails `pnpm check:data`. Add the necessary migration/regression tests first, then update `persistedTypesSha256` and the explanatory `review` in the compatibility contract. Register only NEW migration/fixture hashes under `immutable`. For a new JSON format, add a frozen synthetic fixture and tests; never regenerate older fixtures from today's demo generator.
- Every migration must preserve real-company inputs, recorded payments, historic revisions/PDFs, and exports unless an explicitly requested business change requires otherwise. Restore by reading the source backup and migrating only the destination copy. Never open the source through the mutating migration path.
- Run `pnpm check` before delivery. It checks the compatibility contract, historical JSON fixtures, real SQLite upgrades/restores, rollback, future-version rejection, and backup failures. Native storage tests use a temporary Cargo directory that is removed on completion. CI also checks immutable history against the base commit; release builds run these checks before packaging.
- Do not bypass a compatibility failure by merely bumping a version, rewriting a historical checksum, resetting a company file, or replacing customer data with defaults. Report unverified native integration or CI separately from passing local storage tests.
