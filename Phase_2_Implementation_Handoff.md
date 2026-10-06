# MarkItDown Phase 2 implementation handoff

Prepared October 4, 2026 for the next implementation session. Extend the existing local Chrome extension with PDF text extraction, image OCR, scanned PDF conversion, and PowerPoint conversion. Deliver working features, tests, documentation, and an updated unpacked extension and ZIP package.

This is an implementation brief. None of the four features below is implemented yet. Continue from the existing Phase 1 code instead of generating another scaffold.

## Project location and current state

Workspace: `.`

| Area | Verified baseline |
| --- | --- |
| Version | 0.2.0 |
| Core formats | HTML, XLSX, legacy XLS, CSV, JSON, XML, DOCX, EPUB, ZIP, and JPEG EXIF are implemented |
| UI | Drag and drop, file picker, format selector, progress, copy, download, preview, and settings |
| Processing | Dedicated workers owned by a persistent processing tab; up to eight workers with memory admission |
| Recovery | IndexedDB stores inputs and job state; reopening an interrupted batch resumes unfinished jobs |
| Cache | Results expire after 24 hours by default; configurable from 1 to 720 hours; OCR models are not present |
| Permissions | MV3 manifest currently requests only `storage`; CSP currently blocks network connections |
| Automated checks | 53 of 53 Node tests and static validation passed on October 4, 2026 |
| Browser coverage | README records automated Edge MV3 coverage; this handoff did not rerun the browser suite |
| Distribution | `build/MarkItDown-Phase1-0.2.0.zip` exists for local installation |

Manual Chrome acceptance is still open in `tests/ManualAcceptanceChecklist.md`, including toolbar behavior, native folder permissions, concurrent processing tabs, offline operation, and broader real document coverage. Preserve this distinction when reporting completion.

Read `README.md`, the current code, and the manual checklist first. The original planning documents contain stale status labels, conflicting package names, and unverified performance estimates. Use them for intent; use the implementation for current behavior.

## Requested work

| Feature | Required result | Main dependency |
| --- | --- | --- |
| PDF text extraction | Searchable PDFs produce readable Markdown in page order | PDF parsing and text layout |
| Image OCR | JPG and PNG images produce recognized text locally | OCR runtime, language models, preprocessing, and model cache |
| Scanned PDFs | Image-only pages are rendered and recognized locally; mixed PDFs preserve searchable pages | PDF rendering plus the shared OCR service |
| PowerPoint | PPTX produces ordered slide text, supported tables, and speaker notes | Validated PPTX parser or bounded ZIP and XML parsing |

Cloud OCR, API keys, YouTube, audio transcription, legacy `.ppt`, and Chrome Web Store publication are outside this handoff. Embedded image OCR inside PPTX, DOCX, or EPUB is a follow-up enhancement; finish the four listed capabilities first.

## PDF text extraction

Use `pdfjs-dist` as the planned starting point. Verify the current official API, suitable version, licensing, and MV3 worker compatibility before pinning it. Bundle the required PDF worker and supporting assets locally.

Implement the following behavior:

- Route `.pdf` and `application/pdf` through the existing converter system.
- Emit Markdown sections headed `## Page 1`, `## Page 2`, and so on. Preserve page order, Unicode, paragraphs, and readable line ordering. Exercise English and Arabic text, including right-to-left and mixed content.
- Use text positions to reconstruct lines and basic reading order. Test a two-column example. Emit tables only when row and column structure is supported by the extraction; use readable text for uncertain layouts.
- Treat text extraction as separate from OCR. A searchable PDF must work without downloading or initializing OCR models.
- Return clear errors for corrupt and password-protected files. A password entry workflow is not required for this release.
- Warn about unsupported layout features and missing content. Do not return an unexplained empty success for an unreadable document.

Define and test page limits before processing large documents. Release PDF page and document resources after use. Never execute embedded PDF actions or fetch links and attachments referenced by a document.

## Image OCR

The earlier plan selected PaddleOCR through `ppu-paddle-ocr` and ONNX Runtime Web. Treat this as the preferred approach, subject to validation. Verify that the package, model files, language coverage, licenses, and browser APIs actually support this extension. If they do not, document the evidence and choose a compatible local implementation that preserves the requested behavior.

Start with a small real MV3 experiment: load bundled runtime assets, initialize a model, recognize a fixture, and repeat offline with the cached model. Establish this before wiring OCR throughout the UI.

Required behavior:

- Recognize JPG and PNG content locally. Normalize image orientation, bound decoded dimensions and pixel count, and handle blank, corrupt, rotated, and oversized images predictably.
- Produce readable text in line order. Report low-confidence or partial recognition when the engine supplies useful evidence; do not invent confidence percentages or silently label an unreadable image as successfully transcribed.
- Validate English and Arabic with actual fixtures. Add explicit language selection if the chosen models require it, and document the languages actually tested. Do not repeat the old unverified claim of universal language support.
- Show stages such as model preparation and text recognition. Use measurable progress where available and stage labels otherwise.
- Support cancellation during model preparation and recognition, with resource cleanup and a retry path after failure.

Proposed routing default: JPG and PNG use image OCR in automatic mode. Preserve an explicit **JPEG EXIF metadata** option that continues to work without OCR models. Update the routing, UI, and regression tests together so the existing metadata capability remains available. PNG metadata extraction is not part of this scope.

## Model loading and caching

Keep model storage separate from conversion results. Use IndexedDB with versioned model identifiers, language information, timestamps, byte sizes, and verified integrity metadata. Coordinate concurrent requests so two jobs do not download or commit the same model simultaneously. Commit only complete, validated downloads and recover cleanly from network or quota failures.

The existing plan calls for a 24-hour model expiration default. Implement a separate model-cache setting and clear action so clearing results does not unexpectedly remove models. Do not assume the current 100 MiB result-cache budget is suitable for the chosen models; measure their size and define an explicit model budget.

Describe the first download and its size in the UI. Once valid models are cached, OCR must work without network access. If models are missing or expired while offline, return a useful model-unavailable message while preserving native text conversion for other files. Expiration may require another download; do not promise perpetual offline availability with expiring models.

Use activation-time and read-time expiry checks consistently with the existing cache design. Do not promise exact-time deletion while all extension pages are closed. Handle an active OCR session and concurrent cache cleanup without corrupting either.

Bundle JavaScript and WASM locally. If model downloads require network access or WASM requires CSP changes, apply only the documented permissions and directives needed by the chosen implementation. Restrict downloads to verified model sources, keep document contents on the device, and distinguish model downloads from conversion traffic in the documentation.

## Scanned PDFs

Reuse the PDF parser and shared OCR service. Decide whether OCR is needed for each page, rather than classifying an entire PDF from its first page.

1. Attempt native text extraction for a page.
2. Evaluate whether the result contains usable text using a documented, tested heuristic.
3. Render pages needing recognition at a bounded resolution and pass their pixels to OCR.
4. Assemble native and recognized text in original page order under the same page headings.
5. Release each page bitmap and intermediate buffers before continuing.

Avoid concatenating native text and OCR text for the same page. Test blank pages, image-only pages, an existing OCR text layer, and a mixed searchable/scanned document. Provide an explicit force-OCR option for cases where a misleading text layer defeats automatic detection.

Report page-level progress. Bound page count, render dimensions, OCR concurrency, and processing time. On an isolated page failure, preserve successful pages with a warning identifying the affected page. A protective resource-limit failure must stop further work with an explicit error or partial-result status, never a silent truncation.

## PowerPoint

Support `.pptx` and its standard MIME type. The latest original PPTX decision document names `@hokkyss/pptx-reader`, while earlier files name other packages. Verify that exact package and its real API, browser support, maintenance, and license before selecting it. Do not assume the old illustrative code is valid. If necessary, use the existing ZIP and inert XML utilities to implement the required subset.

Required output:

- `## Slide 1`, `## Slide 2`, and subsequent sections in presentation relationship order, not ZIP entry order or filename sorting.
- Slide titles, body text, paragraph breaks, and bullets; supported tables become Markdown tables.
- Speaker notes under a `### Speaker notes` subsection, with standard boilerplate excluded where identifiable.
- Text from ordinary grouped shapes where supported; useful warnings for unsupported charts, SmartArt, and other content instead of claiming complete visual fidelity.

Handle missing relationships, malformed XML, corrupt archives, and encrypted files predictably. Preserve existing traversal, expansion, entry-count, depth, and XML entity protections. Ignore external resource relationships and never fetch them. Do not embed extracted binaries or base64 images in Markdown by default.

## Integration with the existing extension

Converters currently export `convert(input, context)` and return `{ markdown, warnings }`. Input includes the file buffer and metadata. The context exposes `report(stage)`; worker messages carry progress, results, or structured errors. Keep this contract where practical, and update all callers and tests for any necessary extension.

| Files or area | Expected work |
| --- | --- |
| `extension/lib/formats.js`, `router.js` | Register PDF, image OCR, and PPTX; preserve explicit EXIF selection |
| `extension/lib/converters/` | Add PDF, image, and PPTX converters with shared PDF/OCR helpers |
| `extension/lib/batch/` | Account for PDF rendering, model memory, OCR concurrency, timeouts, and cancellation |
| `extension/lib/storage.js` | Add or integrate model storage without losing existing cached results, batches, or directory handles |
| Settings and popup | OCR controls, model state/cache actions, language selection if needed, and page progress |
| `scripts/build.mjs`, `scripts/vendor/` | Bundle dependencies and required worker, WASM, font, dictionary, or other runtime assets |
| Manifest and static checks | Validate the final CSP, permissions, asset paths, and absence of remote executable code |
| Tests and fixture generator | Cover real documents, OCR inference, integration, limits, and recovery |
| README, notices, package script | Explain final behavior and limitations; include library/model licenses; remove hardcoded Phase 1 package naming |

The pool currently creates and terminates a worker for every file. Do not assume in-memory OCR sessions survive between jobs. Account for model initialization costs and concurrent copies of model memory. A conservative initial policy is one active OCR inference at a time while lightweight converters remain parallel; measure before increasing it.

PDF runtime workers or OCR helpers must be included in the global resource budget and terminated when their parent job ends. ZIP conversion currently reuses the same worker and routes nested files recursively. New formats inside ZIPs must honor shared archive limits and must not bypass OCR admission or create an unbounded nested pool.

Current limits are 25 files per batch, 20 MiB per file, 100 MiB per batch, 10 MiB per Markdown result, eight worker slots, and a two-minute file timeout. Retain them unless measured needs justify a documented adjustment. Compressed input size alone is insufficient to budget page rendering and OCR. Model preparation must have a bounded timeout distinct from recognition if it occurs before file processing.

Preserve durable job recovery, atomic result commits, sibling-file error isolation, copy/download/preview, and the global processing lock. Snapshot relevant conversion settings into jobs so a resumed batch uses consistent options. Migrate persisted data safely or use a separate versioned model database.

## Implementation order

1. Run baseline tests and inspect the current implementation. Validate the dependency candidates and prove OCR initialization inside MV3.
2. Implement PDF text extraction and PPTX extraction with real fixtures.
3. Implement shared OCR, model loading/cache, and standalone image conversion.
4. Connect per-page scanned PDF fallback and force-OCR behavior.
5. Finish routing, settings, progress, archive integration, memory limits, cancellation, and recovery.
6. Run regression and browser checks, document measured results and limitations, and produce the updated release package.

Complete each feature end to end. Do not stop after installing libraries or adding converter stubs. If one dependency is blocked, continue independent work and report the specific remaining limitation.

## Acceptance and delivery

| Capability | Evidence required |
| --- | --- |
| PDF text | Real multipage PDF, English/Arabic text, two-column layout, corrupt/protected input; succeeds without OCR models |
| Image OCR | Actual inference on JPG/PNG fixtures; English and Arabic samples; rotation, blank input, failure, and cancellation |
| Models | First download, valid cache reuse offline, expiration, interrupted download, concurrent requests, integrity failure, quota failure, and clear action |
| Scanned PDF | Image-only and mixed pages; existing text layer is not duplicated; force OCR, page progress, and bounded rendering |
| PPTX | Fixture with relationship order differing from filenames, bullets, table, notes, grouped text, and malformed content |
| Integration | Mixed batch of new and existing formats; new formats inside ZIP; popup closure, interrupted-tab recovery, and cancellation |
| Regression | Existing behavior remains covered; intentional JPEG auto-routing changes receive updated assertions and explicit EXIF tests |
| Privacy and offline | Conversion sends no document data externally; all features work with valid models cached and network disconnected |

Use deterministic fixtures with known expected text for automated OCR checks and independently produced documents for fidelity checks. Report actual recognition error measurements and timing, with fixture and device context. The original size, speed, and accuracy numbers were planning estimates, not acceptance evidence. Mocks can test orchestration but do not establish that OCR inference works.

Run the existing commands, extending their checks as needed:

```powershell
npm.cmd run build
npm.cmd run fixtures
npm.cmd test
npm.cmd run check
npm.cmd run test:browser
npm.cmd run package
```

Use the existing installed dependencies when possible; use `npm.cmd ci --ignore-scripts` for a clean locked install when needed. The README requires Node 22 or newer for the browser test. Exercise the packaged extension as well as the source directory so missing runtime assets are detected.

Deliver an updated version, extension directory, ZIP, README, license notices, and acceptance checklist. Keep the original six handoff documents unchanged. Include a final progress table separating implemented features, automated evidence, manual checks still pending, and known limitations. Do not mark manual Chrome checks complete based solely on Edge automation.
