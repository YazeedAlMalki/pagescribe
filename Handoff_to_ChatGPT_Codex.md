# MarkItDown Chrome Extension — Phase 1 Handoff to ChatGPT Codex

## Copy This Prompt Into ChatGPT (with attachments listed below)

---

I'm building a Chrome extension that converts documents to Markdown (porting Microsoft's MarkItDown to JavaScript).

**Attached files contain:**
- Full feature breakdown + library choices
- UI spec + architecture diagram
- Batch processing decision (parallel mode, 4+ GB RAM)
- All locked decisions for Phase 1

**Phase 1 scope (2 weeks):** Ship core conversion for 9 formats using these libraries:
- HTML → Markdown: `turndown`
- XLSX: `SheetJS`
- XLS (legacy): `SheetJS` (built-in)
- CSV/JSON/XML: native JS
- DOCX: `mammoth.js`
- EPUB: `epub.js`
- ZIP: `jszip`
- Image EXIF: `piexifjs`

**UI:** Drag-drop zone + file picker → file type dropdown → Copy button + Download menu (Download / Download & Open / Open in new tab) → Settings icon

**Batch processing:** Parallel mode (all files at once, requires 4+ GB RAM)

**Please generate Phase 1 scaffolding:**
1. `manifest.json` (MV3, permissions: storage)
2. `popup.html` + `popup.css` + `popup.js` (UI layout per spec)
3. `background.js` (file handler, format router, batch queue)
4. `lib/` folder structure (stubs for each format converter)
5. `settings.html` + `settings.js` (cache timer, download dir, clear cache)
6. A parallel batch processor (worker pool, memory monitoring, error handling)

Output as a clean, testable structure. Include comments for where each format's logic goes.

---

## ATTACHMENTS TO INCLUDE

Send these files as attachments in ChatGPT:

1. **MarkItDown_Features_Porting_Analysis.md** — Feature breakdown, lib difficulty
2. **MarkItDown_Extension_Roadmap.md** — Timeline + phase breakdown
3. **Feature_Status_Inventory.md** — What's in Phase 1 vs later
4. **Decisions_Locked_Next_Steps.md** — All decisions + blockers (none left)
5. **PPTX_Library_Choice_Final.md** — PPTX lib decision (not Phase 1, but context)
6. **Batch_Processing_Machine_Requirements.md** — Why parallel mode was chosen

All 6 files are in `./`

---

## What to Ask For If Codex Halts

If Codex gets stuck or generates something off-spec:

**"This doesn't match the parallel batch processor requirement. The queue should handle 5+ files simultaneously. Let me paste the Architecture section again..."** (then paste the architecture from Decisions_Locked)

**"The manifest.json is missing the offscreen permission for background OCR. Add it and update popup.js to check for it."**

**"The settings page needs a cache timer input (default 24h). Right now it's just a button. Add a number input and localStorage for it."**

---

## When to Stop & Come Back to Me

- Codex halts after generating structure (doesn't complete implementation)
- You want to integrate this back into a Claude Cowork session
- Phase 1 scaffolding is done and you want me to handle Phase 2 (OCR + PDF + PPTX)

Then paste the output here and say **"Done with Codex. Pick it up for Phase 2?"** and I'll take the codebase forward.

---

## Files You'll Need to Paste

Use this exact text in ChatGPT's file upload:

```
@MarkItDown_Features_Porting_Analysis.md
@MarkItDown_Extension_Roadmap.md
@Feature_Status_Inventory.md
@Decisions_Locked_Next_Steps.md
@PPTX_Library_Choice_Final.md
@Batch_Processing_Machine_Requirements.md
```

Then paste the prompt above.

---

**Good luck with Codex today. I'll be ready to pick it up whenever you're done.**
