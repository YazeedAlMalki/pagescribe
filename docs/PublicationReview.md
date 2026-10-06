# GitHub publication review — October 5, 2026

Status: local beta preparation complete; upload pending. The owner authorized public publication under YazeedAlMalki and a v0.3.0 beta prerelease, and selected MIT. The proposed repository name is `markitdown-chrome-extension`. The reviewed local repository has 117 staged files on main. No commit, remote repository, tag or release has been created yet. GitHub integration is not connected, Git Credential Manager has no stored GitHub account, and no commit author is configured. The owner has been asked to approve use of their verified GitHub username and no-reply address; that answer is pending. Publication authorization is already granted and does not need to be requested again.

## Contents and privacy

`scripts/prepare-publication.mjs` exports an explicit allowlist to a new directory and writes a complete file/size/SHA-256 inventory to `build/publication-files.json`. It performs a credential-pattern and personal-path scan and checks public Markdown file links. Findings contain paths and categories only, never secret values. Review the inventory and first staged diff before committing; the script never stages or uploads.

Include original source, locked npm manifests, scripts, test helpers, controlled text fixtures, independent-fixture source records and upstream notices, current documentation, historical implementation briefs, and the original release metadata. Keep generated vendor assets, dependency trees, caches, browser profiles, raw UI evidence, independent binary corpus, manual downloads, old ZIPs and extracted packages local. The installable ZIP belongs in release assets. Historical local documents are untouched; exported copies normalize workstation paths. Native/GitHub execution handoffs are excluded because they contain machine-specific context.

Third-party executable code, models, fonts and decoders retain the build-generated notices. `scripts/build.mjs` regenerates all seven vendor entry points, both ONNX WASM assets, PDF.js main/worker files, CMaps, standard fonts, ICC data, image/color decoders, and notices from the locked dependency tree. QuickJS remains excluded. Independent test documents are acquired separately with recorded hashes; unresolved redistribution does not silently add them to the source repository. See [fixture provenance](FixtureProvenance.md).

## Verification

The original release SHA-256 was recomputed and matches [release identity](releases/v0.3.0.json): `a5f3f9a9f5063e6133057c4ff3ba9122dca3289b59b989fd2bc1575a44c81e92`, 6,383,830 bytes. Original production code and archive are preserved.

Fresh-clone validation passed on Windows with Node 24.16.0: clean `npm ci --ignore-scripts` (using the existing npm download cache), build, fixture generation, hash-verified independent-deck acquisition, 78 Node tests, static checks of 258 runtime files, source browser regression and all 10 Phase 2 groups, package creation, and both browser suites against the extracted ZIP. OCR model fixtures were freshly downloaded and checked against the pinned catalogue. The isolated browser runs use Edge; they do not complete native Chrome acceptance.

The first sandboxed build failed on esbuild's parent-directory lookup. The reviewed build and browser checks then passed outside that sandbox. A license download through PowerShell also failed before a verified Node download succeeded. Neither failed attempt is counted as a pass.

The [publication candidate](releases/v0.3.0-publication.json) is 6,384,720 bytes, SHA-256 `ca0ef940d56b4fcabbc68c192ef8b8e257f31add3564eff5d9651a1ffd0808a4`. Complete ZIP entry-set equality and byte equality with all 258 runtime files passed. Comparison with the original ZIP confirms only the added LICENSE and updated THIRD_PARTY_NOTICES.md differ. All executable code, models catalogue, vendor bundles, fonts, decoders and WASM bytes are unchanged. No full OCR accuracy/corpus rerun was needed for these license-only runtime changes; the 23-case extended corpus remains recorded prior evidence.

Review of the source allowlist found no credential-pattern or personal-path matches after historical path normalization. Fixture text contains controlled example data. Upstream copyright names/contacts remain as required attribution. This is a scoped review, not a guarantee against every possible secret. Raw native captures, derived brochure output, independent binary corpus, browser data and local execution handoffs are excluded. All public Markdown file links resolve within the exported candidate. The complete staged filename list matches the reviewed SHA-256 inventory. The staged diff was inspected; whitespace warnings are confined to retained historical/upstream text and Markdown line breaks.

## Remaining stable acceptance

| Area | Remaining work |
| --- | --- |
| Folder handling | Native grant/deny/regrant after restart, custom-directory duplicates, reset to defaults |
| Background worker | Confirm worker-specific stop and continued processing in native Chrome |
| Model expiry | Actual elapsed-age expiry and successful retry/download |
| Scan recovery | Inspect complete recovered output in native Chrome |
| Broader documents | Independent Arabic/mixed/photo/EXIF and complex-layout cases |
| Desktop presentations | Compare slide text, tables and notes with desktop originals |
| OCR accuracy | Address measured content/order errors or agree a narrower intended-use target |

Native acceptance remains **2/9 (22.2%)**. Physical network disconnection and real low-memory hardware were waived, not passed. Implementation/test completion and native acceptance are separate measures. No cloud fallback, engine replacement, new languages or stable-accuracy promise is part of this preparation.
