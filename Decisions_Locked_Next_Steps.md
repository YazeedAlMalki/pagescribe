# MarkItDown Chrome Extension — Decisions LOCKED + Next Steps

**Date**: October 3, 2026  
**Status**: Ready to code  
**Cancelled**: Phase 3 (Cloud APIs)

---

## 7 DECISIONS LOCKED IN

| # | Feature | Your Decision | Impact |
|---|---------|---------------|--------|
| 1 | **File upload** | Both (drag-drop + picker) | Popup supports both UX patterns |
| 2 | **Output delivery** | Both (copy + download) | Users choose their workflow |
| 3 | **PPTX support** | ✅ YES (include Phase 2) | +1 week, +JS PPTX parser library |
| 4 | **YouTube transcripts** | ❌ NO (skip) | Saves 3 days, reduces scope |
| 5 | **Model cache** | 24h auto-expire | No manual cleanup needed, IndexedDB auto-clear |
| 6 | **Batch processing** | ✅ YES (multiple files) | Queue system needed |
| 7 | **Legacy XLS** | ✅ YES (support if possible) | SheetJS already supports it |

---

## LIBRARY DECISIONS

### For PPTX Parsing ✅

**Choice**: `makeitmarkdown`'s approach OR `@hokkyss/pptx-parser`

**Why**:
- `makeitmarkdown`: Production-proven web app (converts PPTX in browser successfully)
- `@hokkyss/pptx-parser`: Zero dependencies, isomorphic (Node + browser)

**What to use**: Either:
- Port the PPTX parsing logic from `makeitmarkdown` (proven to work)
- Use `@hokkyss/pptx-parser` npm package if stable enough

**Fallback**: `unzipit` + manual XML parsing (last resort, more work)

---

### For Legacy XLS ✅

**Choice**: `SheetJS (xlsx)` - already your XLSX library!

**Why**:
- Handles legacy XLS BIFF5/BIFF8 out-of-box
- You already depend on it for XLSX
- No additional library needed
- Production-proven (300k+ weekly downloads)

**Implementation**: Extend your existing `SheetJS` integration to handle `.xls` files

```javascript
// What you already do for XLSX:
const workbook = XLSX.read(file, { type: 'binary' });

// Same code works for XLS! No changes needed.
```

---

## PHASE 1: CORE (Unchanged)

**Timeline**: 2 weeks | **Size**: 500 KB  
**Status**: ✅ Ready to build

| Format | Library | Size |
|--------|---------|------|
| HTML | turndown | 50 KB |
| XLSX | SheetJS | 200 KB |
| CSV/JSON/XML | native | 0 KB |
| DOCX | mammoth.js | 100 KB |
| EPUB | epub.js | 80 KB |
| ZIP | jszip | 60 KB |
| EXIF | piexifjs | 20 KB |

---

## PHASE 2: OCR + EXTRAS (Updated)

**Timeline**: 2 weeks | **Size**: +1.8 MB  
**Status**: ✅ Ready to build

### Confirmed
- ✅ Image OCR: `ppu-paddle-ocr` (1.5-2 MB)
- ✅ PDF text: `pdfjs-dist` (300 KB)
- ✅ PDF scanned: PaddleOCR fallback
- ✅ Model caching: IndexedDB (auto-expire 24h)

### NEW (From Your Decisions)
- ✅ **PPTX parsing**: `makeitmarkdown` approach or `@hokkyss/pptx-parser`
- ✅ **XLS support**: SheetJS (no new library)
- ❌ **YouTube transcripts**: Removed (your call)

---

## FINAL TIMELINE

### Tier A: Must-Do (Phase 1 + Phase 2 core)
- ✅ 2 weeks = all 7 formats + OCR

### Tier B: From Your Decisions
- ✅ +1 week = PPTX parsing
- ✅ 0 days = XLS support (included with SheetJS)
- ✅ -3 days = No YouTube transcripts

**Total**: **3 weeks** (vs 4-5 weeks if you'd picked differently)

---

## WHAT YOU DO vs WHAT I DO

### ✍️ YOU Must Do (Before Code Starts)

**1. UI/UX Wireframe** (1-2 hours)
   - Draw popup layout (drag-drop zone, file picker, output area, settings)
   - Where do output buttons go? (Copy, Download, both?)
   - Settings page: What toggles/options?

**2. Cache Expiration Logic** (clarification)
   - 24h auto-delete: Per-file or all models together?
   - Should user see remaining time? Countdown timer?

**3. PPTX Parsing Decision** (now)
   - Test `makeitmarkdown`'s PPTX logic (is it portable?)
   - OR commit to `@hokkyss/pptx-parser` npm package
   - Decision: Which library to wrap?

**4. Batch Processing Details** (clarification)
   - Process files sequentially or parallel?
   - Show per-file progress or overall progress?
   - Max files at once? (5? 10? unlimited?)

---

### 💻 I Can Build (Immediately After Your Input Above)

**Phase 1** (2 weeks):
- Chrome MV3 extension scaffold (manifest, popup, background worker)
- File drop zone + file picker UI
- Converter wrappers (turndown, SheetJS, mammoth, epub.js, jszip, piexifjs)
- Output buttons (copy to clipboard, download .md)
- Error handling + user feedback

**Phase 2a** (1 week):
- PaddleOCR integration + lazy model loading
- IndexedDB model caching with 24h auto-expiry
- PDF text extraction
- Batch file queue system

**Phase 2b** (1 week):
- PPTX parser integration (whichever you choose)
- XLS support (extend SheetJS)
- Settings page UI

---

## CONCRETE BLOCKERS (Before I Start)

🛑 **I need these 4 decisions locked**:

1. **PPTX library choice**
   - [ ] Use `makeitmarkdown` logic (port/license check needed)
   - [ ] Use `@hokkyss/pptx-parser` npm (check it's maintained)
   - [ ] Something else?

2. **Popup UI sketch**
   - [ ] Where's the drag-drop zone?
   - [ ] Where are Copy/Download buttons?
   - [ ] Settings icon location?

3. **Batch processing details**
   - [ ] Sequential or parallel?
   - [ ] Max files at once?
   - [ ] Per-file or overall progress?

4. **Cache UI**
   - [ ] Should users see "expires in X hours"?
   - [ ] Manual "clear cache" button in settings?
   - [ ] Or silent auto-delete after 24h?

---

## NOT BLOCKED (Already Clear)

✅ File upload: Both  
✅ Output: Both  
✅ OCR: PaddleOCR  
✅ XLS: SheetJS  
✅ Model cache: 24h auto-expire  
✅ No YouTube  
✅ Multiple files  

---

## Success Criteria (Phase 1 + 2)

| Metric | Target | Status |
|--------|--------|--------|
| Formats supported | 9 (Phase 1) + 2 (Phase 2) = 11 | Scoped ✅ |
| Extension size | <3 MB (pre-models) | Tracked ✅ |
| OCR accuracy | >85% on receipts/documents | PaddleOCR baseline ✅ |
| Offline capability | 100% for Phase 1 + 2 | Planned ✅ |
| Processing speed | <5 sec for typical document | Achievable ✅ |
| Model cache | First load: 30s, subsequent: instant | Designed ✅ |

---

## Open Questions (If Needed Later)

- PPTX image extraction: Should OCR embedded images in slides?
- Cache location: IndexedDB size limit (~100 MB)—enough?
- Error handling: Fail silently or show error messages?
- Accessibility: Need WCAG compliance?

**These are nice-to-haves, don't block launch.**

---

## NEXT STEP (Literally Right Now)

**You decide these 4 things:**

1. **PPTX library**: makeitmarkdown approach OR @hokkyss/pptx-parser?
2. **Popup sketch**: Draw/describe layout
3. **Batch processing**: Sequential vs parallel, max files?
4. **Cache UI**: Silent or show countdown timer?

**Once answered**: I build Phase 1 in 2 weeks, you iterate on design.

