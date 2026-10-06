import { PDFDocument, StandardFonts, PDFName } from 'pdf-lib';
import { createCanvas } from '@napi-rs/canvas';
import { createHash } from 'node:crypto';
import { zipFiles } from './documents.js';

const p = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const a = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const r = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const relationships = body => `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${body}</Relationships>`;
const rel = (id, type, target, extra = '') => `<Relationship Id="${id}" Type="${r}/${type}" Target="${target}" ${extra}/>`;
const paragraph = (text, bullet = false) => `<a:p>${bullet ? '<a:pPr lvl="1"><a:buChar char="•"/></a:pPr>' : ''}<a:r><a:t>${text}</a:t></a:r></a:p>`;
const shape = (text, type = 'body', bullet = false) => `<p:sp><p:nvSpPr><p:nvPr><p:ph type="${type}"/></p:nvPr></p:nvSpPr><p:txBody>${paragraph(text, bullet)}</p:txBody></p:sp>`;
const slide = body => `<p:sld xmlns:p="${p}" xmlns:a="${a}" xmlns:r="${r}"><p:cSld><p:spTree>${body}</p:spTree></p:cSld></p:sld>`;

export async function pptx(extra = {}) {
  return zipFiles({
    '[Content_Types].xml': '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>',
    '_rels/.rels': relationships(rel('doc', 'officeDocument', 'ppt/presentation.xml')),
    'ppt/presentation.xml': `<p:presentation xmlns:p="${p}" xmlns:r="${r}"><p:sldIdLst><p:sldId id="256" r:id="first"/><p:sldId id="257" r:id="second"/></p:sldIdLst></p:presentation>`,
    'ppt/_rels/presentation.xml.rels': relationships(rel('first', 'slide', 'slides/slide9.xml') + rel('second', 'slide', 'slides/slide2.xml') + rel('external', 'image', 'https://example.invalid/tracker', 'TargetMode="External"')),
    'ppt/slides/slide2.xml': slide(shape('Second in presentation', 'title')),
    'ppt/slides/slide9.xml': slide(shape('First in presentation', 'title') + shape('Bullet item', 'body', true) + `<p:grpSp>${shape('Grouped مرحبا')}</p:grpSp><p:graphicFrame><a:graphic><a:graphicData><a:tbl>${[['Item', 'Value'], ['Tea', '12']].map(row => `<a:tr>${row.map(value => `<a:tc><a:txBody>${paragraph(value)}</a:txBody></a:tc>`).join('')}</a:tr>`).join('')}</a:tbl></a:graphicData></a:graphic></p:graphicFrame><p:graphicFrame><a:graphic><a:graphicData><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"/></a:graphicData></a:graphic></p:graphicFrame>`),
    'ppt/slides/_rels/slide9.xml.rels': relationships(rel('notes', 'notesSlide', '../notesSlides/notesSlide7.xml')),
    'ppt/notesSlides/notesSlide7.xml': `<p:notes xmlns:p="${p}" xmlns:a="${a}"><p:cSld><p:spTree>${shape('Present these findings.')}${shape('123', 'sldNum')}${shape('Footer boilerplate', 'ftr')}</p:spTree></p:cSld></p:notes>`,
    ...extra
  });
}

export function imageFixture({ text = 'Local document conversion 2026', arabic = false, rotate = 0, blank = false, format = 'png' } = {}) {
  const canvas = createCanvas(1200, 240), ctx = canvas.getContext('2d');
  ctx.fillStyle = 'white'; ctx.fillRect(0, 0, 1200, 240); ctx.fillStyle = 'black'; ctx.font = '54px Arial';
  ctx.direction = arabic ? 'rtl' : 'ltr'; ctx.textAlign = arabic ? 'right' : 'left';
  if (!blank) ctx.fillText(text, arabic ? 1150 : 40, 130);
  if (!rotate) return canvas.toBuffer(format === 'jpg' ? 'image/jpeg' : 'image/png');
  const rotated = createCanvas(rotate % 180 ? 240 : 1200, rotate % 180 ? 1200 : 240), out = rotated.getContext('2d');
  out.translate(rotated.width / 2, rotated.height / 2); out.rotate(rotate * Math.PI / 180); out.drawImage(canvas, -600, -120);
  return rotated.toBuffer('image/png');
}

export async function pdf({ pages = ['native', 'native'], columns = false } = {}) {
  const document = await PDFDocument.create(), font = await document.embedFont(StandardFonts.Helvetica);
  for (const [index, type] of pages.entries()) {
    const page = document.addPage([600, 800]);
    if (type === 'native' || type === 'layer') page.drawText(`Searchable page ${index + 1}`, { x: 40, y: 720, size: 18, font });
    if (type === 'scan' || type === 'layer') {
      const image = await document.embedPng(imageFixture());
      page.drawImage(image, { x: 30, y: 400, width: 540, height: 108 });
    }
    if (columns) {
      page.drawText('Left first\nLeft second', { x: 40, y: 620, size: 16, lineHeight: 25, font });
      page.drawText('Right first\nRight second', { x: 350, y: 620, size: 16, lineHeight: 25, font });
    }
  }
  document.setCreationDate(new Date('2026-10-04T00:00:00Z'));
  document.setModificationDate(new Date('2026-10-04T00:00:00Z'));
  return document.save();
}

// Independent minimal PDF 1.4 writer with standard revision-2 encryption.
export function protectedPdf() {
  const padding = Buffer.from('28bf4e5e4e758a4164004e56fffa01082e2e00b6d0683e802f0ca9fe6453697a', 'hex');
  const pad = password => Buffer.concat([Buffer.from(password), padding]).subarray(0, 32);
  const md5 = bytes => createHash('md5').update(bytes).digest();
  const rc4 = (key, input) => {
    const s = Array.from({ length: 256 }, (_, i) => i); let j = 0;
    for (let i = 0; i < 256; i++) { j = (j + s[i] + key[i % key.length]) & 255; [s[i], s[j]] = [s[j], s[i]]; }
    let i = 0; j = 0;
    return Buffer.from(input.map(value => { i = (i + 1) & 255; j = (j + s[i]) & 255; [s[i], s[j]] = [s[j], s[i]]; return value ^ s[(s[i] + s[j]) & 255]; }));
  };
  const id = md5(Buffer.from('MarkItDown protected fixture')), owner = rc4(md5(pad('owner')).subarray(0, 5), pad('secret'));
  const permissions = Buffer.alloc(4); permissions.writeInt32LE(-4);
  const key = md5(Buffer.concat([pad('secret'), owner, permissions, id])).subarray(0, 5), user = rc4(key, padding);
  const content = rc4(md5(Buffer.concat([key, Buffer.from([4, 0, 0, 0, 0])])).subarray(0, 10), Buffer.from('BT /F1 18 Tf 40 700 Td (Protected text) Tj ET'));
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    Buffer.concat([Buffer.from(`<< /Length ${content.length} >>\nstream\n`), content, Buffer.from('\nendstream')]),
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Filter /Standard /V 1 /R 2 /Length 40 /O <${owner.toString('hex')}> /U <${user.toString('hex')}> /P -4 >>`
  ];
  const parts = [Buffer.from('%PDF-1.4\n')], offsets = [0];
  for (const [index, object] of objects.entries()) { offsets.push(Buffer.concat(parts).length); parts.push(Buffer.from(`${index + 1} 0 obj\n`), Buffer.from(object), Buffer.from('\nendobj\n')); }
  const start = Buffer.concat(parts).length;
  parts.push(Buffer.from(`xref\n0 7\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 7 /Root 1 0 R /Encrypt 6 0 R /ID [<${id.toString('hex')}> <${id.toString('hex')}>] >>\nstartxref\n${start}\n%%EOF`));
  return Buffer.concat(parts);
}

export async function phase2Fixtures() {
  const presentation = await pptx(), native = await pdf();
  return {
    'slides.pptx': presentation, 'native.pdf': native, 'columns.pdf': await pdf({ pages: ['blank'], columns: true }),
    'mixed.pdf': await pdf({ pages: ['native', 'scan', 'blank'] }), 'scan.pdf': await pdf({ pages: ['scan'] }),
    'text-layer.pdf': await pdf({ pages: ['layer'] }), 'protected.pdf': protectedPdf(), 'corrupt.pdf': Buffer.from('%PDF-broken'),
    'english.png': imageFixture(), 'english.jpg': imageFixture({ format: 'jpg' }), 'arabic.png': imageFixture({ text: 'مرحبا بكم في الرياض', arabic: true }),
    'rotated.png': imageFixture({ rotate: 90 }), 'blank.png': imageFixture({ blank: true }),
    'phase2.zip': await zipFiles({ 'native.pdf': native, 'slides.pptx': presentation, 'english.png': imageFixture() })
  };
}

export async function oversizedPdfImage() {
  const document=await PDFDocument.create(),page=document.addPage([600,800]);
  const image=await document.embedPng(imageFixture());
  page.drawImage(image,{x:0,y:0,width:600,height:800});
  await image.embed();
  const object=document.context.lookup(image.ref);
  object.dict.set(PDFName.of('Width'),document.context.obj(5000));
  object.dict.set(PDFName.of('Height'),document.context.obj(5000));
  return document.save();
}
