import {readFile,writeFile} from 'node:fs/promises';
const normalize=s=>[...s.normalize('NFKC').replace(/\s+/gu,' ').trim()];
function distance(a,b){let row=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){const next=[i];for(let j=1;j<=b.length;j++)next[j]=Math.min(next[j-1]+1,row[j]+1,row[j-1]+Number(a[i-1]!==b[j-1]));row=next;}return row[b.length];}
const root='tests/evidence/2026-10-05';
const recovered=await readFile(`${root}/recovered-real-12.md`,'utf8');
const page=n=>recovered.split(`## Page ${n}\n`)[1].split(/\n## Page \d+\n/)[0].trim();
const pairs=[
  {name:'Chapter 1, independently scanned illustrated opening',expected:await readFile(`${root}/chapter-1.expected.txt`,'utf8'),observed:page(1),input:'tests/fixtures/independent/gutenberg/chapter-openings-12.pdf, page 1'},
  {name:'Chapter 3, assembled PDF rendering',expected:await readFile('tests/evidence/2026-10-04/c03-29.expected.txt','utf8'),observed:page(3),input:'tests/fixtures/independent/gutenberg/chapter-openings-12.pdf, page 3'},
  {name:'Chapter 3, original OCRmyPDF fixture',expected:await readFile('tests/evidence/2026-10-04/c03-29.expected.txt','utf8'),observed:(await readFile(`${root}/c03-29.pdf.observed.md`,'utf8')).replace(/^## Page 1\s*/,''),input:'tests/fixtures/independent/ocrmypdf/c03-29.pdf'}
];
const records=pairs.map(p=>{const a=normalize(p.expected),b=normalize(p.observed),edits=distance(a,b);return {...p,expectedCharacters:a.length,observedCharacters:b.length,edits,cer:edits/a.length,cerPercent:100*edits/a.length};});
await writeFile(`${root}/ocr-accuracy.json`,JSON.stringify({date:new Date().toISOString(),normalization:'NFKC, collapse whitespace, trim, Unicode code points including spaces. Case and punctuation retained. Only generated page headings excluded; output not corrected.',transcription:'Full visual transcription of chapter 1; prior visually transcribed chapter 3 reference. Captions placed after narrative; reading-order differences count. Printed hyphens retained. Chapter 1 decorative heading transcribed as intended words. Two unique English pages, not a broad accuracy guarantee.',acceptance:'Highest accuracy requested. Not accepted for verbatim transcription: omissions, spurious illustration text, incorrect chapter numerals and reading-order errors remain.',records},null,2));
console.log(records.map(({name,edits,cerPercent})=>({name,edits,cerPercent})));
