import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import piexif from 'piexifjs';

export const utf8 = text => new TextEncoder().encode(text).buffer;
export const arrayBuffer = bytes => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
export async function zipFiles(files, options = {}) {
  const zip = new JSZip();
  for (const [name, value] of Object.entries(files)) zip.file(name, value, { createFolders: false });
  return zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE', ...options });
}

export function workbook(bookType = 'xlsx') {
  const book = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([['Item', 'Amount'], ['Tea', 12], ['قهوة', 24], ['Total', 36]]);
  sheet.B4.f = 'SUM(B2:B3)';
  XLSX.utils.book_append_sheet(book, sheet, 'Orders');
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['City', 'Country'], ['Riyadh', 'Saudi Arabia']]), 'Locations');
  return XLSX.write(book, { type: 'array', bookType });
}

export async function docx(body) {
  const w = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  return zipFiles({
    '[Content_Types].xml': '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    '_rels/.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    'word/document.xml': `<?xml version="1.0"?><w:document xmlns:w="${w}"><w:body>${body || '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Quarterly report</w:t></w:r></w:p><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Revenue increased.</w:t></w:r></w:p><w:p><w:r><w:t>مرحبا بالرياض</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Item</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Amount</w:t></w:r></w:p></w:tc></w:tr><w:tr><w:tc><w:p><w:r><w:t>Tea</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>12</w:t></w:r></w:p></w:tc></w:tr></w:tbl>'}</w:body></w:document>`,
    'word/styles.xml': `<w:styles xmlns:w="${w}"><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style></w:styles>`,
    'word/_rels/document.xml.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="styles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'
  });
}

export async function epub({ reverse = false, extra = {} } = {}) {
  return zipFiles({
    'mimetype': 'application/epub+zip',
    'META-INF/container.xml': '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
    'OEBPS/content.opf': `<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="bookid" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="bookid">fixture-book</dc:identifier><dc:title>Fixture book</dc:title><dc:language>en</dc:language></metadata><manifest><item id="first" href="first.xhtml" media-type="application/xhtml+xml"/><item id="second" href="second.xhtml" media-type="application/xhtml+xml"/></manifest><spine>${reverse ? '<itemref idref="second"/><itemref idref="first"/>' : '<itemref idref="first"/><itemref idref="second"/>'}</spine></package>`,
    'OEBPS/second.xhtml': '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Second</title></head><body><h1>Second chapter</h1><p>Finish here.</p></body></html>',
    'OEBPS/first.xhtml': '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>First</title></head><body><h1>First chapter</h1><p>Start here. مرحبا</p></body></html>',
    ...extra
  });
}

export function jpeg(withExif = true) {
  // Small valid JPEG fixture; EXIF tags are inserted without changing pixels.
  const bytes = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAABQb/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAB//2Q==', 'base64');
  if (!withExif) return arrayBuffer(bytes);
  const exif = piexif.dump({ '0th': { [piexif.ImageIFD.Make]: 'Fixture Camera', [piexif.ImageIFD.Model]: 'Model 1' }, Exif: { [piexif.ExifIFD.DateTimeOriginal]: '2026:10:04 10:00:00' }, GPS: { [piexif.GPSIFD.GPSLatitudeRef]: 'N', [piexif.GPSIFD.GPSLatitude]: [[24, 1], [42, 1], [0, 1]] } });
  return arrayBuffer(Buffer.from(piexif.insert(exif, bytes.toString('binary')), 'binary'));
}

export async function phase1Fixtures() {
  return {
    'page.html': utf8('<!doctype html><html><head><title>Example</title></head><body><h1>Project notes</h1><p>Hello <strong>world</strong>.</p><table><tr><th>Name</th><th>Value</th></tr><tr><td>Tea</td><td>12</td></tr></table></body></html>'),
    'workbook.xlsx': workbook('xlsx'),
    'legacy.xls': workbook('biff8'),
    'report.docx': await docx(),
    'book.epub': await epub(),
    'collection.zip': await zipFiles({ 'items.csv': 'name,amount\nTea,12', 'data.json': '{"ok":true}', 'unsupported.pdf': 'not a PDF' }),
    'camera.jpg': jpeg()
  };
}
