import { ConversionError } from '../errors.js';
import { LIMITS } from '../limits.js';
import { cell } from '../markdown.js';
import { layoutText, usableText } from './pdf-layout.js';
import { createOcrSession } from '../ocr/service.js';
import { IMAGE_LIMITS } from '../ocr/image.js';

export const PDF_LIMITS = Object.freeze({ pages: 100, textItems: 100_000, pageDimension: 14400 });
class CanvasFactory {
  create(width, height) {
    if (width * height > IMAGE_LIMITS.pixels || Math.max(width, height) > IMAGE_LIMITS.dimension) throw new ConversionError('PDF_LIMIT', 'A PDF render surface exceeds the image resource limit.');
    const canvas = new OffscreenCanvas(Math.ceil(width), Math.ceil(height));
    return { canvas, context: canvas.getContext('2d') };
  }
  reset(target, width, height) { const replacement = this.create(width, height); this.destroy(target); Object.assign(target, replacement); }
  destroy(target) { if (target.canvas) target.canvas.width = target.canvas.height = 1; target.canvas = target.context = null; }
}
class FilterFactory {
  addFilter() { return 'none'; } addHCMFilter() { return 'none'; } addAlphaFilter() { return 'none'; }
  addLuminosityFilter() { return 'none'; } addKnockoutFilter() { return 'none'; } destroy() {}
}
export function renderScale(width, height) {
  if (!Number.isFinite(width * height) || width <= 0 || height <= 0 || Math.max(width, height) > PDF_LIMITS.pageDimension) throw new ConversionError('PDF_LIMIT', 'PDF page dimensions exceed the supported resource limit.');
  return Math.min(2, IMAGE_LIMITS.renderDimension / Math.max(width, height), Math.sqrt(IMAGE_LIMITS.renderPixels / (width * height)));
}

export async function convert({ buffer }, context = {}) {
  context.report?.('Opening PDF');
  const pdfjs = await import('../../vendor/pdf/pdf.mjs');
  let port, worker, task, document, session;
  let resourceFailure;
  const priorLimitHandler = globalThis.__markitdownPdfLimit;
  const onResourceLimit = message => { resourceFailure = new ConversionError('PDF_LIMIT', `${message} An embedded PDF image exceeds 16 million pixels. Resize the source and retry.`); };
  if (typeof Worker === 'undefined') globalThis.__markitdownPdfLimit = onResourceLimit;
  const sections = [], warnings = ['PDF reading order is inferred from positions. Complex columns, tables, annotations, forms and images may lose content or layout.'];
  let outputBytes = 0, readablePages = 0, failures = 0;
  try {
    // Explicit local worker avoids PDF.js's blob-wrapper path for extension URLs.
    if (typeof Worker !== 'undefined') {
      port = new Worker(new URL('../../vendor/pdf/pdf.worker.mjs', import.meta.url), { type: 'module' });
      port.addEventListener('message', ({data}) => { if(data?.type==='markitdown-pdf-limit') onResourceLimit(data.message); });
      worker = new pdfjs.PDFWorker({ port });
    }
    const base = new URL('../../vendor/pdf/', import.meta.url).href;
    task = pdfjs.getDocument({ data: new Uint8Array(buffer), worker,
      cMapUrl: `${base}cmaps/`, cMapPacked: true, standardFontDataUrl: `${base}standard_fonts/`, wasmUrl: `${base}wasm/`,
      useWorkerFetch: typeof Worker !== 'undefined', isEvalSupported: false, enableXfa: false, disableFontFace: true, useSystemFonts: false,
      disableAutoFetch: true, disableStream: true, disableRange: true, isImageDecoderSupported: false,
      maxImageSize: IMAGE_LIMITS.pixels, canvasMaxAreaInBytes: IMAGE_LIMITS.renderPixels * 4,
      ...(typeof OffscreenCanvas !== 'undefined' ? { CanvasFactory, FilterFactory } : {}), verbosity: 0, stopAtErrors: true });
    document = await task.promise;
    if (document.numPages > PDF_LIMITS.pages) throw new ConversionError('PDF_LIMIT', `PDF has ${document.numPages} pages; the limit is ${PDF_LIMITS.pages}. Split it and retry.`);
    for (let number = 1; number <= document.numPages; number++) {
      let page, canvas, nativeText = '';
      context.report?.(`PDF page ${number} of ${document.numPages}: extracting text`);
      try {
        page = await document.getPage(number);
        const viewport = page.getViewport({ scale: 1 });
        renderScale(viewport.width, viewport.height);
        const content = await page.getTextContent();
        if (content.items.length > PDF_LIMITS.textItems) throw new ConversionError('PDF_LIMIT', `Page ${number} exceeds the 100,000 text-item limit.`);
        const layout = layoutText(content.items, viewport.width);
        nativeText = layout.text;
        warnings.push(...layout.warnings.map(warning => `Page ${number}: ${warning}`));
        let text = nativeText;
        if (context.options?.pdfForceOcr || !usableText(text)) {
          context.report?.(`PDF page ${number} of ${document.numPages}: rendering for OCR`);
          const scale = renderScale(viewport.width, viewport.height), rendered = page.getViewport({ scale });
          canvas = new OffscreenCanvas(Math.floor(rendered.width), Math.floor(rendered.height));
          await page.render({ canvasContext: canvas.getContext('2d'), viewport: rendered, background: 'rgb(255,255,255)', annotationMode: pdfjs.AnnotationMode.DISABLE }).promise;
          if(resourceFailure) throw resourceFailure;
          session ??= context.ocr || createOcrSession(context);
          const recognized = await session.recognize(canvas, { report: stage => context.report?.(`PDF page ${number} of ${document.numPages}: ${stage}`) });
          text = recognized.text;
          warnings.push(...recognized.warnings.map(warning => `Page ${number}: ${warning}`));
          if (scale < 2) warnings.push(`Page ${number}: render resolution was reduced to the 4-million-pixel / 2,400-pixel-side limit.`);
        }
        if (text.trim()) readablePages++;
        sections.push(`## Page ${number}\n\n${text.trim() ? cell(text).replaceAll('<br>', '\n') : '_No text recognized on this page._'}\n`);
      } catch (error) {
        if (/Image exceeded maximum allowed size/.test(error.message)) throw new ConversionError('PDF_LIMIT', `Page ${number}: an embedded image exceeds 16 million pixels. Split or resize the PDF and retry.`);
        if (['PDF_LIMIT', 'IMAGE_LIMIT', 'OUTPUT_TOO_LARGE', 'CANCELLED', 'MODEL_TIMEOUT'].includes(error.code) || ['AbortError', 'TimeoutError'].includes(error.name)) throw error;
        failures++;
        warnings.push(`Page ${number}: ${error.message}`);
        if (nativeText && !context.options?.pdfForceOcr) { readablePages++; sections.push(`## Page ${number}\n\n${cell(nativeText).replaceAll('<br>', '\n')}\n`); }
        else sections.push(`## Page ${number}\n\n_Page conversion failed; see warnings._\n`);
      } finally { if (canvas) canvas.width = canvas.height = 1; page?.cleanup(); }
      outputBytes += new TextEncoder().encode(sections.at(-1)).byteLength;
      if (outputBytes > LIMITS.maxOutputBytes) throw new ConversionError('OUTPUT_TOO_LARGE', 'PDF output exceeds 10 MiB.');
    }
    if (failures && !readablePages) throw new ConversionError('PDF_UNREADABLE', `No PDF pages could be read. ${warnings.find(w => w.startsWith('Page ')) || 'The document may be corrupt.'}`);
    if (failures) warnings.unshift(`Partial result: ${failures} page(s) had conversion failures.`);
    return { markdown: sections.join('\n'), warnings };
  } catch (error) {
    if (error instanceof ConversionError) throw error;
    if (error.name === 'PasswordException') throw new ConversionError('PDF_PASSWORD', 'Password-protected PDF is unsupported. Save an unprotected copy and retry.');
    throw new ConversionError('INVALID_PDF', `Cannot read PDF: ${error.message}`);
  } finally {
    if (session && !context.ocr) await session.close().catch(() => {});
    await task?.destroy().catch(() => {});
    worker?.destroy(); port?.terminate();
    if (typeof Worker === 'undefined') {
      if(priorLimitHandler)globalThis.__markitdownPdfLimit=priorLimitHandler;
      else delete globalThis.__markitdownPdfLimit;
    }
  }
}
