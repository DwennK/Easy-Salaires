<div align="center">
  <img src="src/assets/app-icon.png" alt="Easy Salaires app icon" width="112" />
  <h1>Easy Salaires</h1>
  <p><strong>Swiss payroll. One clear workspace. Your data stays on your computer.</strong></p>
  <p>An offline desktop app for small businesses, with a full year of payroll at a glance.</p>
  <p><strong>Tauri 2 · Vue 3 · TypeScript · Rust · SQLite</strong><br />French & English · Mac Apple Silicon & Windows x64</p>
  <p><a href="#getting-started">Getting started</a> · <a href="#the-payroll-workflow">Workflow</a> · <a href="#data-and-backups">Data & backups</a> · <a href="#documentation">Documentation</a></p>
</div>

---

## A year of payroll, without the spreadsheet juggling

Easy Salaires brings employee records, monthly calculations, payslips and annual exports into a local desktop workspace. Select an employee, see all twelve months, and move from a draft to an issued PDF while keeping previous revisions available.

The app includes a **2026 CCNC / Neuchâtel preset**. Company-specific insurance rates and employee pension contributions must be configured before issuing payroll documents. See the [payroll rules and scope](docs/payroll-rules.md) for assumptions, sources and rounding conventions.

| Capability | What you can do |
| --- | --- |
| Annual employee workspace | See twelve months, edit salary or hours inline, add bonuses and expenses, and apply a salary to following months. |
| Payroll calculations | Handle monthly and hourly pay, explicit prorating, overtime, salary-impacting absences, allowances and 13th-salary accruals and payments. |
| Shared employee records | Update common details while preserving explicit monthly exceptions. |
| Payment tracking | Record the amount paid and payment date separately from the calculated net salary, including partial payments. |
| Document history | Preview payslips directly from the annual workspace, generate A4 PDFs, retain original revisions and identify documents that need updating. |
| Exports | Produce individual or merged monthly PDFs, UTF-8 CSV, numeric Excel workbooks and a partially prefilled official salary certificate. |
| Local storage | Keep each company's records, logos, document history and annual exports in a portable SQLite database. |
| Personalization | Switch between French and English and choose Ocean (the default), Kiwi, Lavender or Terracotta colors. |

## Downloads

Get the latest installers from [GitHub Releases](https://github.com/DwennK/Easy-Salaires/releases/latest):

- **Mac Apple Silicon (M1 and newer):** `.dmg`, macOS 12 or later. Move the app into Applications before opening it.
- **Windows 64-bit (x64):** `.exe` installer.

Only these two architectures are published. Updater archives, signatures and `latest.json` are support files for in-app updates.

The initial installation may show an OS trust warning: releases use Tauri update signatures and ad-hoc macOS signing, without paid Apple/Microsoft distribution certificates or Apple notarization.

### In-app updates

The bottom of the sidebar shows the installed version and announces updates. Open it and choose **Install and restart**. Checks run when the menu first loads and every six hours while the app is visible; you can also check manually. Offline checks never block payroll work.

Save open edits before installing. The app creates a fresh consistent backup of the open database in `Easy-Salaires-backups/before-updates/` (or the configured backup folder), verifies the signed update and restarts. These pre-update backups are retained separately from the 30 daily backups. Payroll data stays local; only version checks and update downloads contact GitHub.

The first updater-enabled release is **0.1.0**. Older development builds need a one-time manual installation; later published versions can be installed from the app.

## Getting started

### Requirements

- **Node.js 22.12 or newer** and **pnpm 12.10.1**, pinned in `package.json`.
- **Rust stable** and the native build tools for your platform.
- **macOS:** Xcode Command Line Tools. The configured minimum deployment target is macOS 12.
- **Windows:** Visual Studio Build Tools with C++ tooling, Windows SDK and WebView2.

The recorded development environment uses Node.js 26.10.0 and Rust 1.94.1. GitHub Actions builds and runs the application/storage tests on macOS Apple Silicon and Windows x64. Interactive Windows runtime validation is separate from CI.

```sh
git clone https://github.com/DwennK/Easy-Salaires.git
cd Easy-Salaires

# Install the pinned package manager if needed.
npm install -g pnpm@12.10.1

pnpm install --frozen-lockfile
pnpm tauri dev
```

For a browser-only demo:

```sh
pnpm dev
```

Open `http://127.0.0.1:1420`. The web preview uses demo data stored in IndexedDB. Real company database files are opened in the native desktop app.

## The payroll workflow

1. **Create a company** and choose its `.db` file, or explore the separate demonstration.
2. **Complete the setup guide.** Enter company details, confirm the relevant fund and configure insurance rates. Missing accident-insurance rates block issuance, while drafts remain available. Pension contributions are set per employee.
3. **Add an employee** through identity, contract and salary, insurance, and review. The monthly salary is the actual amount due at the displayed employment percentage.
4. **Work through the year.** Edit salary or hours, add supplements and expenses, and open any month for details. Forecast months are excluded from saved totals until recorded. Earlier months needed for cumulative calculations are prepared automatically for that employee.
5. **Edit and save.** Open a month, change the salary or hours, then save. Complete entries automatically update the payslip PDF; incomplete entries remain available to finish later. Earlier calculation inputs must be complete; their PDFs do not need to have been issued first.
6. **Record payments.** Tick Payment made, enter the amount and date, then use the same Save button. Salary changes preserve those entries and show the remaining or overpaid amount. The app does not initiate a bank transfer.
7. **Review changes and export.** Shared data updates recalculate affected payrolls while preserving monthly exceptions. Original issued PDFs remain in history; outdated documents and annual exports are flagged for regeneration.

The monthly overview provides a balanced accounting CSV with account numbers to assign. The annual summary provides CSV/Excel exports and the official salary certificate. Shared contribution settings apply to the selected year; there is no separate effective-month selector in the current workflow.

Salary, hours and rate inputs accept either a comma or a decimal point and normalize the displayed separator to a point. Monetary totals are displayed with two decimal places.

## Data and backups

**Native SQLite is the source of truth.** A company database includes employee records, rules, payrolls, immutable revisions, original PDFs and annual exports. An **exported backup `.db`** is portable between the desktop platforms.

Open **Settings → Backups**, or use the sidebar's **Backups** shortcut, to export a copy, view the last exported backup, change the automatic backup folder or restore a file. Save pending edits before exporting. These file operations require the desktop app.

- **Automatic backups:** before changes when opening an existing database, at most once per day. The app retains 30 automatic backups per database. The default location is `Easy-Salaires-backups` beside the database; the destination is configurable.
- **Portable exports:** use **Create a backup** to produce a consistent `.db` file, including changes in the SQLite write-ahead log. Avoid copying a live working database directly.
- **Validated restoration:** the app checks its signature, schema version, integrity and foreign keys, preserves a backup of the previous file, and restores to a newly chosen filename without overwriting an existing database.
- **Automatic upgrades:** older supported databases are backed up in `before-migrations/` and upgraded transactionally when opened, including after a manual app installation. Restoration upgrades only the destination copy. Schema and JSON formats newer than this app are rejected; migration backups are retained separately from daily rotation.
- **Concurrent-write protection:** an operating-system lock and version counter protect against conflicting writes. An empty `.db.lockfile` may remain after closing; it contains no payroll data and is not part of a backup.
- **History preservation:** records with history are archived instead of deleted. SQLite protects issued revisions against modification and deletion.

Native preferences store recent files and backup locations in the Tauri application-data directory:

| Platform | Location |
| --- | --- |
| macOS | `~/Library/Application Support/ch.easysalaires.desktop` |
| Windows | `%APPDATA%/ch.easysalaires.desktop` |

Only the color-theme preference uses localStorage; native payroll records do not. Database files and backups are **not encrypted by the app**, so their protection depends on the computer's account and disk security. There is no cloud synchronization or telemetry.

Local databases, backups, credentials, dependencies, builds and QA output are excluded by the repository's `.gitignore` files. Both dependency lockfiles remain versioned.

## Development and validation

```sh
# Compatibility contract, TypeScript, payroll/document tests, SQLite tests and frontend build
pnpm check

# Real SQLite storage tests without building Tauri; temporary artifacts are removed
pnpm test:storage

# Migration/fixture integrity and persisted-type compatibility contract
pnpm check:data

# Desktop build cleanup helper, without producing an installer
pnpm test:build-storage
```

The [data compatibility workflow](.github/workflows/compatibility.yml) runs `pnpm check` on pull requests and pushes to `main`. The release workflow also runs these checks and native Tauri tests on both desktop targets before packaging.

For browser checks, start `pnpm dev` in a separate terminal, then run:

```sh
pnpm test:ui  # Payroll, PDF, Excel, persistence and FR/EN flows
pnpm test:ux  # Guided setup, forms and validation
pnpm test:v2  # Annual editing, shared data, payments and four themes
pnpm test:updater # Update UI, offline/retry and unsaved-edit guards (mocked IPC)
```

The browser scripts use installed **Google Chrome** with an isolated temporary profile. They do not reuse a personal browser profile or download Chromium. Generated screenshots and verification files are written under the ignored `output/` directory.

Focused browser regression scripts are also available with the same running development server:

```sh
node scripts/payroll-easy-ui-test.mjs     # Single-save payslip editing and payments
node scripts/monthly-ui-test.mjs          # Monthly overview and payroll actions
node scripts/backups-ui-test.mjs          # Backup settings and navigation (mocked IPC)
node scripts/decimal-ui-test.mjs          # Decimal display and comma input
pnpm exec tsx scripts/demo-history-ui-test.mjs # Historical demo data and preservation
node scripts/year-navigation-ui-test.mjs  # Payroll and contribution year selection
```

### Data compatibility when contributing

Read [the architecture](docs/architecture.md), [`data-format.json`](data-format.json) and the [compatibility contract](tests/fixtures/data/compatibility.json) before changing persisted data. Application versions, SQLite schema versions, JSON model versions and the optimistic write counter are separate.

Add consecutively numbered SQL migrations; never rewrite existing migrations or historical fixtures. Changes to JSON meaning require an ordered upgrade path and regression coverage. Preserve company inputs, recorded payments, archived revisions and original PDFs. Persisted-type changes require a compatibility review and tests before updating the contract. Run `pnpm check` before delivery; see [AGENTS.md](AGENTS.md) for the full requirements.

### Desktop builds

```sh
pnpm build:desktop  # Apple Silicon Mac or Windows x64, on the target OS
```

Local builds keep only the latest packages in `output/builds/darwin-arm64/` or `output/builds/win32-x64/`. Compilation uses a temporary Cargo directory, removed after success or failure. This saves disk space at the cost of recompiling dependencies for each local release build. Development (`pnpm tauri dev`) still uses its normal cache. The [release workflow](.github/workflows/release.yml) runs on version tags such as `v0.1.0`. It uses standard GitHub-hosted runners, builds only Apple Silicon and Windows x64, verifies both signed update packages, and publishes a release only after both builds succeed. See [release operations](docs/releases.md) for versioning and signing-key handling. Local signed builds require the same private key through `TAURI_SIGNING_PRIVATE_KEY`; it is never committed.

### Project structure

```text
src/
  components/          Vue screens, forms and annual workspace
  domain/              Payroll rules, decimal arithmetic and workflows
  lib/                 Native bridge, documents and localization
src-tauri/
  src/                 Rust commands and SQLite storage
  migrations/          Versioned database schema
public/
  fonts/               Embedded PDF font and its license
  templates/           Official salary certificate and guide
scripts/               Browser checks, compatibility checks, builds and releases
tests/                 Payroll, workflow, document and compatibility tests
  fixtures/data/       Frozen historical data and compatibility contract
docs/                  Architecture, rules, validation and asset provenance
data-format.json       Shared JSON model version for TypeScript and Rust
```

## Scope and limitations

- **No Swissdec certification**, withholding-tax calculation, bank integration or electronic filing.
- The salary certificate uses the **original Swiss Federal Tax Administration Form 11**. Identity, period, fields 1, 8, 9, 10.1 and 11, and reviewed remarks are partially prefilled. More complex cases require completion in a PDF reader using the included guide.
- Insurance and pension inputs depend on company contracts and employee circumstances. Review the documented rules before issuing payroll.
- macOS 12 is a configured minimum target, not a verified test environment. Local macOS bundles are not distribution-signed or notarized. Windows installers are built and tested at the storage level in CI; this does not replace interactive Windows testing.

## Documentation

The detailed project notes are currently in French:

- [Payroll rules, sources and rounding](docs/payroll-rules.md)
- [Architecture and data model](docs/architecture.md)
- [Recorded validation and platform limitations](docs/validation.md)
- [Bundled assets, provenance and third-party licenses](docs/assets.md)
- [Release workflow and updater operations](docs/releases.md)
