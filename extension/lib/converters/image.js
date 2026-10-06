import { decodeImage } from '../ocr/image.js';
import { createOcrSession } from '../ocr/service.js';
import { cell } from '../markdown.js';

export async function convert({ buffer }, context = {}) {
  context.report?.('Decoding and normalizing image');
  const { canvas, warnings } = await decodeImage(buffer, context.options?.ocrRotation || 0);
  const session = context.ocr || createOcrSession(context);
  try {
    const result = await session.recognize(canvas);
    return { markdown: result.text ? `${cell(result.text).replaceAll('<br>', '\n')}\n` : '_No text recognized._\n', warnings: [...warnings, ...result.warnings] };
  } finally { canvas.width = canvas.height = 1; if (!context.ocr) await session.close(); }
}
