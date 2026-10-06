import { TurndownService, DOMParser } from '../../vendor/html.js';
import { decodeText } from './text.js';
import { markdownTable, cell, fenced } from '../markdown.js';
import { ConversionError } from '../errors.js';

function safeLink(href) {
  const clean = href.replace(/[\x00-\x20\x7f]/g, '');
  try {
    const parsed = new URL(clean, 'https://local.invalid/');
    if (!['http:', 'https:', 'mailto:'].includes(parsed.protocol)) return '';
    return clean.replace(/[<>()[\]\\]/g, character => `%${character.charCodeAt(0).toString(16)}`);
  } catch { return ''; }
}

export function htmlToMarkdown(html) {
  // LinkeDOM is an inert DOM: no scripts, resource loading or live-page access.
  const document = new DOMParser().parseFromString(`<html><head></head><body>${html}</body></html>`, 'text/html');
  const root = document.body;
  let count = 0;
  const stack = [[root, 0]];
  while (stack.length) {
    const [node, depth] = stack.pop();
    if (++count > 100_000 || depth > 128) throw new ConversionError('HTML_LIMIT', 'HTML exceeds the 100,000-node or 128-level nesting limit.');
    for (const child of node.childNodes) stack.push([child, depth + 1]);
  }
  const warnings = [];
  for (const node of root.querySelectorAll('head,script,style,iframe,object,embed,template,noscript,meta,link,svg,canvas,input,button,select,textarea')) node.remove();
  for (const node of root.querySelectorAll('*')) {
    for (const attribute of [...node.attributes]) {
      if (/^on/i.test(attribute.name) || ['style', 'src', 'srcset', 'action', 'formaction'].includes(attribute.name)) node.removeAttribute(attribute.name);
    }
    if (node.hasAttribute('href')) {
      const href = safeLink(node.getAttribute('href'));
      if (href) node.setAttribute('href', href); else node.removeAttribute('href');
    }
  }
  const service = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-', emDelimiter: '*' });
  service.addRule('safeCode', { filter: 'pre', replacement: (_content, node) => `\n\n${fenced(node.textContent.replace(/\n$/, ''))}\n` });
  service.addRule('tables', {
    filter: 'table',
    replacement: (_content, node) => {
      const rows = [...node.querySelectorAll('tr')].filter(row => row.closest('table') === node)
        .map(row => [...row.children].filter(child => ['TD', 'TH'].includes(child.nodeName)).map(child => child.textContent.trim()));
      if (node.querySelector('[colspan],[rowspan]')) warnings.push('Merged table cells are flattened; spanning cells are not duplicated.');
      return `\n\n${markdownTable(rows)}\n`;
    }
  });
  service.addRule('imagesAsText', { filter: 'img', replacement: (_content, node) => {
    warnings.push('Images are represented by alt text; embedded-image extraction and OCR are not supported.');
    return `[Image: ${cell(node.getAttribute('alt') || 'Embedded image')}]`;
  } });
  service.addRule('strikethrough', { filter: ['del', 's', 'strike'], replacement: content => `~~${content}~~` });
  return { markdown: service.turndown(root).trim() + '\n', warnings: [...new Set(warnings)] };
}

export async function convert({ buffer }, context = {}) {
  context.report?.('Converting HTML');
  return htmlToMarkdown(decodeText(buffer));
}
