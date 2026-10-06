import { mkdir, writeFile } from 'node:fs/promises';
import { phase1Fixtures } from '../tests/helpers/documents.js';
import { phase2Fixtures } from '../tests/helpers/phase2-documents.js';

await mkdir('tests/fixtures/generated', { recursive: true });
for (const [name, buffer] of Object.entries(await phase1Fixtures())) await writeFile(`tests/fixtures/generated/${name}`, Buffer.from(buffer));
for (const [name, buffer] of Object.entries(await phase2Fixtures())) await writeFile(`tests/fixtures/generated/${name}`, Buffer.from(buffer));
console.log('Generated Phase 1 and Phase 2 document fixtures.');
