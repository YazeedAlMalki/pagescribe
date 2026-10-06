# PageScribe v0.3.1 beta

PageScribe now has its own page-and-fountain-pen logo. This update adds Chrome extension and toolbar icons, replaces the popup and Settings monogram, adds browser-tab icons and displays the logo in the GitHub README.

## Install

Download **PageScribe-0.3.1.zip**, extract it, then open Chrome/Edge Extensions, enable Developer mode and select **Load unpacked** for the directory containing manifest.json. Existing unpacked installations can replace their files in the same folder and click Reload. Keep the processing tab open during conversion.

## Verification

Static checks passed for 262 runtime files. All four PNG icon sizes were verified. The packaged popup, Settings and preview pages loaded their icons successfully, and the popup was visually inspected. ZIP contents match the local runtime files; all conversion JavaScript, dependencies, models and notices are byte-identical to 0.3.0. The 78-test and full browser-suite results from 0.3.0 remain the conversion baseline; they were not rerun for this visual update.

This remains a beta. Native acceptance is still 2/9 groups complete; OCR and complex-layout limitations remain. See the [README](https://github.com/YazeedAlMalki/pagescribe/blob/v0.3.1/README.md). MIT licensing, Microsoft MarkItDown attribution and dependency notices are retained. PageScribe is independent and is not affiliated with or endorsed by Microsoft.

## Download identity

Size: **6,403,715 bytes**. SHA-256:

```text
9edd13e5077364e2ddccf2b64a952f0a9b9366f0d4c51f3293578635f3309cc6  PageScribe-0.3.1.zip
```

---

# PageScribe v0.3.0 beta

PageScribe is the new name of this independent local document-to-Markdown extension. It is inspired by [Microsoft MarkItDown](https://github.com/microsoft/markitdown); it is not affiliated with or endorsed by Microsoft. Microsoft attribution, the project MIT license and all dependency notices are included.

## Install

Extract **PageScribe-0.3.0.zip**, open Chrome/Edge 130+ Extensions, enable Developer mode and choose **Load unpacked** for the directory containing manifest.json. Keep the processing tab open during conversion. See the [README](README.md) for source builds and supported formats.

## Included

Searchable PDF extraction, per-page scanned-PDF recognition, English/Arabic image OCR, PowerPoint text extraction and the existing HTML, spreadsheets, DOCX, EPUB, text and ZIP converters. This release changes the visible branding and adds an About credit in Settings. Internal storage identifiers are preserved. Cloud OCR and API key handling remain cancelled.

Conversion runs locally. Initial or expired OCR models require networking; valid cached models work offline. Review OCR output: real scans can contain missing words, wrong numerals and reading-order errors. Complex PDF tables/columns and PPTX master/layout text, inherited bullets, charts, SmartArt and positioning are limited.

## Verification and remaining acceptance

All **78 Node tests** passed. Static checks covered **258 runtime files**. Browser regression and all **10 Phase 2 groups** passed against the extracted renamed ZIP, with full asset equality. See [publication verification](docs/PageScribePublication.md).

Native Chrome acceptance remains **2 of 9 groups complete (22.2%)**. Folder permissions/restart, native worker-stop confirmation, actual-age model expiry, full native recovered-output inspection, broader Arabic/mixed/photo/EXIF cases, desktop slide comparisons and highest-fidelity OCR acceptance remain incomplete. Physical disconnection and real low-memory hardware were waived, not passed. This is a beta; no general OCR accuracy guarantee is made. Chrome Web Store publication is outside scope.

## Download identity

Size: **6,384,878 bytes**. SHA-256:

```text
865e1a15fb3ec29e22430062722127745f9dbe336fc54dcf6128a5601e9eaacf  PageScribe-0.3.0.zip
```
