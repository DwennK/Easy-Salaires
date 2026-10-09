# Desktop releases

Easy Salaires publishes exactly two targets:

| System | Rust target | Standard GitHub runner | Installer |
| --- | --- | --- | --- |
| Mac Apple Silicon (M1 and newer), macOS 12+ | `aarch64-apple-darwin` | `macos-15` | `.dmg` |
| Windows x64 | `x86_64-pc-windows-msvc` | `windows-2022` | NSIS `.exe` |

There is no Intel Mac, universal Mac, Windows ARM, 32-bit Windows or Linux release. The macOS updater additionally needs an `.app.tar.gz`; signatures and `latest.json` are updater support files, not extra platform versions.

## Publish a version

The first public version is **0.1.0**. Use increasing stable versions (`0.1.1`, `0.1.2`, …); the updater only installs newer versions.

1. Set the same version in `package.json`, `src-tauri/tauri.conf.json`, the application package in `src-tauri/Cargo.toml`, and its entry in `src-tauri/Cargo.lock`.
2. Run `pnpm check`, `cargo test --locked --manifest-path src-tauri/Cargo.toml`, and the affected UI checks. Review the changes and commit them.
3. Push the commit and a matching tag, for example:

   ```sh
   git tag -a v0.1.1 -m "Release Easy Salaires 0.1.1"
   git push origin main
   git push origin v0.1.1
   ```

4. The `Desktop release` workflow validates version consistency and creates a draft. Both target jobs run frontend and native storage tests, then build and sign the packages.
5. Only after both target jobs succeed does the publish job verify the complete asset set and cryptographic signatures, generate the two-platform updater manifest, and publish the release.
6. Verify the published release from the matching checkout:

   ```sh
   node scripts/release.mjs verify v0.1.1
   ```

A failed build leaves a draft, not a partial update. Retry failed jobs or dispatch the workflow with the existing tag. Published versions cannot be overwritten through this workflow. For a source change after a failed tag, prefer a new patch version and tag rather than moving a published reference.

## Signing key

- GitHub Actions uses the repository secret `TAURI_SIGNING_PRIVATE_KEY` only in the build step.
- The original private key is stored outside Git at `~/.tauri/easy-salaires-updater.key` with owner-only permissions. Back it up securely; GitHub cannot return its plaintext.
- The corresponding public key is embedded in `src-tauri/tauri.conf.json`.
- **Keep the same key for future releases.** Replacing it without a migration prevents existing installations from trusting updates.
- The updater requires an authenticated version in each signature (`requireSignedVersion`). Release validation rejects modified files, incorrect keys and mismatched versions.
- Tauri update signing is distinct from paid Apple/Microsoft code-signing certificates. macOS uses an ad-hoc signature; releases are not Apple-notarized.

For a local signed build, set `TAURI_SIGNING_PRIVATE_KEY` to the private-key file path and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` to an empty string before `pnpm tauri build`. Do not paste the key into tracked files or build logs.

## Update behavior

The app checks GitHub when its sidebar loads, every six hours while visible, and on a manual check. Installation always requires a user click. Unsaved settings, open editors and active writes block installation. A fresh SQLite backup must succeed before downloading and installing an update. Backup failures, download failures and signature failures do not trigger a restart.

Windows launches the NSIS updater and exits; the installer restarts the app. macOS replaces the application and requests a relaunch. If relaunch fails, the user can retry or quit and reopen. Company files and native preferences are separate from the application bundle.

The browser test suite uses mocked native IPC: it validates UI states and call order without replacing an installed application. CI compiles both platforms and runs native storage tests, but does not prove a full interactive Windows installation or update.

## Cost

Standard GitHub-hosted runners are free for public repositories, including macOS and Windows. This workflow uses no larger runner and uploads distributables directly to GitHub Releases rather than retaining Actions artifacts. See [GitHub's billing documentation](https://docs.github.com/en/billing/concepts/product-billing/github-actions).
