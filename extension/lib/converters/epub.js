import { Packaging } from '../../vendor/epub.js';
import { openArchive, readEntry, archiveBudget, safeArchivePath } from './archive.js';
import { decodeText } from './text.js';
import { parseXmlDocument } from './xml-document.js';
import { htmlToMarkdown } from './html.js';
import { cell } from '../markdown.js';
import { LIMITS } from '../limits.js';
import { ConversionError } from '../errors.js';

function resolveEntry(packagePath, href) {
  if (/^[a-z][a-z0-9+.-]*:|^\/|\\/i.test(href)) throw new ConversionError('INVALID_EPUB', 'External EPUB chapter URLs are unsupported.');
  const path = packagePath.split('/').slice(0, -1);
  for (const part of decodeURIComponent(href.split('#')[0].split('?')[0]).split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') { if (!path.length) throw new ConversionError('INVALID_EPUB', 'Chapter path leaves the archive.'); path.pop(); }
    else path.push(part);
  }
  return safeArchivePath(path.join('/'));
}

export async function convert({ buffer }, context = {}) {
  context.report?.('Reading EPUB chapter order');
  const { zip, budget } = await openArchive(buffer, archiveBudget(context));
  const warnings = [];
  if (zip.file('META-INF/encryption.xml')) {
    const encryption = parseXmlDocument(decodeText(await readEntry(zip.file('META-INF/encryption.xml'), budget)));
    const records = Array.from(encryption.getElementsByTagNameNS('*', 'EncryptedData'));
    const fontAlgorithms = ['http://www.idpf.org/2008/embedding', 'http://ns.adobe.com/pdf/enc#RC'];
    if (!records.length || records.some(record => {
      const algorithm = record.getElementsByTagNameNS('*', 'EncryptionMethod')[0]?.getAttribute('Algorithm');
      const resource = record.getElementsByTagNameNS('*', 'CipherReference')[0]?.getAttribute('URI') || '';
      return !fontAlgorithms.includes(algorithm) || !/\.(otf|ttf|woff2?)$/i.test(resource);
    })) throw new ConversionError('ENCRYPTED_EPUB', 'Encrypted EPUB content is unsupported.');
    warnings.push('Obfuscated font assets are omitted; chapter text is unaffected.');
  }
  let packaging;
  try {
    const container = parseXmlDocument(decodeText(await readEntry(zip.file('META-INF/container.xml'), budget)));
    const rootfile = container.getElementsByTagNameNS('*', 'rootfile')[0];
    const packagePath = safeArchivePath(rootfile?.getAttribute('full-path'));
    const packageDocument = parseXmlDocument(decodeText(await readEntry(zip.file(packagePath), budget)));
    // Use epub.js's packaging parser only; its renderer/network loader is never
    // instantiated. XML and chapter HTML both use worker-compatible DOMs.
    for (const item of Array.from(packageDocument.getElementsByTagName('item'))) {
      if (['__proto__', 'constructor', 'prototype'].includes(item.getAttribute('id'))) throw new Error('Invalid manifest identifier.');
    }
    packaging = new Packaging(packageDocument);
    if (!packaging.spine.length || packaging.spine.length > 500) throw new Error('EPUB must contain between 1 and 500 spine entries.');
    const sections = [`# ${cell(packaging.metadata.title || 'E-book').replace(/<br>/g, ' ')}\n`];
    let outputBytes = 0;
    for (const [index, chapter] of packaging.spine.entries()) {
      const item = packaging.manifest[chapter.idref];
      if (!item) throw new Error(`Missing spine item: ${chapter.idref}`);
      if (!['application/xhtml+xml', 'text/html'].includes(item.type)) { warnings.push(`Skipped non-HTML spine item ${chapter.idref}.`); continue; }
      context.report?.(`Converting chapter ${index + 1} of ${packaging.spine.length}`);
      const path = resolveEntry(packagePath, item.href);
      const html = decodeText(await readEntry(zip.file(path), budget));
      const converted = htmlToMarkdown(html);
      outputBytes += new TextEncoder().encode(converted.markdown).byteLength;
      if (outputBytes > LIMITS.maxOutputBytes) throw new ConversionError('OUTPUT_TOO_LARGE', 'EPUB output exceeds 10 MiB.');
      sections.push(`## Chapter ${index + 1}\n\n${converted.markdown}`);
      warnings.push(...converted.warnings);
    }
    return { markdown: sections.join('\n'), warnings: [...new Set(warnings)] };
  } catch (error) {
    if (error instanceof ConversionError) throw error;
    throw new ConversionError('INVALID_EPUB', `Cannot read EPUB: ${error.message}`);
  } finally { packaging?.destroy(); }
}
