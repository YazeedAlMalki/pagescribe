# PageScribe — local document converter

**Your files. Plain Markdown.** PageScribe is an independent Chrome/Edge extension inspired by [Microsoft MarkItDown](https://github.com/microsoft/markitdown). It brings document-to-Markdown conversion into the browser, including local English/Arabic OCR. It is not affiliated with or endorsed by Microsoft. Microsoft's MIT notice and all dependency notices are preserved.

Version **0.3.0 beta** includes searchable PDF extraction, local English/Arabic image OCR, per-page scanned-PDF recognition, and PowerPoint text extraction. Native Chrome acceptance remains **2 of 9 groups complete**; material OCR errors remain. See the [release notes](RELEASE_NOTES.md), [current acceptance](tests/AcceptanceFollowup2026-10-05.md), and [PageScribe rename and verification](docs/PageScribePublication.md).

The original roadmaps and implementation handoffs are historical: their cloud plans, estimates and older statuses do not define the current scope. Phases 1 and 2 are implemented within the limits below; Phase 3 cloud OCR and API key handling are cancelled. Original local briefs are preserved; exported historical copies only normalize machine paths. See the [documentation index](docs/README.md).

## Install

For a source checkout, run the dependency installation and build commands below first: generated vendor assets are excluded from Git. Then load the `extension/` directory from Chrome's Extensions page with Developer mode → **Load unpacked**. Chrome/Edge 130 or newer is required. Reload the extension and reopen its tabs when updating.

The release archive is `build/PageScribe-0.3.0.zip`. Extract it before loading. This is an unpacked local release; Chrome Web Store publication is outside scope. A processing tab owns the workers: closing the toolbar popup is safe, but keep the processing tab open until completion. An interrupted batch can be reopened within the 24-hour recovery window.

## Formats

| Format | Output and limits |
| --- | --- |
| PDF | `## Page N`, geometric line reconstruction and simple two-column order. Searchable pages require no OCR models. Pages with fewer than 3 letters/digits, less than 50% alphanumeric visible text, or replacement characters fall back to OCR. |
| Scanned/mixed PDF | Each page uses native text or OCR, never both. Blank pages are identified. **Force OCR** in Settings replaces all page text layers. Successful pages survive isolated failures with numbered warnings. Resource-limit failures stop the file explicitly. |
| JPG / PNG | Automatic routing recognizes text locally. Select English or Arabic in Settings. EXIF orientation is applied; a clockwise rotation setting handles sideways/upside-down images. Blank or unreadable images receive warnings. |
| JPEG EXIF metadata | Explicit file-type choice; camera/date/GPS extraction remains available without OCR models. |
| PPTX | `## Slide N` in presentation relationship order; titles, paragraphs, explicit bullets, ordinary grouped shapes, simple tables, and speaker notes. |
| HTML | Turndown headings, lists, links, code blocks, tables. Active content removed; images become alt text. |
| XLSX / legacy XLS | SheetJS worksheets and formatted cached values. No formula recalculation or chart extraction. |
| DOCX / EPUB | Word paragraphs/tables and EPUB spine-order chapters through inert parsing; visual layout may differ. |
| CSV / JSON / XML | CSV tables; validated JSON; XML source preserved without syntax validation or entity evaluation. |
| ZIP | Recursive routing, including new formats, under shared archive limits in the same worker. |

PDF ordering is a geometric heuristic, not full layout reconstruction. Tables are readable text unless their structure is known. Columns with spanning headings, unusual fonts, vertical text, forms and annotations may lose fidelity. Unicode follows the PDF's text mapping; some producers encode Arabic presentation forms or map visually similar letters differently. Password-protected PDF is rejected without a password prompt.

PPTX follows shape order within a slide. Master/layout text, inherited bullet styles, charts, SmartArt, connectors, media, animations and complex positioning are not reconstructed; warnings describe omissions. Standard note placeholders (slide image/number, date, header/footer) are excluded. Merged table cells are flattened. External relationships are never fetched. Encrypted Office files and legacy `.ppt` are unsupported.

OCR is tested for **English and Arabic**, not universal language coverage. The pinned Arabic model emits visual-order characters; the adapter restores logical order and preserves Latin/numeric runs. Recognition can introduce errors even when the engine score is high. Review important output. Embedded-image OCR in PPTX/DOCX/EPUB, cloud OCR, API keys, YouTube and audio are outside this release.

## Models, privacy and offline use

All conversion, JavaScript and WASM execute locally. The manifest requests only `storage`, with no host permissions. `script-src` permits local scripts and `wasm-unsafe-eval` for WASM compilation; it does not permit JavaScript eval or remote scripts. `connect-src` permits local runtime assets and the two GitHub content hosts used for pinned model downloads. Downloads contain no document contents, credentials or referrer. Runtime model URLs are fixed to a verified repository commit and SHA-256 digest; redirects are rejected. PDF actions and embedded JavaScript are never executed. The optional PDF QuickJS evaluator is excluded from the bundle.

| Model data | Bytes |
| --- | ---: |
| Shared PaddleOCR v5 detector | 4,748,769 |
| English recognizer / dictionary | 7,855,803 / 1,417 |
| Arabic recognizer / dictionary | 8,023,442 / 2,370 |
| Both languages, total | 20,631,801 (19.68 MiB) |

First use downloads **12.02 MiB for English** or **12.18 MiB for Arabic**. The shared detector is reused. Model storage uses its own versioned IndexedDB database and a **64 MiB** budget. Records contain model/language identifiers, byte sizes, creation/verification times and SHA-256 hashes. A Web Lock coordinates readers, downloads, cleanup and clear operations. Only complete verified files commit. Every cached read checks expiry, size and hash. Interrupted, corrupt or quota-failed downloads remain retryable.

**Model expiration defaults to 24 hours**, separately configurable from 1–720 hours. Valid cached models work offline. Missing/expired models require a connection; native text conversions still work. Expiry is checked on reads and activation, with cleanup while settings are open. Exact-time deletion while all extension pages are closed is not promised. Clearing models retains results and does not alter an already loaded OCR session. Clearing results retains models.

Conversion results remain in the original database, preserving existing batches, outputs and directory handles. Their separate 24-hour default, 1–720-hour setting and 100 MiB budget remain. Settings relevant to conversion are saved into each new job, so resumed work retains its language, rotation and PDF mode. Source deletion, output storage and final job state commit atomically. Abandoned batches/inputs expire after 24 hours.

## Resource limits and recovery

- 25 files, 20 MiB per input, 100 MiB per batch, 10 MiB per Markdown result.
- Eight total worker slots. PDF/ZIP reserve a second slot for a possible PDF parser helper. ONNX uses one WASM thread and no helper pool. At most one PDF/image/ZIP job runs at a time; lightweight jobs can pass queued heavy jobs.
- Each file has 120 seconds of processing time plus, when needed, one separately bounded 60-second model-preparation allowance. Cancellation/timeout terminates the owning worker and descendants. Re-select files to retry a cancelled batch.
- Reservations: `20 MiB + 8 × input bytes` for basic formats, `96 MiB + 8 × input bytes` for Office/PPTX, `320 MiB + 8 × input bytes` for PDF/image/ZIP. Budget: 15% of reported RAM, capped at 1 GiB; unknown RAM uses 512 MiB. Known devices below 4 GB are rejected. Heap pressure over 85% stops admission. Estimates are conservative, not measurements of every worker heap.
- PDF: at most 100 pages, 100,000 text items per page, 14,400 PDF units per side. OCR rasterization is capped at 4 million pixels / 2,400 pixels per side / scale 2. Embedded images above 16 million pixels stop rasterization explicitly. A guarded build patch exposes PDF.js's otherwise silent image-limit event. Complex color filters may render imperfectly in worker canvases.
- Images: declared dimensions checked before decode, maximum 8,192 per side / 16 million pixels; normalized OCR canvas capped at 4 million pixels / 2,400 per side. Downsampling is reported.
- PPTX: 200 slides; tables up to 1,000 rows × 100 columns.
- Shared ZIP guards: 2,000 entries, 20 MiB per expanded entry, 64 MiB total expansion, 500:1 ratio, three recursive levels. Paths, duplicate entries, actual expansion, CRC, ZIP64, multi-disk and encryption are checked. XML rejects DTD/entities, over 100,000 nodes and nesting beyond 128. Workbooks retain 100-sheet / 500,000-cell / 50,000-row / 1,000-column limits.

A global Web Lock owns the processing pool across tabs. Popup closure, individual file errors and observer failures do not discard siblings. Copy, download, Markdown preview, persisted native directory handles and collision-safe numbered filenames remain available. Native folder grants and toolbar behavior still need manual Chrome acceptance.

## Development and verification

Use Node **22.13+** (tested with 24.16.0). Dependencies and transitives are locked; installation scripts are disabled. `.npmrc` avoids installing unrelated native/mobile peer runtimes and keeps npm's cache in the workspace.

```powershell
npm.cmd ci --ignore-scripts
npm.cmd run build
npm.cmd run fixtures
node scripts/acquire-fixtures.mjs
npm.cmd test
npm.cmd run check
npm.cmd run test:browser
npm.cmd run package
npm.cmd run test:package
```

`build` regenerates local vendor code, PDF fonts/CMaps/decoders, ONNX WASM and full notices. `fixtures` creates known-content Office/PDF/image/ZIP samples. The browser suite also creates an independent Arabic/mixed PDF using Chromium's print engine. Browser tests use a hidden, isolated Edge profile; set `MARKITDOWN_TEST_BROWSER` to select another compatible Chromium executable.

On other shells use `npm` instead of `npm.cmd`. Fixture generation requires the optional `@napi-rs/canvas` platform package retained by the lockfile; do not install with `--omit=optional`. Browser automation defaults to Edge's Windows installation path; other systems must set `MARKITDOWN_TEST_BROWSER` to a compatible executable supporting unpacked extensions. Other operating systems have not been accepted. Dependencies and fixture/model acquisition initially require networking. See [fixture provenance](docs/FixtureProvenance.md) for downloads, hashes and optional extended-corpus setup.

The repeatable browser suite uses downloaded model fixtures verified against the same pinned hashes. Missing fixture downloads require networking. `node scripts/ocr-experiment.mjs` separately exercises real runtime model downloads. `test:package` extracts the release into a versioned verification folder, verifies each asset against the unpacked extension, then runs both browser suites against that extracted copy. These checks do not substitute for manual Chrome dialogs or broad document fidelity testing.

See `tests/Phase2Verification.md` for measured evidence and `tests/ManualAcceptanceChecklist.md` for outstanding manual checks. The October 5 desktop-corpus fix brings the suite to 78 tests: PowerPoint section references no longer count as additional slides, and missing referenced parts report a specific error. Automated coverage includes cache failure/retry, admission, cancellation, limits, real inference and browser integration. No benchmark claims beyond the recorded fixtures are made.

October 5 acceptance evidence is in `tests/AcceptanceFollowup2026-10-05.md`. Additional scripts exercise a twelve-page independent scan (`node scripts/browser-acceptance.mjs`), all format families under browser offline emulation (`node scripts/browser-corpus.mjs`), and measured OCR accuracy (`node scripts/measure-acceptance-ocr.mjs`). Browser scripts use the existing verified model fixture cache and isolated Edge profiles. Physical offline and low-memory hardware checks were skipped at the user's request; they are not passes. Illustrated and skewed scans still show material recognition errors.

## Dependency decisions

- **PDF.js 6.4.299**, Apache-2.0: verified `getDocument`, explicit local `PDFWorker` port, per-page text/rendering and destruction. The legacy browser build supplies compatibility helpers; required fonts, CMaps and codecs are local. No viewer/action APIs are used. [Official API](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib.html).
- **ppu-paddle-ocr 6.6.0**, MIT, with **ONNX Runtime Web 1.23.2**, MIT, and pinned **PaddleOCR v5 English/Arabic** models, Apache-2.0. Actual MV3 inference validated the preferred package. `canvas-native` preprocessing avoids bundling OpenCV. Explicit WASM provider, local WASM paths, one thread, no proxy worker, model ArrayBuffers and one-record inference batches are used. [Package source](https://github.com/PT-Perkasa-Pilar-Utama/ppu-paddle-ocr), [pinned model source](https://github.com/PT-Perkasa-Pilar-Utama/ppu-paddle-ocr-models/tree/384182c7187c12d4ea181ae3b97c8b7e12089d9d).
- **@hokkyss/pptx-reader 0.6.0** was inspected in its exact published tarball. Its real API is `parsePptx(input, options)`; it advertises browser support and MIT licensing. Its `createZipReader` has configurable standalone limits, but the main parse options do not expose our shared recursive archive budget. The package also includes declarations referring to monorepo-relative TypeScript paths. A focused parser using the existing bounded ZIP and inert XML utilities was selected to preserve shared limits and avoid a second archive/decompression pipeline. This is a scope/integration decision, not a claim that the package cannot run in a browser. [Maintained repository](https://github.com/hokkyss/pptx-parser).

Existing libraries remain pinned: Turndown 7.2.4, SheetJS 0.20.3, Mammoth 1.13.0, epub.js 0.3.93, JSZip 3.10.1, piexifjs 1.0.6, LinkeDOM 0.18.13 and XML DOM 0.9.12. `pdf-lib` 1.17.1 is development-only fixture generation. Full licenses for libraries, models, fonts and decoders are in `extension/THIRD_PARTY_NOTICES.md` and local asset directories. The package audit reported no known vulnerabilities for the installed tree; this is not a guarantee of defect-free dependencies.

## Project license

Licensed under [MIT](LICENSE), selected by the owner. This independent JavaScript extension ports the document-to-Markdown concept and feature scope of [Microsoft MarkItDown](https://github.com/microsoft/markitdown); it is not an official Microsoft product. The [Microsoft MIT notice](scripts/vendor/MICROSOFT_MARKITDOWN_LICENSE.txt) and all dependency notices are retained in [THIRD_PARTY_NOTICES.md](extension/THIRD_PARTY_NOTICES.md). Third-party code, models, fonts and decoders retain their respective licenses.

