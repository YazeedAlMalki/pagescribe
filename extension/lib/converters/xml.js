import { decodeText } from './text.js';
import { fenced } from '../markdown.js';

export async function convert({ buffer }, context = {}) {
  context.report?.('Preserving XML source');
  // Lossless source representation: native workers do not have DOMParser.
  // No DTD/entity evaluation or network access. Add document-side validation
  // later if semantic extraction is required; this does not validate XML.
  return { markdown: fenced(decodeText(buffer), 'xml'), warnings: ['XML is preserved as source; syntax is not validated.'] };
}
