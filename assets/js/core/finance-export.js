(function (global) {
  'use strict';
  var AGIR = global.AGIR = global.AGIR || {};
  function escapeXml(value) { return String(value == null ? '' : value).replace(/[<>&"']/g, function (c) { return { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]; }); }
  function valueOf(row, col) { return typeof col.value === 'function' ? col.value(row) : row[col.key]; }
  function download(name, blob) {
    var url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = name; document.body.appendChild(link); link.click(); link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
  }
  function csvText(columns, rows) {
    function field(value, numeric) {
      var text = String(value == null ? '' : value);
      if (!numeric && /^[\s]*[=+@\-\t\r]/.test(text)) text = "'" + text;
      return '"' + text.replace(/"/g, '""') + '"';
    }
    return '\uFEFF' + [columns.map(function (c) { return field(c.label); }).join(';')].concat(rows.map(function (row) {
      return columns.map(function (col) {
        var value = valueOf(row, col);
        if ((col.type === 'money' || col.type === 'number') && value != null && value !== '' && Number.isFinite(Number(value))) {
          return field(Number(value).toLocaleString('pt-BR', { minimumFractionDigits: col.type === 'money' ? 2 : 0, maximumFractionDigits: col.type === 'money' ? 2 : 8, useGrouping: false }), true);
        }
        return field(value);
      }).join(';');
    })).join('\r\n');
  }
  var crcTable;
  function crc32(bytes) {
    if (!crcTable) crcTable = Array.from({ length: 256 }, function (_, n) { for (var k = 0; k < 8; k++) n = n & 1 ? 0xEDB88320 ^ (n >>> 1) : n >>> 1; return n >>> 0; });
    var crc = 0xFFFFFFFF;
    bytes.forEach(function (b) { crc = crcTable[(crc ^ b) & 255] ^ (crc >>> 8); });
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }
  function zip(files) {
    var enc = new TextEncoder(), local = [], central = [], offset = 0, centralSize = 0;
    Object.keys(files).forEach(function (name) {
      var filename = enc.encode(name), data = enc.encode(files[name]), crc = crc32(data);
      var header = new Uint8Array(30 + filename.length), view = new DataView(header.buffer);
      view.setUint32(0, 0x04034B50, true); view.setUint16(4, 20, true); view.setUint16(6, 0x800, true);
      view.setUint32(14, crc, true); view.setUint32(18, data.length, true); view.setUint32(22, data.length, true); view.setUint16(26, filename.length, true); header.set(filename, 30);
      local.push(header, data);
      var item = new Uint8Array(46 + filename.length), cv = new DataView(item.buffer);
      cv.setUint32(0, 0x02014B50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x800, true);
      cv.setUint32(16, crc, true); cv.setUint32(20, data.length, true); cv.setUint32(24, data.length, true); cv.setUint16(28, filename.length, true); cv.setUint32(42, offset, true); item.set(filename, 46);
      central.push(item); centralSize += item.length; offset += header.length + data.length;
    });
    var end = new Uint8Array(22), ev = new DataView(end.buffer), count = Object.keys(files).length;
    ev.setUint32(0, 0x06054B50, true); ev.setUint16(8, count, true); ev.setUint16(10, count, true); ev.setUint32(12, centralSize, true); ev.setUint32(16, offset, true);
    return new Blob(local.concat(central, [end]), { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }
  function columnName(n) { var text = ''; do { text = String.fromCharCode(65 + n % 26) + text; n = Math.floor(n / 26) - 1; } while (n >= 0); return text; }
  function workbook(columns, rows) {
    if (!columns.length) throw new Error('Selecione ao menos uma coluna.');
    if (columns.length > 16384 || rows.length >= 1048576) throw new Error('O relatório excede o limite de uma planilha Excel.');
    function cell(value, col, ref, heading) {
      if (!heading && value != null && value !== '' && (col.type === 'money' || col.type === 'number') && Number.isFinite(Number(value))) {
        return '<c r="' + ref + '" s="' + (col.type === 'money' ? '2' : '0') + '"><v>' + Number(value) + '</v></c>';
      }
      if (!heading && col.type === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
        var serial = Math.round((Date.parse(value + 'T00:00:00Z') - Date.UTC(1899, 11, 30)) / 86400000);
        if (Number.isFinite(serial)) return '<c r="' + ref + '" s="3"><v>' + serial + '</v></c>';
      }
      return '<c r="' + ref + '" t="inlineStr" s="' + (heading ? '1' : '0') + '"><is><t xml:space="preserve">' + escapeXml(value) + '</t></is></c>';
    }
    var table = '<row r="1" ht="24" customHeight="1">' + columns.map(function (c, i) { return cell(c.label, c, columnName(i) + '1', true); }).join('') + '</row>';
    rows.forEach(function (row, index) { table += '<row r="' + (index + 2) + '">' + columns.map(function (c, i) { return cell(valueOf(row, c), c, columnName(i) + (index + 2), false); }).join('') + '</row>'; });
    var prefix = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
    var files = {};
    files['[Content_Types].xml'] = prefix + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>';
    files['_rels/.rels'] = prefix + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
    files['xl/workbook.xml'] = prefix + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Financeiro" sheetId="1" r:id="rId1"/></sheets></workbook>';
    files['xl/_rels/workbook.xml.rels'] = prefix + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';
    files['xl/styles.xml'] = prefix + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="2"><numFmt numFmtId="164" formatCode="&quot;R$&quot; #,##0.00;[Red]-&quot;R$&quot; #,##0.00"/><numFmt numFmtId="165" formatCode="dd/mm/yyyy"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF15202B"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
    files['xl/worksheets/sheet1.xml'] = prefix + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:' + columnName(columns.length - 1) + (rows.length + 1) + '"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>' + columns.map(function (c, i) { return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + (c.width || (c.type === 'money' ? 19 : 25)) + '" customWidth="1"/>'; }).join('') + '</cols><sheetData>' + table + '</sheetData><autoFilter ref="A1:' + columnName(columns.length - 1) + (rows.length + 1) + '"/><pageSetup orientation="landscape" paperSize="9"/></worksheet>';
    return zip(files);
  }
  function printReport(title, columns, rows) {
    var frame = document.createElement('iframe');
    frame.title = 'Imprimir relatório'; frame.style.cssText = 'position:fixed;width:1px;height:1px;bottom:0;right:0;border:0';
    document.body.appendChild(frame);
    var doc = frame.contentDocument;
    doc.open(); doc.write('<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>' + escapeXml(title) + '</title><style>@page{size:A4 landscape;margin:14mm}body{font:11px Arial;color:#15202b}h1{font-size:22px}p{color:#52606d}table{width:100%;border-collapse:collapse}th{background:#edf1f5;text-align:left}td,th{border-bottom:1px solid #d8e0e8;padding:7px}thead{display:table-header-group}tr{break-inside:avoid}.number{text-align:right;white-space:nowrap}</style></head><body><h1>' + escapeXml(title) + '</h1><p>Ascensão Comercial · Emitido em ' + escapeXml(new Date().toLocaleString('pt-BR')) + '</p><table><thead><tr>' + columns.map(function (col) { return '<th>' + escapeXml(col.label) + '</th>'; }).join('') + '</tr></thead><tbody>' + rows.map(function (row) { return '<tr>' + columns.map(function (col) { var value = valueOf(row, col); if (col.type === 'money') value = Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); else if (col.type === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(String(value))) value = value.split('-').reverse().join('/'); return '<td class="' + (/money|number/.test(col.type) ? 'number' : '') + '">' + escapeXml(value) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></body></html>'); doc.close();
    setTimeout(function () { frame.contentWindow.focus(); frame.contentWindow.print(); }, 120);
    setTimeout(function () { frame.remove(); }, 120000);
  }
  AGIR.financeExport = {
    csv: function (filename, columns, rows) { var blob = new Blob([csvText(columns, rows)], { type: 'text/csv;charset=utf-8' }); download(filename.replace(/(?:\.csv)?$/, '.csv'), blob); return blob; },
    xlsx: function (filename, columns, rows) { var blob = workbook(columns, rows); download(filename.replace(/(?:\.xlsx)?$/, '.xlsx'), blob); return blob; },
    print: printReport, csvText: csvText, workbook: workbook
  };
})(window);
