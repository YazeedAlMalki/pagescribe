# Test fixture provenance and acquisition

Generated fixtures are rebuilt with `npm run fixtures`; their source is in `tests/helpers/`. Independent binary inputs and raw native UI evidence are excluded from source publication. Existing local copies are preserved.

Run `node scripts/acquire-fixtures.mjs` before Node/browser tests. It acquires the showcase and six desktop decks from the URLs in the committed SOURCE.json files, verifies byte counts and SHA-256 hashes before writing, and fails on changed content. Existing files are also verified. No hash is silently updated. The showcase URL uses an upstream branch; if it disappears or changes, recover the exact recorded blob before continuing.

| Corpus | Retained provenance | Publication treatment |
| --- | --- | --- |
| PPTX showcase | [Source and hash](../tests/fixtures/independent/SOURCE.json), [upstream MIT notice](../tests/fixtures/independent/LICENSE.txt) | Download separately; no deck binary in source |
| LibreOffice desktop decks | [Pinned commit and hashes](../tests/fixtures/independent/libreoffice/SOURCE.json), COPYING and COPYING.MPL alongside it | Download separately; retained upstream notices do not assign the project's license |
| OCRmyPDF scans/brochure | [Source and hashes](../tests/fixtures/independent/ocrmypdf/SOURCE.json); acquisition also downloads upstream README.rst and REUSE.toml | Download separately; no brochure, derived output or screenshots distributed in source |
| Gutenberg chapter openings | [Image URLs and hashes](../tests/fixtures/independent/gutenberg/SOURCE.json) | Download separately; original source record describes US public-domain status |

For optional extended acceptance, run `node scripts/acquire-fixtures.mjs --all`. This verifies the recorded images/documents and assembles twelve scans into a PDF with deterministic metadata. Its container hash differs from the historical PDF; the source image hashes and page order are unchanged. Existing historical SOURCE.json records are preserved. The older acquisition scripts refresh provenance and are historical maintainer tools, not the reproduction command.

`npm run test:browser` fetches OCR model fixtures when missing, checking the pinned catalogue. `node scripts/fetch-model-fixtures.mjs` explicitly repeats acquisition/verification. Models are not in Git; their license is retained in `scripts/vendor/PADDLE_MODELS_LICENSE.txt`. The extension downloads these same pinned data assets on a model-cache miss.

Raw `tests/evidence/`, local browser profiles, manual-output directories and derived corpus output remain local. Public acceptance reports summarize their recorded results; mentions of local evidence are provenance descriptions, not promised repository downloads. The historical OCR measurement script needs those retained local ground-truth/output files and is not part of fresh-clone verification.
