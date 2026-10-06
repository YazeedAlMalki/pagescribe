import mammoth from '../../vendor/word.js';
import { openArchive, readEntry, archiveBudget } from './archive.js';
import { decodeText } from './text.js';
import { parseXmlDocument } from './xml-document.js';
import { htmlToMarkdown } from './html.js';
import { ConversionError } from '../errors.js';

export async function convert({ buffer }, context = {}) {
  context.report?.('Reading Word document');
  const { zip, budget } = await openArchive(buffer, archiveBudget(context));
  if (!zip.file('word/document.xml')) throw new ConversionError('INVALID_DOCX', 'The archive does not contain a Word document.');
  // Verify XML parts with bounded inflation before Mammoth reads the container.
  for (const entry of Object.values(zip.files)) {
    if (!entry.dir && /\.(xml|rels)$/i.test(entry.name)) parseXmlDocument(decodeText(await readEntry(entry, budget)));
  }
  try {
    const result = await mammoth.convertToHtml({ arrayBuffer: buffer }, {
      externalFileAccess: false,
      convertImage: mammoth.images.imgElement(async () => ({ src: '' }))
    });
    const output = htmlToMarkdown(result.value);
    output.warnings.push(...result.messages.map(message => message.message));
    return { ...output, warnings: [...new Set(output.warnings)] };
  } catch (error) {
    if (error instanceof ConversionError) throw error;
    throw new ConversionError('INVALID_DOCX', `Cannot read Word document: ${error.message}`);
  }
}
