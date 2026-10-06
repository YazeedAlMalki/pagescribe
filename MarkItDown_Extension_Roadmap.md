# MarkItDown Chrome Extension — Build Roadmap

## Decision Made
- ✅ **OCR Solution**: PaddleOCR (`ppu-paddle-ocr`)
- **Why**: 1.5-2 MB, 2-3x faster than tesseract.js, production-proven, offline-capable

---

## What to Build (3 Phases)

### Phase 1: Core Formats (2 weeks) — Ship First
**Size: ~500 KB**

| Format | Library | Status |
|--------|---------|--------|
| HTML → Markdown | `turndown` | Ready |
| CSV/JSON/XML | native JS | Ready |
| XLSX (modern Excel) | `SheetJS` | Ready |
| DOCX (Word) | `mammoth.js` | Ready (85% fidelity) |
| EPUB (e-books) | `epub.js` | Ready |
| ZIP archives | `jszip` | Ready |
| Image EXIF | `piexifjs` | Ready |

**What you get**: User can convert web pages, office docs, spreadsheets, e-books to markdown. No OCR yet.

**Effort**: Port MarkItDown's converters to JS, wire them together, add UI.

---

### Phase 2: Image OCR + Extras (2 weeks) — Add Value
**Additional size: +1.5-2 MB**

| Feature | Library | Status |
|---------|---------|--------|
| Image OCR (JPG, PNG) | `ppu-paddle-ocr` (ONNX) | Proven, production-ready |
| PDF text extraction | `pdfjs-dist` | Lightweight |
| PowerPoint (PPTX) | custom XML parsing | Doable, complex |
| YouTube transcripts | youtube-transcript npm | Ready |

**What you get**: User can OCR images embedded in documents. Extract text from PDFs. Convert presentations.

**Effort**: Integrate PaddleOCR, handle model loading + caching, wire PDF extraction, handle PPTX schema.

---

### Phase 3: Premium (Optional, 1 week)
**Additional size: +50 KB**

**Cloud OCR fallback** (user provides API key):
- Google Cloud Vision
- Azure Computer Vision
- AWS Textract

**What you get**: Toggle in settings. "Use cloud OCR for better accuracy on complex docs."

**Effort**: Wrap cloud SDKs, handle API key storage, fallback logic.

---

## Dependencies by Phase

### Phase 1
```json
{
  "dependencies": {
    "turndown": "^7.x",
    "papaparse": "^5.x",
    "SheetJS": "^0.18.x",
    "mammoth": "^1.x",
    "epub.js": "^0.3.x",
    "jszip": "^3.x",
    "piexifjs": "^0.1.x"
  },
  "total_size": "~400 KB (bundled + minified)"
}
```

### Phase 2 (Add)
```json
{
  "dependencies": {
    "ppu-paddle-ocr": "^latest",
    "onnxruntime-web": "^1.20.x",
    "pdfjs-dist": "^4.x"
  },
  "additional_size": "~1.8 MB (models downloaded on first use, cached locally)"
}
```

### Phase 3 (Add)
```json
{
  "dependencies": {
    "@google-cloud/vision": "^4.x",  // OR
    "@azure/cognitiveservices-computervision": "^9.x"
  },
  "additional_size": "~50 KB"
}
```

---

## PaddleOCR Setup Details

### Model Files (~50 MB, cached locally)
```
ppu-paddle-ocr automatically fetches:
- PP-OCRv5_mobile_det_infer.onnx  (~2.2 MB) — text detection
- PP-OCRv5_mobile_rec_infer.onnx  (~6 MB) — text recognition
- Dictionary (ppocr_keys_v1.txt)  (~10 KB) — character set

On first use: Download ~8 MB, cache in IndexedDB or localStorage
On subsequent uses: Load from cache, instant
```

### Extension Permission Needed
```json
{
  "permissions": [
    "storage",  // for caching models
    "offscreen"  // optional: for background processing
  ]
}
```

### Estimated Flow
1. User selects image or document
2. Extension extracts embedded images
3. PaddleOCR processes (local, ~1-3 seconds per image)
4. Text inserted into markdown output
5. Models cached for next use

---

## Architecture Sketch

```
Chrome Extension
├── Background Worker
│   ├── File input handler
│   ├── Format router (HTML, XLSX, DOCX, etc.)
│   ├── MarkItDown converters (ported JS)
│   ├── PaddleOCR service (lazy-loaded)
│   └── Model cache manager
├── Popup UI
│   ├── File picker
│   ├── Format selector
│   ├── OCR toggle
│   └── Output (copy/download)
└── Options Page
    ├── Cloud API settings (Phase 3)
    ├── Model management
    └── Cache clear button
```

---

## Timeline

| Phase | Work | Effort | When |
|-------|------|--------|------|
| **1** | Core converters (HTML, CSV, XLSX, DOCX, EPUB, ZIP) | 2 weeks | Now |
| **2** | PaddleOCR + PDF extraction + PPTX | 2 weeks | Week 3-4 |
| **3** | Cloud OCR fallback (optional) | 1 week | Week 5 |

**Total**: 4-5 weeks from start to full feature parity

---

## What's Left — Next Steps

### Decisions Still Needed

1. **UI/UX Design**
   - Popup layout? (simple file picker → output area)
   - Settings/options page design?
   - Progress indicators while processing?
   - Batch processing support? (multiple files at once)

2. **File Handling**
   - How does user upload files? (drag-drop, file picker, both?)
   - Where do models cache? (IndexedDB, localStorage, Chrome's cache?)
   - Can extension access files from Downloads folder? (permission scoping)

3. **Output Delivery**
   - Copy to clipboard? Download as .md file? Both?
   - Preserve structure/images in output? How?
   - File naming convention?

4. **Cloud OCR (Phase 3)**
   - Which service(s)? Google, Azure, AWS, all three?
   - How store user API keys securely? (Chrome's storage.sync with encryption?)

### Research/Setup Needed

1. **PaddleOCR Integration** (before Phase 2)
   - Test `ppu-paddle-ocr` in a chrome extension sandbox
   - Verify WASM modules load from extension bundle
   - Benchmark model download + cache flow
   - Test multi-language support

2. **Bundling Strategy**
   - Webpack/Vite for extension? (popover + background worker)
   - How to lazy-load PaddleOCR models? (on-demand, not on startup)
   - Code splitting: which libs load when?

3. **Extension Manifest (MV3)**
   - Declare all CSP rules for ONNX Runtime WASM
   - Content script permissions for file processing
   - Background worker setup

4. **Testing**
   - Unit tests for each converter
   - E2E test: full pipeline (file → markdown)
   - OCR quality tests (sample images)

### Code Starting Point

**Needed**:
- [ ] Scaffolded Chrome extension (MV3)
- [ ] Popup component (file input + output)
- [ ] Background worker (process queue)
- [ ] Converter factory (route by MIME type)
- [ ] Model loader + cache (PaddleOCR)
- [ ] Error handling + progress states

---

## Quick Reference: What Gets Built

### Phase 1 Outputs
- ✅ User uploads file
- ✅ Extension detects format (DOCX, XLSX, PDF, etc.)
- ✅ Converts to markdown
- ✅ User copies/downloads result
- ❌ No OCR yet

### Phase 2 Outputs
- ✅ All Phase 1 features
- ✅ Embedded images → OCR'd text (PaddleOCR)
- ✅ Scanned PDFs → OCR'd markdown
- ✅ Complex documents → richer output
- ❌ No cloud API yet

### Phase 3 Outputs
- ✅ All Phase 1 + 2 features
- ✅ Settings toggle: "Use cloud OCR for complex docs"
- ✅ User provides API key
- ✅ Fallback to cloud when local accuracy insufficient
- ✅ Production-ready, fully featured

---

## Red Flags / Known Issues

1. **PaddleOCR Model Caching**
   - Models are ~8 MB, may take time to download first load
   - IndexedDB has quota limits (~100 MB per extension)
   - **Mitigation**: Download once, reuse indefinitely; offer manual cache clear

2. **WASM + ONNX Runtime**
   - WASM files must be served from extension bundle
   - CSP headers strict in extension context
   - **Mitigation**: Test ONNX Runtime WASM loading early in Phase 2

3. **PaddleOCR Accuracy**
   - Excels at printed text, receipts, documents
   - Struggles with: handwriting, very small text, rotated images
   - **Mitigation**: Show confidence scores, offer cloud OCR fallback for edge cases

4. **File Upload Size**
   - Large PDFs (50+ MB) may timeout
   - XLSX with 10k+ rows may be slow
   - **Mitigation**: Set reasonable size limits, show warnings

---

## Success Criteria

✅ **MVP (Phase 1)**:
- Converts 6+ document formats
- Works offline
- <1 MB extension size (before models)
- No crashes on valid input

✅ **Feature Complete (Phase 2)**:
- All formats including OCR
- Embedded images → text
- <3 MB extension size (before models)
- Fast processing (<5 seconds per document)

✅ **Production (Phase 3)**:
- Optional cloud OCR
- User configurable settings
- Graceful fallbacks
- >90% accuracy on sample docs

