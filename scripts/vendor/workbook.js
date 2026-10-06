import { set_cptable } from 'xlsx';
import * as codepages from 'xlsx/dist/cpexcel.full.mjs';
set_cptable(codepages);
export { read, utils } from 'xlsx';
