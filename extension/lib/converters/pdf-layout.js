// Conservative geometric layout. A wide shared gutter separates two columns;
// otherwise emit lines rather than inventing a table structure.
export function usableText(text) {
  const visible = String(text).replace(/\s/g, '');
  const letters = visible.match(/[\p{L}\p{N}]/gu)?.length || 0;
  return letters >= 3 && letters / Math.max(1, visible.length) >= 0.5 && !/\uFFFD/.test(visible);
}

export function layoutText(items, pageWidth = 600) {
  const tokens = items.filter(item => typeof item.str === 'string' && item.str.trim()).map(item => ({
    text: item.str, x: item.transform[4], y: item.transform[5], width: Math.abs(item.width || 0),
    height: Math.max(1, Math.abs(item.height || item.transform[3] || 12)), rtl: item.dir === 'rtl'
  }));
  const warnings = [];
  if (items.some(item => item.dir === 'ttb' || (item.transform && Math.abs(item.transform[1]) > Math.abs(item.transform[0])))) warnings.push('Rotated or vertical text may have imperfect reading order.');
  const mid = pageWidth / 2, gutter = pageWidth * 0.035;
  const left = tokens.filter(t => t.x + t.width < mid - gutter);
  const right = tokens.filter(t => t.x > mid + gutter);
  const crossing = tokens.filter(t => !left.includes(t) && !right.includes(t));
  const columns = left.length >= 2 && right.length >= 2 && crossing.length === 0;
  const rtl = tokens.filter(t => t.rtl).length > tokens.length / 2;
  const groups = columns ? (rtl ? [right, left] : [left, right]) : [tokens];
  const output = groups.map(group => {
    const lines = [];
    for (const token of group.sort((a, b) => b.y - a.y || a.x - b.x)) {
      let line = lines.find(line => Math.abs(line.y - token.y) <= Math.min(line.height, token.height) * 0.35);
      if (!line) { line = { y: token.y, height: token.height, tokens: [] }; lines.push(line); }
      line.tokens.push(token);
    }
    let previous;
    return lines.sort((a, b) => b.y - a.y).map(line => {
      const isRtl = line.tokens.filter(t => t.rtl).length > line.tokens.length / 2;
      line.tokens.sort((a, b) => isRtl ? b.x - a.x : a.x - b.x);
      const value = line.tokens.map((token, i) => {
        if (!i) return token.text;
        const prior = line.tokens[i - 1];
        const gap = isRtl ? prior.x - (token.x + token.width) : token.x - (prior.x + prior.width);
        return `${gap > token.height * 0.15 && !/\s$/.test(prior.text) && !/^\s/.test(token.text) ? ' ' : ''}${token.text}`;
      }).join('');
      const prefix = previous && previous.y - line.y > Math.max(previous.height, line.height) * 1.7 ? '\n' : '';
      previous = line;
      return prefix + value;
    }).join('\n');
  });
  if (columns) warnings.push('Two-column reading order was inferred from a clear central gutter.');
  return { text: output.join('\n\n'), warnings };
}
