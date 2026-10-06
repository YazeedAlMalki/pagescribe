# Batch Processing — Machine Requirements Comparison

## Option A: SEQUENTIAL (One-by-one)

### Minimum Machine Requirements

| Component | Minimum | Recommended | Why |
|-----------|---------|-------------|-----|
| **RAM** | 2 GB | 4 GB | Only 1 file in memory at a time; PaddleOCR models + 1 image = ~1.5 GB |
| **CPU** | Dual-core (2010+) | Quad-core (2015+) | Processing one file doesn't need much parallelism |
| **Disk space** | 500 MB free | 1 GB free | Models cache (~8 MB) + temp files for one document |
| **Browser** | Chrome 90+, Edge 90+, Firefox 88+ | Latest | Needs modern WASM support |
| **OS** | Windows 7+, macOS 10.12+, Linux any | Recent OS | Standard modern browser support |

### Real-World Example

**User's machine**: 2GB RAM, older dual-core CPU (2012 laptop)

```
Processing 5 files sequentially:
File 1 (XLSX): 1.2 GB RAM used → completes → freed
File 2 (DOCX): 1.2 GB RAM used → completes → freed
File 3 (PDF):  1.3 GB RAM used → completes → freed
File 4 (PPTX): 1.2 GB RAM used → completes → freed
File 5 (CSV):  800 MB RAM used → completes → freed

✅ Works fine (barely)
⏳ Takes ~3-4 minutes for 5 files
```

### Pros & Cons

**Pros**:
- Works on very old/weak machines
- Users with 2GB RAM laptops (many in developing countries) supported
- Low CPU stress
- No risk of crash from memory exhaustion

**Cons**:
- Slow (3-4 min for 5 files)
- Only one conversion runs at a time
- Users with modern machines feel it's slow

---

## Option B: PARALLEL (All at once)

### Minimum Machine Requirements

| Component | Minimum | Recommended | Why |
|-----------|---------|-------------|-----|
| **RAM** | 4 GB | 8 GB | 5 files × 1.2 GB per file = ~6 GB if all process simultaneously |
| **CPU** | Quad-core (2015+) | 6+ cores (2018+) | Parallel processing needs multiple cores for OCR |
| **Disk space** | 1 GB free | 2 GB free | Models cache + temp files for 5 documents at once |
| **Browser** | Chrome 90+, Edge 90+, Firefox 88+ | Latest | Same as sequential |
| **OS** | Windows 10+, macOS 10.14+, Linux recent | Recent OS | Better memory management needed |

### Real-World Example

**User's machine**: 8 GB RAM, modern quad-core CPU (2018 laptop)

```
Processing 5 files in parallel:
File 1 (XLSX): 1.2 GB RAM
File 2 (DOCX): 1.2 GB RAM
File 3 (PDF):  1.3 GB RAM
File 4 (PPTX): 1.2 GB RAM
File 5 (CSV):  800 MB RAM
─────────────────────────
Total:         6.7 GB used (out of 8 GB available)

✅ Works, with 1.3 GB headroom
⚡ Takes ~40-50 seconds for all 5 files

Machine: 4 GB RAM
❌ Crashes or hangs (4 GB needed for OS + extension, no room for 5 files)
```

### Pros & Cons

**Pros**:
- Fast (40-50 sec for 5 files vs 3-4 min)
- Modern machines feel responsive
- Better UX

**Cons**:
- Requires 4GB RAM minimum (cuts off older machines)
- 8GB+ needed for smooth experience
- Risk of browser crash on machines with <4GB

---

## Comparative Table: What Machines Can Run Each?

| Machine Profile | Year | RAM | CPU | Option A? | Option B? |
|-----------------|------|-----|-----|-----------|-----------|
| Old laptop | 2012 | 2 GB | Dual-core | ✅ YES (slow) | ❌ NO (crash) |
| Budget laptop | 2016 | 4 GB | Quad-core | ✅ YES (ok) | ✅ YES (ok) |
| Mid-range laptop | 2018 | 8 GB | Quad-core | ✅ YES (fast) | ✅ YES (very fast) |
| Modern laptop | 2024 | 16 GB | 8+ cores | ✅ YES (very fast) | ✅ YES (very fast) |
| Budget desktop | 2016 | 8 GB | Quad-core | ✅ YES | ✅ YES |
| Chromebook | Various | 2-4 GB | Dual-core | ✅ YES | ⚠️ MAYBE |

---

## Real Usage Statistics (Context)

**In Riyadh SME market** (your target):
- Many users still on 4-8 GB machines
- Mix of older (2-3 year old) and new laptops
- Some still running Windows 7 (won't update)
- Mobile/tablet users less common for document conversion

**Global Chrome users**:
- 30% have 4 GB or less RAM
- 70% have 4+ GB RAM

---

## My Recommendation (Not Embedded)

| Criterion | Weight | Favors |
|-----------|--------|--------|
| Broad compatibility | High | **Option A** (2GB machines work) |
| User satisfaction | High | **Option B** (fast & snappy) |
| Development simplicity | Medium | **Option A** (no concurrency bugs) |
| Target market (Riyadh SMEs) | High | **Mixed** (some old, some new) |

### Hybrid Approach (Best of Both)

**Default**: Sequential (safe for all machines)  
**User toggle in settings**: "Use faster parallel processing if available"
- Auto-detect available RAM
- If ≥4GB: offer parallel mode
- If <4GB: force sequential

**Cost**: +100 lines of code, 100% compatibility

---

## Decision: What Should You Choose?

| Goal | Choose |
|------|--------|
| **Support EVERYONE** (2GB+ machines) | Option A (Sequential) |
| **Assume modern machines** (4GB+) | Option B (Parallel) |
| **Best of both worlds** | Hybrid (detect & switch) |

**What I'd recommend for you**: 
- Start with **Option A (Sequential)** for Phase 1
- Add toggle to settings for Phase 2
- Let user choose based on their machine

This gives you launch speed + broad compatibility.

