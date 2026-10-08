// Builds small synthetic .docx, .pptx and .xlsx files at runtime (zip written by hand, no tools).
// Synthetic content only.
import { writeFileSync } from 'node:fs';
import { buildZip } from '../zip-helpers.mjs';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const NS_A = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"';
const NS_P = 'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const NS_R = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const NS_W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const NS_S = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
const REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const REL_T = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

const THEME = `<a:theme ${NS_A} name="Test"><a:themeElements><a:clrScheme name="T">
<a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>
<a:dk2><a:srgbClr val="1F3A5F"/></a:dk2><a:lt2><a:srgbClr val="EEEEEE"/></a:lt2>
<a:accent1><a:srgbClr val="0B6E4F"/></a:accent1><a:accent2><a:srgbClr val="C84B31"/></a:accent2><a:accent3><a:srgbClr val="2D4263"/></a:accent3>
<a:accent4><a:srgbClr val="ECDBBA"/></a:accent4><a:accent5><a:srgbClr val="7A9E9F"/></a:accent5><a:accent6><a:srgbClr val="B8B8B8"/></a:accent6>
</a:clrScheme><a:fontScheme name="F"><a:majorFont><a:latin typeface="Georgia"/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/></a:minorFont></a:fontScheme></a:themeElements></a:theme>`;

function write(file, entries) {
  writeFileSync(file, buildZip(entries.map((e) => ({ ...e, deflate: true }))));
  return file;
}

/** paragraphs: string[] */
export function makeDocx(file, paragraphs, { footer = [] } = {}) {
  const body = paragraphs.map((p) => `<w:p><w:r><w:t xml:space="preserve">${esc(p)}</w:t></w:r></w:p>`).join('');
  const entries = [
    { name: '[Content_Types].xml', data: '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>' },
    { name: 'word/document.xml', data: `<w:document ${NS_W}><w:body>${body}</w:body></w:document>` },
    { name: 'word/theme/theme1.xml', data: THEME },
  ];
  if (footer.length) {
    entries.push({ name: 'word/footer1.xml', data: `<w:ftr ${NS_W}>${footer.map((p) => `<w:p><w:r><w:t>${esc(p)}</w:t></w:r></w:p>`).join('')}</w:ftr>` });
  }
  return write(file, entries);
}

/**
 * slides: [{ title, texts[], notes?, chart?, table? }]. layouts: names for slide layouts.
 */
export function makePptx(file, slides, { layouts = ['Title Slide', 'Title and Content'] } = {}) {
  const entries = [
    { name: '[Content_Types].xml', data: '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>' },
    { name: 'ppt/theme/theme1.xml', data: THEME },
  ];
  layouts.forEach((name, i) => {
    entries.push({ name: `ppt/slideLayouts/slideLayout${i + 1}.xml`, data: `<p:sldLayout ${NS_P} ${NS_A}><p:cSld name="${esc(name)}"><p:spTree/></p:cSld></p:sldLayout>` });
  });
  slides.forEach((s, i) => {
    const n = i + 1;
    const para = (t) => `<a:p><a:r><a:t>${esc(t)}</a:t></a:r></a:p>`;
    let shapes = '';
    if (s.title !== undefined) {
      shapes += `<p:sp><p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr/><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:txBody>${para(s.title)}</p:txBody></p:sp>`;
    }
    for (const t of s.texts || []) {
      shapes += `<p:sp><p:nvSpPr><p:cNvPr id="3" name="Body"/><p:cNvSpPr/><p:nvPr><p:ph idx="1"/></p:nvPr></p:nvSpPr><p:txBody>${para(t)}</p:txBody></p:sp>`;
    }
    if (s.table) shapes += `<p:graphicFrame><a:graphic><a:graphicData><a:tbl><a:tr><a:tc><a:txBody>${para('Cell')}</a:txBody></a:tc></a:tr></a:tbl></a:graphicData></a:graphic></p:graphicFrame>`;
    if (s.chart) shapes += `<p:graphicFrame><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" ${NS_R} r:id="rId5"/></a:graphicData></a:graphic></p:graphicFrame>`;
    entries.push({ name: `ppt/slides/slide${n}.xml`, data: `<p:sld ${NS_P} ${NS_A} ${NS_R}><p:cSld><p:spTree>${shapes}</p:spTree></p:cSld></p:sld>` });
    let rels = `<Relationship Id="rId1" Type="${REL_T}/slideLayout" Target="../slideLayouts/slideLayout2.xml"/>`;
    if (s.notes !== undefined) {
      rels += `<Relationship Id="rId2" Type="${REL_T}/notesSlide" Target="../notesSlides/notesSlide${n}.xml"/>`;
      entries.push({
        name: `ppt/notesSlides/notesSlide${n}.xml`,
        data: `<p:notes ${NS_P} ${NS_A}><p:cSld><p:spTree>
<p:sp><p:nvSpPr><p:cNvPr id="2" name="img"/><p:cNvSpPr/><p:nvPr><p:ph type="sldImg"/></p:nvPr></p:nvSpPr></p:sp>
<p:sp><p:nvSpPr><p:cNvPr id="3" name="Notes"/><p:cNvSpPr/><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:txBody>${para(s.notes)}</p:txBody></p:sp>
<p:sp><p:nvSpPr><p:cNvPr id="4" name="num"/><p:cNvSpPr/><p:nvPr><p:ph type="sldNum"/></p:nvPr></p:nvSpPr><p:txBody>${para(String(n))}</p:txBody></p:sp>
</p:spTree></p:cSld></p:notes>`,
      });
    }
    if (s.chart) {
      rels += `<Relationship Id="rId5" Type="${REL_T}/chart" Target="../charts/chart${n}.xml"/>`;
      entries.push({ name: `ppt/charts/chart${n}.xml`, data: '<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"/>' });
    }
    entries.push({ name: `ppt/slides/_rels/slide${n}.xml.rels`, data: `<Relationships xmlns="${REL_NS}">${rels}</Relationships>` });
  });
  return write(file, entries);
}

/**
 * sheets: [{ name, cells: [{ ref, v?, s?, f?, t? }] }]  v = number/text value, s = shared string text,
 * f = formula, t = raw t attribute ('e' for an error, 'str' for a formula string, 'inlineStr' with is).
 */
export function makeXlsx(file, sheets) {
  const shared = [];
  const sheetXml = sheets.map((sh) => {
    const rows = sh.cells.map((c) => {
      let attrs = `r="${c.ref}"`;
      let inner = '';
      if (c.s !== undefined) {
        let idx = shared.indexOf(c.s);
        if (idx < 0) idx = shared.push(c.s) - 1;
        attrs += ' t="s"';
        inner = `<v>${idx}</v>`;
      } else {
        if (c.t) attrs += ` t="${c.t}"`;
        if (c.f !== undefined) inner += `<f>${esc(c.f)}</f>`;
        if (c.v !== undefined) inner += `<v>${esc(c.v)}</v>`;
      }
      return `<c ${attrs}>${inner}</c>`;
    });
    return `<worksheet ${NS_S}><sheetData><row r="1">${rows.join('')}</row></sheetData></worksheet>`;
  });
  const entries = [
    { name: '[Content_Types].xml', data: '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>' },
    { name: 'xl/workbook.xml', data: `<workbook ${NS_S} ${NS_R}><sheets>${sheets.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', data: `<Relationships xmlns="${REL_NS}">${sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Type="${REL_T}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}</Relationships>` },
    { name: 'xl/sharedStrings.xml', data: `<sst ${NS_S}>${shared.map((t) => `<si><t>${esc(t)}</t></si>`).join('')}</sst>` },
    { name: 'xl/theme/theme1.xml', data: THEME },
  ];
  sheetXml.forEach((x, i) => entries.push({ name: `xl/worksheets/sheet${i + 1}.xml`, data: x }));
  return write(file, entries);
}

/** A clean workbook: inputs, a calculated total, no errors. */
export function cleanSheets() {
  return [
    {
      name: 'Model',
      cells: [
        { ref: 'A1', s: 'Revenue' },
        { ref: 'B1', v: '100' },
        { ref: 'C1', f: 'B1*Assumptions!B2', v: '120' },
        { ref: 'D1', f: 'SUM(B1:C1)+1', v: '221' },
      ],
    },
    { name: 'Assumptions', cells: [{ ref: 'A2', s: 'Growth' }, { ref: 'B2', v: '1.2' }] },
  ];
}
