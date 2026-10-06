# Phase 2 verification — October 4, 2026

October 5 update: [AcceptanceFollowup2026-10-05.md](AcceptanceFollowup2026-10-05.md) records a desktop PowerPoint parser fix, 78 passing Node tests, 23 offline-emulated corpus inputs, targeted service-worker-stop automation and twelve-page real-scan lifecycle evidence. Current release identity is in `build/verification/release.json`. Historical measurements below retain their original fixture scope; physical disconnect and real low-memory hardware were subsequently waived, and highest-accuracy OCR acceptance remains unmet.

Release: **0.3.0**. Baseline was 0.2.0 with 53 passing tests. The six original handoff documents were not edited. The requested ponytail skill could not be found in the available catalogue, installed skill/plugin files or workspace, so no ponytail workflow was used.

## Delivery status

| Area | Implementation | Automated evidence | Manual/known limits |
| --- | --- | --- | --- |
| PDF text | Implemented | Real multipage, simple two-column, corrupt/protected, page limits; independent Chromium-produced Arabic/mixed PDF; no model cache required | Complex layouts/tables, unusual text maps, annotations and forms can lose fidelity |
| Image OCR | Implemented with preferred PaddleOCR/ONNX | Actual English PNG/JPEG and Arabic PNG inference; blank/corrupt/rotated input; cancellation and retry | English/Arabic only tested; noisy/skewed photographs and arbitrary orientation need broader acceptance |
| Scanned PDF | Implemented per page with force option | Image-only, mixed, blank and existing text layers; no duplication; bounded rendering; explicit image limit; partial-page preservation | Complex color filters, long scans and broader real documents remain manual |
| PPTX | Implemented with bounded ZIP/XML | Relationship order, bullets, table, groups, notes, malformed/encrypted input; independent 16-slide public demonstration deck | Master/layout text, inherited bullets, media, charts/SmartArt and visual positioning omitted or warned |
| Models | Separate, verified, expiring cache | Live-download MV3 experiment; real offline reuse/expiry; deterministic concurrent/interrupted/hash/quota/clear tests | Actual physical disconnection and browser quota exhaustion remain manual |
| Integration | Existing queue, storage and delivery preserved | 76 Node tests; regression and Phase 2 Edge suites; ZIP nesting; mixed batch popup closure; settings snapshot; cancellation, recovery and delivery | Actual Chrome toolbar, native folder dialogs, concurrent tabs and broader device checks remain pending |

## Reproducible checks

`npm.cmd run build`, `npm.cmd run fixtures`, `npm.cmd test`, `npm.cmd run check`, `npm.cmd run test:browser`, `npm.cmd run package`, and `npm.cmd run test:package` are the release commands. The package test checks byte equality for every ZIP asset and executes both Edge suites against its extracted extension directory. Browser profiles and captures are isolated under `.browser-tests/`.

- **76/76 Node tests**: real converters plus guards and orchestration. Quota/network/integrity injections use a deterministic model-store adapter and the production cache implementation; these do not substitute for actual inference.
- **Static checks**: 257 runtime files, local imports and PDF/OCR assets, matching version, pinned model metadata, `storage` permission only, no host permission, MV3 CSP.
- **Edge regression suite**: picker/drop, mixed success/failure, popup closure, cleanup, clipboard/download/preview, persisted directory writes, result-cache settings/expiry/clear, processing-tab recovery, and observer failure.
- **Edge Phase 2 suite**: real inference and conversion, native PDF without models, independent PPTX and Arabic PDF, scanned fallback and force option, ZIP integration, invalid input, resource limits, offline model behavior, real-worker cancellation/retry, saved settings and model-clear UI.
- **Privacy checks**: request instrumentation on page/worker targets permits only fixed model-data GETs plus the test's deliberate connectivity probe. No document POSTs or remote executable requests were observed. Some Chromium emulation/child-target commands are unsupported on worker targets; page connectivity state is inherited and the worker's offline model-unavailable path is explicitly exercised.

Source and packaged run summaries are retained under `build/verification/` after release verification. Detailed outputs, stages and timings are recorded in `.browser-tests/phase2-results.json`. Settings rendering was inspected from `.browser-tests/settings-phase2.png`.

## Actual OCR measurements

Device: Intel Core i9-14900HX, 32 logical CPUs, approximately 31.6 GiB reported system RAM; Windows, Node 24.16.0, installed headless Edge. These are small fixture measurements, not general speed or accuracy guarantees. Each conversion uses a fresh dedicated worker; cached runs still include local model reads/hash validation, runtime initialization and inference.

Fixture construction: 1,200 × 240 pixels, black 54px Arial text on white. PNG and JPEG are generated with `@napi-rs/canvas`; the initial MV3 experiment draws the same known strings with OffscreenCanvas. Rotation fixture is a 90° image corrected with the 270° setting. No document text is sent outside the browser.

| Fixture | Expected text | Observed text | Character error rate | Representative cached run |
| --- | --- | --- | ---: | ---: |
| English PNG | Local document conversion 2026 | Local docum ent conversion 2026 | 1 / 30 = 3.33% | 0.58 s |
| English JPEG | Local document conversion 2026 | Local docum ent conversion 2026 | 1 / 30 = 3.33% | 0.51 s |
| Arabic PNG | مرحبا بكم في الرياض | مرحبا بكم في الرياض | 0 / 19 = 0% | 0.45 s |

CER is Levenshtein distance after Unicode NFKC and whitespace normalization, divided by expected character count. Spaces count as characters. The English insertion is preserved in output rather than silently corrected. The engine score did not identify this high-confidence error; users must review text.

The real MV3 download experiment recorded English first use **5.11 s**, English fresh-worker cache reuse **0.47 s**, and Arabic first use with shared detector already cached **2.44 s**. A later repeated external download hit the 60-second preparation limit. The timeout was reported explicitly and retry succeeded. Repeatable full suites therefore populate models from the same downloaded, SHA-256-verified fixture bytes; they do not measure external download speed. The production loader always uses the pinned remote URLs on a cache miss.

Representative PDF measurements: searchable two-page PDF roughly 0.1 s; one scanned page about 1.36 s; native/scanned/blank mixed PDF about 1.46 s. The fixed fixtures are too small to establish performance on long documents. No claim of measured peak process memory is made; the 320 MiB heavy-job reservation is a conservative policy, not a benchmark. OCR concurrency remains one.

## Fidelity observations and dependency validation

The independent native Arabic PDF comes from Chromium's PDF printer, not the converter or its PDF fixture library. Its text map uses Arabic presentation forms and a Persian-yeh glyph mapping. The converter preserves those original code points. The test compares normalized readable equivalents without rewriting the delivered text.

The independent PPTX comes from the candidate parser author's public repository. Its source URL, SHA-256 and byte length are saved in `tests/fixtures/independent/SOURCE.json`, with its MIT license. Text, tables and speaker notes from 16 slides are extracted. The deck's benchmark numbers are explicitly synthetic content from its author; they are not MarkItDown measurements. Charts, image-only elements and connectors produce omission warnings.

The preferred `ppu-paddle-ocr` 6.6.0 package was validated in an actual MV3 worker with ONNX Runtime Web 1.23.2. English/Arabic v5 model bytes are locked to repository revision `384182c7187c12d4ea181ae3b97c8b7e12089d9d`; hashes of LFS models were compared to their source pointers. Code, runtime, models and licenses were inspected separately. Defaults that could download remote runtime code are overridden; CSP additionally prevents remote scripts. Canvas preprocessing and single-thread WASM avoid OpenCV and proxy-worker requirements.

`@hokkyss/pptx-reader` 0.6.0 was inspected via its published README, package metadata and declarations. It is MIT, advertises browser support, exposes `parsePptx`, and has a separate bounded `createZipReader`. A focused reader was selected because `parsePptx` does not expose this extension's existing shared nested-archive budget. No unsupported claim that the candidate is browser-incompatible is made.

PDF.js 6.4.299 uses an explicit locally bundled module-worker port to avoid its extension-origin blob wrapper. Required CMaps/fonts/image/color decoders are local; document actions and the optional QuickJS evaluator are unused. A regression fixture revealed that its size guard can result in an empty operator list. The build applies one exact, version-guarded notification at that existing guard, allowing an explicit `PDF_LIMIT` error instead of misleading blank output. The modification is identified in third-party notices and tested in Node and MV3.

## Outstanding manual acceptance

See `ManualAcceptanceChecklist.md`. Actual Chrome toolbar/native permission dialogs, physical network disconnection after restart, simultaneous processor tabs, service-worker termination, broader English/Arabic documents and low-memory behavior remain pending. Passing automated Edge tests does not mark these complete. Cloud OCR, API keys, legacy PPT, embedded-image OCR inside PPTX/DOCX/EPUB, audio/YouTube and Web Store publication remain outside scope.

