import { openArchive, readEntry, archiveBudget, safeArchivePath } from './archive.js';
import { parseXmlDocument } from './xml-document.js';
import { decodeText } from './text.js';
import { cell, markdownTable } from '../markdown.js';
import { ConversionError } from '../errors.js';
import { LIMITS } from '../limits.js';

const elements = (node, name) => Array.from(node.getElementsByTagNameNS('*', name));
const children = node => Array.from(node?.childNodes || []).filter(item => item.nodeType === 1);
const fail = message => { throw new ConversionError('INVALID_PPTX', message); };
const text = value => cell(value).replaceAll('<br>', '\n');

export function resolvePart(source, target) {
  if (!target || /^[a-z][a-z0-9+.-]*:|^\/|\\|[?#]/i.test(target)) fail('Unsafe or external presentation part.');
  let decoded;
  try { decoded = decodeURIComponent(target); } catch { fail('Invalid presentation relationship encoding.'); }
  if (/^[a-z][a-z0-9+.-]*:|^\/|\\|[?#]/i.test(decoded)) fail('Unsafe presentation part.');
  const parts = source.split('/').slice(0, -1);
  for (const part of decoded.split('/')) {
    if (part === '..') { if (!parts.length) fail('Relationship leaves the archive.'); parts.pop(); }
    else if (part && part !== '.') parts.push(part);
  }
  return safeArchivePath(parts.join('/'));
}

function paragraphs(node, raw = false) {
  return elements(node, 'p').map(paragraph => {
    const content = [];
    const walk = parent => {
      for (const child of children(parent)) {
        if (child.localName === 't') content.push(child.textContent);
        else if (child.localName === 'br') content.push('\n');
        else walk(child);
      }
    };
    walk(paragraph);
    const value = content.join('');
    if (raw || !value.trim()) return value;
    const properties = children(paragraph).find(item => item.localName === 'pPr');
    const bullet = properties && children(properties).some(item => ['buChar', 'buAutoNum'].includes(item.localName));
    const level = Math.min(8, Math.max(0, Number(properties?.getAttribute('lvl')) || 0));
    return `${bullet ? `${'  '.repeat(level)}- ` : ''}${text(value)}`;
  }).filter(value => value.trim()).join(raw ? '\n' : '\n\n');
}

function shapeText(root, warnings, notes = false) {
  const output = [];
  const walk = node => {
    for (const child of children(node)) {
      if (child.localName === 'sp') {
        const placeholder = elements(child, 'ph')[0]?.getAttribute('type');
        if (notes && ['sldImg', 'sldNum', 'dt', 'hdr', 'ftr'].includes(placeholder)) continue;
        const value = paragraphs(child);
        if (value) output.push(`${['title', 'ctrTitle'].includes(placeholder) && !notes ? '### ' : ''}${value}`);
      } else if (child.localName === 'tbl') {
        const rows = children(child).filter(item => item.localName === 'tr').map(row =>
          children(row).filter(item => item.localName === 'tc').map(column => paragraphs(column, true)));
        if (rows.length > 1000 || rows.some(row => row.length > 100)) throw new ConversionError('PPTX_LIMIT', 'Presentation table exceeds 1,000 rows or 100 columns.');
        if (elements(child, 'tc').some(column => ['rowSpan', 'gridSpan', 'hMerge', 'vMerge'].some(key => column.hasAttribute(key)))) warnings.push('Merged table cells are flattened.');
        if (rows.length) output.push(markdownTable(rows));
      } else if (['chart', 'relIds', 'oleObj', 'pic', 'videoFile', 'audioFile', 'cxnSp'].includes(child.localName)) {
        warnings.push(`Unsupported presentation content (${child.localName}) is omitted; embedded images are not recognized.`);
      } else walk(child);
    }
  };
  walk(root);
  return output.join('\n\n');
}

export async function convert({ buffer }, context = {}) {
  if (new Uint8Array(buffer).slice(0, 4).join(',') === '208,207,17,224') fail('Encrypted Office documents and legacy PPT are unsupported.');
  const { zip, budget } = await openArchive(buffer, archiveBudget(context));
  const readXml = async path => {
    const entry = zip.file(path);
    if (!entry) fail(`Missing presentation part: ${path}.`);
    return parseXmlDocument(decodeText(await readEntry(entry, budget)));
  };
  const relations = async source => {
    const parts = source.split('/'), name = parts.pop();
    const path = [...parts, '_rels', `${name}.rels`].join('/');
    const result = new Map();
    if (!zip.file(path)) return result;
    for (const rel of elements(await readXml(path), 'Relationship')) {
      const id = rel.getAttribute('Id');
      if (!id || result.has(id)) fail('Duplicate or missing relationship identifier.');
      result.set(id, { external: rel.getAttribute('TargetMode') === 'External', target: rel.getAttribute('Target'), type: rel.getAttribute('Type') });
    }
    return result;
  };
  const presentation = await readXml('ppt/presentation.xml');
  // PowerPoint sections also contain sldId elements, in the p14 namespace.
  // Only the direct presentation slide list establishes slides and their order.
  const root = presentation.documentElement;
  const slideList = children(root).find(node => node.localName === 'sldIdLst' && node.namespaceURI === root.namespaceURI);
  const order = children(slideList).filter(node => node.localName === 'sldId' && node.namespaceURI === root.namespaceURI);
  const rels = await relations('ppt/presentation.xml');
  if (!order.length) fail('Presentation contains no slides.');
  if (order.length > 200) throw new ConversionError('PPTX_LIMIT', 'Presentations are limited to 200 slides.');
  const sections = [], warnings = ['Slide text follows shape order. Master/layout text, inherited bullet styles, charts, SmartArt, animations and visual positioning may be omitted.'];
  let bytes = 0;
  for (const [index, slide] of order.entries()) {
    context.report?.(`Reading slide ${index + 1} of ${order.length}`);
    const id = slide.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') || slide.getAttribute('r:id');
    const rel = rels.get(id);
    if (!rel || rel.external || !rel.type?.endsWith('/slide')) fail(`Missing internal relationship for slide ${index + 1}.`);
    const path = resolvePart('ppt/presentation.xml', rel.target);
    const slideWarnings = [], document = await readXml(path);
    let body = shapeText(document.documentElement, slideWarnings);
    const slideRels = await relations(path);
    const notes = [...slideRels.values()].find(item => !item.external && item.type?.endsWith('/notesSlide'));
    if (notes) {
      const noteText = shapeText((await readXml(resolvePart(path, notes.target))).documentElement, slideWarnings, true);
      if (noteText) body += `\n\n### Speaker notes\n\n${noteText}`;
    }
    if (!body.trim()) slideWarnings.push('No supported text was found.');
    const section = `## Slide ${index + 1}\n\n${body || '_No supported text._'}\n`;
    bytes += new TextEncoder().encode(section).byteLength;
    if (bytes > LIMITS.maxOutputBytes) throw new ConversionError('OUTPUT_TOO_LARGE', 'Presentation output exceeds 10 MiB.');
    sections.push(section);
    warnings.push(...[...new Set(slideWarnings)].map(warning => `Slide ${index + 1}: ${warning}`));
  }
  return { markdown: sections.join('\n'), warnings };
}
