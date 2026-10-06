import { decodeText } from './text.js';
import { fenced } from '../markdown.js';
import { ConversionError } from '../errors.js';

export async function convert({ buffer }, context = {}) {
  context.report?.('Parsing JSON');
  try {
    const data = JSON.parse(decodeText(buffer));
    return { markdown: fenced(JSON.stringify(data, null, 2), 'json'), warnings: [] };
  } catch (error) {
    if (error instanceof ConversionError) throw error;
    throw new ConversionError('INVALID_JSON', `Invalid JSON: ${error.message}`);
  }
}
