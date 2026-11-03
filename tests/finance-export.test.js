const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
function exportsApi() {
  const window = { AGIR: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../assets/js/core/finance-export.js'), 'utf8'), { window, Blob, TextEncoder, URL, setTimeout });
  return window.AGIR.financeExport;
}
async function unzipStored(blob) {
  const data = Buffer.from(await blob.arrayBuffer());
  const files = {}; let offset = 0;
  while (data.readUInt32LE(offset) === 0x04034b50) {
    assert.equal(data.readUInt16LE(offset + 8), 0, 'test reader expects stored ZIP entries');
    const size = data.readUInt32LE(offset + 18), nameLength = data.readUInt16LE(offset + 26), extraLength = data.readUInt16LE(offset + 28);
    const name = data.subarray(offset + 30, offset + 30 + nameLength).toString('utf8');
    const start = offset + 30 + nameLength + extraLength;
    files[name] = data.subarray(start, start + size).toString('utf8'); offset = start + size;
  }
  assert.equal(data.readUInt32LE(offset), 0x02014b50, 'valid central directory follows files');
  assert.equal(data.readUInt32LE(data.length - 22), 0x06054b50, 'valid ZIP end record');
  return files;
}
test('Excel export is an Office workbook with numeric cents converted by caller, dates, and inert text', async () => {
  const api = exportsApi();
  const files = await unzipStored(api.workbook([
    { key: 'descricao', label: 'Descrição' }, { key: 'valor', label: 'Valor', type: 'money' }, { key: 'data', label: 'Vencimento', type: 'date' },
  ], [
    { descricao: '=HYPERLINK("https://invalid.test")', valor: -123.45, data: '2026-10-28' },
    { descricao: 'A < B & C', valor: 0.01, data: '2026-11-01' },
  ]));
  assert.match(files['[Content_Types].xml'], /spreadsheetml.sheet.main\+xml/);
  assert.match(files['xl/_rels/workbook.xml.rels'], /Target="worksheets\/sheet1.xml"/);
  const sheet = files['xl/worksheets/sheet1.xml'];
  assert.match(sheet, /<c r="B2" s="2"><v>-123\.45<\/v>/);
  assert.match(sheet, /<c r="B3" s="2"><v>0\.01<\/v>/);
  assert.match(sheet, /<c r="C2" s="3"><v>46323<\/v>/);
  assert.doesNotMatch(sheet, /<f[ >]/);
  assert.match(sheet, /A &lt; B &amp; C/);
  assert.match(sheet, /state="frozen"/);
  assert.match(sheet, /autoFilter ref="A1:C3"/);
});
test('CSV preserves negative numeric money, quoting, accents and protects formula-like descriptions', () => {
  const csv = exportsApi().csvText([{ key: 'd', label: 'Descrição' }, { key: 'v', label: 'Valor', type: 'money' }], [
    { d: '=SUM(1;2)', v: -12.34 }, { d: 'A; "B"\nC', v: 0.01 },
  ]);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.match(csv, /"'=SUM\(1;2\)";"-12,34"/);
  assert.match(csv, /"A; ""B""\nC";"0,01"/);
});
