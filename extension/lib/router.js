import { detectFormat } from './formats.js';
import { ConversionError } from './errors.js';
import { LIMITS } from './limits.js';

const loaders = {
  html: () => import('./converters/html.js'),
  xlsx: () => import('./converters/xlsx.js'),
  xls: () => import('./converters/xls.js'),
  csv: () => import('./converters/csv.js'),
  json: () => import('./converters/json.js'),
  xml: () => import('./converters/xml.js'),
  docx: () => import('./converters/docx.js'),
  epub: () => import('./converters/epub.js'),
  zip: () => import('./converters/zip.js'),
  exif: () => import('./converters/exif.js'),
  pdf: () => import('./converters/pdf.js'),
  pptx: () => import('./converters/pptx.js'),
  image: () => import('./converters/image.js')
};

export async function convertFile(input, context = {}) {
  const format = detectFormat(input, input.format || 'auto');
  const converter = await loaders[format.id]();
  const result = await converter.convert({ ...input, format: format.id }, context);
  if (typeof result?.markdown !== 'string') throw new ConversionError('INVALID_RESULT', 'Converter did not return Markdown.');
  if (new TextEncoder().encode(result.markdown).byteLength > LIMITS.maxOutputBytes) {
    throw new ConversionError('OUTPUT_TOO_LARGE', 'Converted Markdown exceeds the 10 MB output limit.');
  }
  return { markdown: result.markdown, warnings: result.warnings || [] };
}
