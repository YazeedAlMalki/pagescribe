import { ConversionError } from './errors.js';

// EXIF remains explicit; automatic JPG/PNG routing uses local OCR.
export const FORMATS = [
  { id: 'html', label: 'HTML', extensions: ['html', 'htm'], mimes: ['text/html'], library: 'turndown', status: 'ready', context: 'worker' },
  { id: 'xlsx', label: 'Excel (XLSX)', extensions: ['xlsx'], mimes: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'], library: 'SheetJS', status: 'ready', context: 'worker' },
  { id: 'xls', label: 'Excel (legacy XLS)', extensions: ['xls'], mimes: ['application/vnd.ms-excel'], library: 'SheetJS', status: 'ready', context: 'worker' },
  { id: 'csv', label: 'CSV', extensions: ['csv'], mimes: ['text/csv'], library: 'native', status: 'ready', context: 'worker' },
  { id: 'json', label: 'JSON', extensions: ['json'], mimes: ['application/json'], library: 'native', status: 'ready', context: 'worker' },
  { id: 'xml', label: 'XML', extensions: ['xml'], mimes: ['application/xml', 'text/xml'], library: 'native', status: 'ready', context: 'worker' },
  { id: 'docx', label: 'Word (DOCX)', extensions: ['docx'], mimes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'], library: 'mammoth.js', status: 'ready', context: 'worker' },
  { id: 'epub', label: 'EPUB', extensions: ['epub'], mimes: ['application/epub+zip'], library: 'epub.js', status: 'ready', context: 'worker' },
  { id: 'zip', label: 'ZIP archive', extensions: ['zip'], mimes: ['application/zip', 'application/x-zip-compressed'], library: 'jszip', status: 'ready', context: 'worker' },
  { id: 'pdf', label: 'PDF (text / scanned)', extensions: ['pdf'], mimes: ['application/pdf'], library: 'PDF.js', status: 'ready', context: 'worker' },
  { id: 'pptx', label: 'PowerPoint (PPTX)', extensions: ['pptx'], mimes: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'], library: 'bounded ZIP/XML', status: 'ready', context: 'worker' },
  { id: 'image', label: 'Image OCR (JPG / PNG)', extensions: ['jpg', 'jpeg', 'png'], mimes: ['image/jpeg', 'image/png'], library: 'PaddleOCR', status: 'ready', context: 'worker' },
  { id: 'exif', label: 'JPEG EXIF metadata', extensions: [], mimes: [], library: 'piexifjs', status: 'ready', context: 'worker' }
];

export const ACCEPT = FORMATS.flatMap(format => format.extensions.map(ext => `.${ext}`)).join(',');

export function detectFormat(file, override = 'auto') {
  if (override !== 'auto') {
    const match = FORMATS.find(format => format.id === override);
    if (!match) throw new ConversionError('UNSUPPORTED_FORMAT', 'Choose a supported file type.');
    return match;
  }
  // Prefer the extension: Office/EPUB files are often incorrectly labelled as ZIP.
  const extension = String(file.name).split('.').pop().toLowerCase();
  let match = FORMATS.find(format => format.extensions.includes(extension));
  if (!match && !String(file.name).includes('.')) {
    match = FORMATS.find(format => format.mimes.includes(file.type));
  }
  if (!match) {
    throw new ConversionError('UNSUPPORTED_FORMAT', `Unsupported file: ${file.name}. Legacy PPT, audio/video and PNG metadata are unsupported.`);
  }
  return match;
}
