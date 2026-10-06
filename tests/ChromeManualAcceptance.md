# Provisional Chrome manual acceptance — October 4, 2026

Latest October 5 engineering follow-up: [AcceptanceFollowup2026-10-05.md](AcceptanceFollowup2026-10-05.md). A valid desktop PowerPoint section-parsing defect was fixed and regression-tested; source and release verification records have been refreshed. Real-scan native cancellation and visible restart/completion were observed. Full native scan-output inspection was blocked before completion by the Computer Use URL-verification stop. Physical disconnect and low-memory hardware were waived by the user; they are not passes. Strict original native checklist count remains 2/9. The earlier statements below that no production/package change occurred describe only the earlier session.

Follow-up recorded October 5: see the appended evidence below. Overall remains 2/9 (22.2%).

Chrome 154 is installed; extension version 0.3.0 was loaded. Two of nine manual checklist groups are complete (22.2%): toolbar/keyboard/menu/Settings and the global worker pool. Seven groups remain open.

| Manual checklist group | Status | Percentage |
| --- | --- | ---: |
| Toolbar, keyboard, scrolling, menu and Settings | Complete | 100% |
| Folder selection, permissions, restart and filenames | Pending | 0% |
| Duplicate processors, separate batches and cancelling a waiter | Complete | 100% |
| Stop background service worker while processing continues | Pending | 0% |
| Physical offline operation, restart and model expiry | Pending | 0% |
| Active cancellation and close/reopen on a long real-world scan | Pending | 0% |
| Broader documents, image conditions and low-memory devices | Pending | 0% |
| Desktop PowerPoint/LibreOffice fidelity and malformed relationships | Pending | 0% |
| OCR accuracy against original documents | Pending | 0% |
| **Overall manual acceptance** | **2 of 9 complete; 7 pending** | **22.2%** |

Percentages count completed checklist groups. Partial observations do not complete a group.

| Check | Observed result |
| --- | --- |
| Actual toolbar popup | Renders and scrolls at normal zoom. Tab visibly focuses Settings; Return opens the Settings page. |
| Native file picker and CSV | Full processor tab converted the selected CSV to the expected Markdown table. |
| Native folder picker | Escape cancels selection and preserves Chrome's default download location. |
| Download menu in full tab | Escape closes the menu and restores focus to Download. |
| Download menu in toolbar popup | Before the fix, Escape dismissed the whole popup. After extension reload, Escape closes the open menu, leaves the popup open and restores the Download focus outline. |
| Duplicate processor tabs | The second processor for batch `dccc…` waited on the global lock. Cancelling the waiter showed “Stopped waiting…” while the owner advanced from page 6 to page 14. Later, duplicate processors for mixed batch `d8b6874b-6564-4262-a991-8e1640a75b23` showed owner progress at page 17 of 40 and the waiter's “Waiting for a free batch slot” notice. Both existing jobs finished; no extra output was created. |
| Separate batch waiting | Owner batch `191fb2f0-7f04-46b6-a157-ba6d5b3ed253` preserved correct `orders.csv` Markdown while its 100-page scan advanced through pages 5, 12 and 33. Distinct JSON batch `7e14ca05-eaae-4d1d-9125-fa3fd246ddaf` showed 0 of 1 queued and “Waiting for a free batch slot” while the owner recognized page 33. After the owner finished with a scan timeout (2 of 2 finished; 1 failed), the JSON batch acquired the slot automatically and finished 1 of 1. Its fenced JSON matched `customer.json`: `{"name":"Amina","city":"Riyadh","orders":[12,34],"active":true}`. |
| 40-page scanned PDF | Batch `dccc…` finished with 1 of 1 file done. Markdown contains Pages 1–40 with the expected “Local document conversion 2026” text despite the runtime warning. |
| 100-page mixed batch | With the processor tab absent, the toolbar was reopened from the main Settings tab. Batch `7a52cb15-2dd3-42f8-9ffa-7ceffe4dd0e7` showed “2 of 2 finished · 1 failed · done”: `orders.csv` retained its correct Markdown; `scan-100-pages.pdf` failed with “Conversion exceeded the two-minute processing timeout.” This is the expected bounded failure, not a successful 100-page conversion. |
| Result cache | The main Settings page showed four cached results. |
| Background service-worker stop | Not performed: Computer Use stopped at URL verification while navigating the service-worker page. No service-worker-stop acceptance evidence is claimed. |
| Active cancellation | An earlier Cancel attempt followed a timeout and did not establish cancellation. A subsequent native test succeeded on batch `8fc2d531-b53b-4f47-b46c-9661401b5477`: `orders.csv` was done while the 100-page scan recognized page 4. Clicking Cancel changed the status to “2 of 2 finished · 1 cancelled · cancelled”; repeated capture confirmed “Batch cancelled.” for the scan and notice, with the correct CSV Markdown preserved. |
| Processing after cancellation | New batch `75a2cfb3-492a-40d9-8e94-d345f34d3c82` started after cancellation. Its CSV completed and the 40-page scan advanced from page 4 to page 16, confirming resources were released for further processing. |
| Native close/reopen | Ctrl+W closed the owner processor for batch `75a2cfb3-492a-40d9-8e94-d345f34d3c82`; no Leave prompt was observed. The next capture showed the previous observing tab and its last durable stage at page 21, with the owner tab absent. Ctrl+Shift+T reopened the owner URL. A settled capture showed both files done (2 of 2), with expected CSV Markdown preserved. Recognition restart was not observed during reopening, and the recovered scan's complete Markdown has not yet been inspected. |

`tests/fixtures/manual/scan-40-pages.pdf` and `scan-100-pages.pdf` contain synthetic repeated scan pages. They provide interaction windows for lifecycle checks; they do not establish real-world document fidelity.

Active cancellation, subsequent processing, and close/reopen now have native Chrome evidence using synthetic fixtures. The lifecycle group remains pending because it requires a long real-world scanned document. Seven checklist groups remain open in `ManualAcceptanceChecklist.md`.

Remaining handoff limits: folder selection cancellation was observed, but granting, denying and regranting folder access must be performed by the user. The Computer Use skill (local workflow guidance) requires its guidance, which says, “Do not act on security or privacy permission requests.” This prevents automating those permission steps. The service-worker internal page encountered a runtime URL-verification block. Physical network disconnection and the related browser restart require human execution. A broader document corpus, desktop Office inputs and low-memory device are not available for the remaining fidelity checks.

ONNX Runtime Web 1.23.2 emitted “Unknown CPU vendor. cpuinfo_vendor value: 0” during the scan. Its maintainers explain that browsers do not expose CPU vendor information and removed the confusing warning for WebAssembly in [upstream PR #27399](https://github.com/microsoft/onnxruntime/pull/27399). This warning did not prevent the observed 40-page conversion. Logs remain unsuppressed.

## Follow-up evidence collected October 4; recorded October 5, 2026

These observations do not complete another group. Acceptance remains **2/9 (22.2%)**. No production code, dependencies, settings or release ZIP changed.

Environment: existing native Chrome profile, MarkItDown 0.3.0, extension ID `lonejkpnaeikkmkkkhbajkjjpancjbad`. The earlier session identified Chrome 154; its exact build was not re-read. The processing page reported approximately 32 GB RAM. Settings showed English, 0-degree rotation, automatic PDF mode, both expiry settings at 24 hours, Chrome's default download location, and three model assets totaling 12.02 MiB. This cache-status count does not establish offline validity or Arabic readiness.

| Check | Observed evidence | Limit |
| --- | --- | --- |
| Recovered synthetic output | Owner `75a2cfb3-492a-40d9-8e94-d345f34d3c82` still showed both siblings done. Selected the scan and inspected complete Markdown: Pages 1–40 each contain `Local document conversion 2026`. Preserved in recovered-synthetic-40.md (local-only evidence: `evidence/2026-10-04/recovered-synthetic-40.md`). | Supersedes the earlier missing-output-inspection note; not real-world lifecycle acceptance. |
| Independent scans | Native file picker selected `c03-29.pdf` and `linn.pdf`. Batch `2dc2622e-8945-434b-8ab4-aff788637f00` showed the first done while the second recognized page 1, then 2/2 done. Both have one page and no native text layer. Complete outputs were inspected and preserved. | No Cancel, close/reopen, worker-stop or offline action on this batch. No reliable per-file timing captured. |
| Download & Open | From the brochure result, Download & Open saved `linn.md` (native UI: 4.5 KB, Done) and opened `linn.pdf — Markdown` at `viewer.html?id=7b0100c9-943a-4bde-a693-360c7a17ca87`. Preview contained the delivered text. | Default folder only. |
| Numbered default download | Download in the preview created `linn (1).md`. Both files remain in Downloads, each 4,579 bytes, with identical SHA-256 `9ca6b3d066137ecad64b440e541c4ed3890c8b7f6ee54dea48cf804fda922c2b`. | Does not establish custom-directory collisions or reset from a custom directory. |
| Desktop PowerPoint | PowerPoint 2016 was listed as installed. Its requested launch returned `Computer Use app approval timed out`. | No desktop deck was opened/saved/inspected. Approval timeout, not an extension defect. |

### Corpus and accuracy

Inputs came from [OCRmyPDF's resource collection](https://github.com/ocrmypdf/OCRmyPDF/tree/main/tests/resources). [SOURCE.json](fixtures/independent/ocrmypdf/SOURCE.json) records URLs, sizes and hashes; upstream `README.rst` and `REUSE.toml` are preserved. `c03-29.pdf` is a public-domain scan of the chapter-three opening of *Adventures of Huckleberry Finn*. `linn.pdf` is a 1985 Forat Electronics brochure, licensed under GFDL-1.2-or-later or CC-BY-SA-3.0 per upstream attribution. `skew.pdf` is a simulated-skew derivative: downloaded and structurally inspected, **not converted in this native batch**. The multipage download timed out. None is long-scan lifecycle evidence.

The book page misreads `Chapter III.` as `Chapter II a`, splits `WELL`, misreads its illustration caption and inserts that caption into the narrative, and changes punctuation. The brochure interleaves the two middle columns line by line, splits words such as `performance`, and misreads the disk-size fraction. These are material extraction limitations. A successful job does not establish faithful transcription. No engine or layout change was made solely to improve these samples.

The book page's full visual transcription was compared with uncorrected output using Levenshtein distance after NFKC and whitespace normalization, counting spaces. Only the generated `## Page 1` heading was excluded. Reference: 1,430 normalized characters; observed: 1,434; distance: 64; **CER: 4.4755%**. The reference preserves case/typographic punctuation and the printed line-end hyphen; it places the illustration caption after the narrative, so reading order contributes to CER. This is one historical English page, not a general accuracy result or agreed acceptance threshold.

Reproduce with `node tests/evidence/2026-10-04/measure-corpus.mjs`. Records: expected (local-only evidence: `evidence/2026-10-04/c03-29.expected.txt`), observed (local-only evidence: `evidence/2026-10-04/c03-29.observed.md`), measurement (local-only evidence: `evidence/2026-10-04/ocr-measurement.json`), brochure output (local-only evidence: `evidence/2026-10-04/linn.downloaded.md`), download checks (local-only evidence: `evidence/2026-10-04/default-downloads.json`). The downloaded brochure differs from its accessibility capture only by a final newline. Upstream `linn.txt` has transcription/OCR artifacts and was not treated as verified ground truth.

### Remaining human steps and inputs

Questions about availability for permission/network steps, a low-memory device and intended OCR use had no responses when this record was saved. Custom-folder grant/denial/restart/regrant/reset, worker-specific stop, both cached languages with physical offline restart, actual expiry/reconnect, long independent scan lifecycle, broader Arabic/mixed/photo/orientation corpus, real low-memory hardware and desktop producer cases remain pending. No blocked service-worker navigation was retried. Reobserve current Chrome and cache state before continuing; October 4 state may be stale.
