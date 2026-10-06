# PageScribe publication — October 6, 2026

## Current package: 0.3.1 beta

Published on October 6, 2026: [download the beta](https://github.com/YazeedAlMalki/pagescribe/releases/tag/v0.3.1). GitHub confirmed the uploaded archive digest matches the verified local package.

The logo update adds [PageScribe branding](branding/README.md), four extension icon sizes and popup, Settings and tab icons. [Release identity](releases/pagescribe-v0.3.1.json) records the archive hash. Static checks and packaged browser icon checks passed; all conversion code and dependencies match 0.3.0 exactly. No additional native acceptance is claimed.

## 0.3.0 publication record

PageScribe is the new public name of the extension previously developed as MarkItDown. The public GitHub repository is [YazeedAlMalki/pagescribe](https://github.com/YazeedAlMalki/pagescribe), with a published [v0.3.0 beta prerelease](https://github.com/YazeedAlMalki/pagescribe/releases/tag/v0.3.0). MIT licensing, Microsoft attribution and dependency notices are retained. GitHub publication was verified on October 6, 2026: the repository is public, the release is a published prerelease, and both uploaded asset digests match the local release files. The release targets source commit `e152503347bd5ac76670313836283a48f14b04dc`.

## Rename scope

The Chrome extension name, toolbar tooltip, popup title/header/monogram, Settings title/branding, preview title, npm package identity, package filename and current documentation use PageScribe. Settings includes an About section crediting Microsoft MarkItDown and distinguishing this independent extension from an official Microsoft product.

Storage database names, locks, directory-picker identifiers, PDF diagnostic messages and existing test environment variables retain their internal `markitdown` names for compatibility. The rename does not change conversion behavior, pinned dependencies/models, permissions, limits or cache policy. Loading an unpacked extension from a different directory can still give it a different browser identity; retaining database names does not transfer data between extension origins.

The supplied `.7z` input contained 258 runtime files, all byte-identical to the previously verified MIT-licensed 0.3.0 candidate. Its SHA-256 was `cf2fd6d1fc6e00510f448ec8d125bc1acf76bd7aacc74de30bec9f89fe72136c`. The original attachment and earlier packages are preserved.

## Verification

PageScribe passed all 78 Node tests, static checks of 258 runtime files, and browser regression plus all 10 Phase 2 groups against the extracted PageScribe ZIP. Complete runtime entry-set and byte equality passed. The popup was visually inspected with the PageScribe title and P↓ monogram. Conversion JavaScript, dependencies, models, permissions and notices remain unchanged. No new native Chrome acceptance or broad OCR accuracy pass is claimed.

Current package: **6,384,878 bytes**, SHA-256 `865e1a15fb3ec29e22430062722127745f9dbe336fc54dcf6128a5601e9eaacf`. See [release identity](releases/pagescribe-v0.3.0.json).

## Acceptance and historical records

Native Chrome acceptance remains **2/9 complete (22.2%)**. Physical network disconnection and actual low-memory hardware checks were waived, not passed. The seven open areas remain folder permissions/restart, native worker-stop confirmation, actual-age model expiry, full native recovered-output inspection, broader Arabic/mixed/photo/EXIF cases, desktop presentation comparison and OCR accuracy.

OCR can omit words, confuse numerals and misorder columns/captions. Complex PDF layouts and PPTX master/layout text, inherited bullets, charts, SmartArt and positioning remain limited. See [the acceptance follow-up](../tests/AcceptanceFollowup2026-10-05.md).

Earlier briefs, reports, hashes and transfer instructions retain the MarkItDown name as historical evidence. Use the current README, RELEASE_NOTES.md and this record for PageScribe publication. Cloud OCR/API keys, replacing the engine, new languages, stable-release claims and Chrome Web Store publication remain outside scope.
