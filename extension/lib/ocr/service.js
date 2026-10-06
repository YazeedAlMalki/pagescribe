import { prepareModels } from './model-cache.js';
import { isBlank } from './image.js';
import { ConversionError } from '../errors.js';

// The pinned Paddle v5 Arabic recognizer emits visual-order characters.
// Restore logical Unicode order, preserving LTR number/Latin runs.
export function logicalArabic(text) {
  const segmenter = new Intl.Segmenter('ar', { granularity: 'grapheme' });
  return text.split('\n').map(line => {
    if (!/\p{Script=Arabic}/u.test(line)) return line;
    return Array.from(segmenter.segment(line), item => item.segment).reverse().join('')
      .replace(/[A-Za-z0-9٠-٩][A-Za-z0-9٠-٩ .,:%+/@_-]*/g, run => Array.from(run).reverse().join(''));
  }).join('\n');
}

// One service belongs to one conversion worker, including its nested ZIP jobs.
export function createOcrSession(context = {}) {
  let service, initialization, report = context.report;
  const options = context.options || {};
  async function initialize() {
    context.phase?.('model-start');
    try {
      report?.('Preparing OCR models');
      const model = await prepareModels(options.ocrLanguage || 'en', { hours: options.modelCacheHours || 24, signal: context.signal, report: stage => report?.(stage) });
      const { PaddleOcrService, configureRuntime } = await import('../../vendor/ocr.js');
      configureRuntime(new URL('../../vendor/ort/', import.meta.url).href);
      service = new PaddleOcrService({ model, processing: { engine: 'canvas-native' }, session: { executionProviders: ['wasm'], graphOptimizationLevel: 'all' }, recognition: { minimumConfidence: 0, recBatchSize: 1, strategy: 'per-line', spaceRecovery: false }, detection: { maxSideLength: 1920 } });
      report?.('Initializing local OCR runtime');
      await service.initialize();
      return service;
    } catch (error) {
      await service?.destroy().catch(() => {}); service = undefined; initialization = undefined;
      if (error.name === 'TimeoutError') throw new ConversionError('MODEL_TIMEOUT', 'OCR model preparation exceeded 60 seconds. Check the connection and retry.');
      throw error;
    } finally { context.phase?.('model-end'); }
  }
  return {
    async recognize(canvas, progress = {}) {
      report = progress.report || context.report;
      context.signal?.throwIfAborted();
      if (isBlank(canvas)) return { text: '', warnings: ['Blank image/page: no visible text to recognize.'] };
      const engine = await (initialization ??= initialize());
      report?.('Recognizing text locally');
      const result = await engine.recognize(canvas, { noCache: true, minimumConfidence: 0 });
      context.signal?.throwIfAborted();
      const raw = String(result.text || '').trim();
      const text = options.ocrLanguage === 'ar' ? logicalArabic(raw) : raw;
      const warnings = [];
      if (!text) warnings.push('No text was recognized. The image may be unreadable, rotated, or in a different language. Check language/rotation in Settings and retry.');
      if (text && Number.isFinite(result.confidence) && result.confidence < 0.8) warnings.push(`Low-confidence OCR (engine score ${result.confidence.toFixed(2)}). This score is not a measured accuracy percentage; review the text.`);
      return { text, warnings };
    },
    async close() { await service?.destroy(); service = undefined; initialization = undefined; }
  };
}
