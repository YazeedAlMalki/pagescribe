import { convert as convertWorkbook } from './xlsx.js';

export async function convert(input, context) {
  return convertWorkbook({ ...input, format: 'xls' }, context);
}
