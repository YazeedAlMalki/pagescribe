import { DOMParser } from '../../vendor/epub.js';
import { ConversionError } from '../errors.js';

export function rejectEntities(source) {
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(source)) throw new ConversionError('UNSAFE_XML', 'Document type and entity declarations are unsupported.');
}

export function parseXmlDocument(source) {
  rejectEntities(source);
  try {
    const document = new DOMParser({ onError: (_level, message) => { throw new Error(message); } }).parseFromString(source, 'application/xml');
    if (!document.documentElement) throw new Error('Missing root element.');
    let count = 0;
    const stack = [[document.documentElement, 0]];
    while (stack.length) {
      const [node, depth] = stack.pop();
      if (++count > 100_000 || depth > 128) throw new Error('XML exceeds the node or nesting limit.');
      for (let child = node.firstChild; child; child = child.nextSibling) stack.push([child, depth + 1]);
    }
    return document;
  } catch (error) { throw new ConversionError('INVALID_XML', `Cannot parse document XML: ${error.message}`); }
}
