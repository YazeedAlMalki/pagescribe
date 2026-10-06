# Acceptance — version 0.3.0

Checked implementation items have automated Node or isolated Edge MV3 evidence. Checked Chrome items have recorded native Chrome observations in `ChromeManualAcceptance.md`. Unchecked items still need manual Chrome acceptance. Edge automation does **not** complete the Chrome-specific items. See `Phase2Verification.md` for fixture scope, recognition errors and test methodology.

October 5 latest: see [acceptance follow-up](AcceptanceFollowup2026-10-05.md). Physical disconnect and actual low-memory hardware were waived by the user, not passed. New evidence includes targeted worker-stop automation, cancellation/recovery on twelve distinct real scanned pages, 23 offline-emulated corpus inputs, and a fixed desktop PowerPoint section-parsing defect. Native recovery completion was observed, but full native output inspection and other unwaived cases remain open. Strict original checklist count remains 2/9.

## Implemented and automated

- [x] Original formats continue converting; JPEG automatic routing now performs OCR. Explicit JPEG EXIF works without models.
- [x] Searchable multipage PDF, English, Arabic/mixed Unicode, simple two-column order; no OCR initialization on usable native pages.
- [x] Corrupt/password-protected PDF and over-100-page documents fail clearly.
- [x] Image-only, mixed, blank and existing text-layer PDF pages; force OCR and page progress; no duplicated native/OCR text.
- [x] Successful PDF pages survive isolated recognition failure with numbered warnings (orchestration test).
- [x] Oversized embedded PDF raster images stop with an explicit resource-limit error.
- [x] Actual PNG/JPEG English and PNG Arabic OCR, rotated image correction, blank/corrupt input and pre-decode image dimension limits.
- [x] Real MV3 first model download and fresh-worker cached reuse; a download timeout is bounded and retryable.
- [x] Separate model IndexedDB, pinned SHA-256 validation, metadata, expiry/read cleanup, clear action, and separate result/model storage.
- [x] Concurrent model requests, interrupted downloads, integrity failure, quota failure and retry; clear during download preserves already returned buffers (deterministic cache tests).
- [x] Browser offline emulation: valid cached native/scanned PDF, OCR and ZIP/PPTX conversion; expired models fail clearly while native PDF remains available.
- [x] Real-worker cancellation during model preparation and recognition; worker termination, reservation release and retry.
- [x] PPTX relationship order differs from filename order; titles, bullets, table, notes, grouped Arabic text, external relationships and malformed/encrypted input.
- [x] Independent public 16-slide demonstration PPTX: text, tables and notes are extracted; unsupported charts/media are warned about. This is a text-content check, not visual fidelity certification.
- [x] New formats in ZIP share archive and OCR admission limits; protective failures stop conversion.
- [x] Mixed-format batches, popup-close survival, durable settings snapshots, source cleanup, per-file failure isolation, five concurrent lightweight Office/text workers.
- [x] Interrupted processing-tab recovery, completed-output preservation, UI-observer failure, input-loading cancellation and global-lock architecture retained.
- [x] Clipboard, download, preview and collision-safe persisted directory writes through Edge automation.
- [x] Settings durations, language persistence and clear-models UI; clearing models leaves outputs; clearing outputs leaves models.
- [x] Network instrumentation allows only pinned model GETs and a deliberate connectivity probe; no document uploads or remote executable requests.
- [x] Static validation: local worker/WASM/font/CMap assets, import resolution, CSP, storage-only permission, matching version and pinned models.
- [x] Release ZIP asset equality and full browser suites against the extracted package.
- [x] Actual background-worker stop confirmed by a stopped version event while tab-owned real OCR advances and completes (isolated Edge).
- [x] Twelve distinct independently scanned pages: cancellation preserves the CSV; reopening completes Pages 1–12 with output identical to an uninterrupted run (isolated Edge).
- [x] Six independent desktop-producer PPTX fixtures, including a PowerPoint section reference regression; 23 corpus inputs convert with browser networking emulated offline.

## Manual Chrome checks still pending

- [x] Actual Chrome toolbar popup at normal zoom, keyboard focus/scrolling, menu Escape behavior, and opening Settings.
- [ ] Native folder picker: choose, cancel, deny, regrant after browser restart, duplicate filenames and default-download reset.
- [x] Two processing tabs for one batch plus another batch: verify the global pool does not duplicate work. Cancel while waiting for the global lock.
- [ ] Stop the MV3 background service worker in DevTools during a batch; tab-owned processing continues.
- [ ] Physically disconnect networking, restart Chrome and repeat all format families with valid cached models. Reconnect after expiration and retry the download. Automation uses browser offline emulation.
- [ ] Cancel and close/reopen the actual processor tab during long real-world scanned PDF work; check native dialogs and visible recovery behavior.
- [ ] Broader independently produced Arabic/English documents, complex PDF columns/tables, skewed or noisy photos, different fonts, long scans, unusual JPEG orientation tags and low-memory devices.
- [ ] PPTX from desktop PowerPoint/LibreOffice with inherited bullets, complex groups, notes masters and missing/corrupt relationships; assess warned omissions against the original slides.
- [ ] Confirm OCR text accuracy against original documents before relying on it. The small deterministic fixtures do not establish general accuracy.

## Explicit limitations

October 5 follow-up: [ChromeManualAcceptance.md](ChromeManualAcceptance.md) adds recovered synthetic-output inspection, two independent one-page English scans, a 4.4755% CER measurement on the illustrated book page, and successful default-folder Download & Open / numbered duplicate downloads. Brochure columns interleave. These are partial observations: **2 of 9 groups complete (22.2%)**, with all seven unchecked groups still pending.

English and Arabic are the tested OCR languages. Rotation correction is user selected after automatic EXIF orientation; arbitrary skew and perspective correction are not provided. PNG metadata, legacy PPT, embedded-image OCR inside Office/EPUB, cloud OCR, API keys, audio/YouTube and store publication remain outside scope. PDF tables/complex reading order and full PPTX visual fidelity are not claimed. Model expiration can require another download. Memory reservations do not measure all available system or worker memory.

