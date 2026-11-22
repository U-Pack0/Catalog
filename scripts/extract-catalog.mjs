import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SITE_ROOT = path.resolve(__dirname, '..');
const CATALOG_ROOT = path.resolve(SITE_ROOT, '..');
const UPACK_FILES_ROOT = path.resolve(CATALOG_ROOT, '..');

const PDF_PATH = path.join(CATALOG_ROOT, 'final catalog.pdf');
const I18N_AR_PATH = path.join(__dirname, 'i18n-catalog-ar.json');
const CACHE_DIR = path.join(__dirname, 'cache');
const PDF_OBJ_CACHE = path.join(CACHE_DIR, 'pdf-obj');
const LEGACY_CACHE = path.join(CACHE_DIR, 'legacy');

const PUBLIC_IMAGES = path.join(SITE_ROOT, 'public', 'images');
const DIR_BRAND = path.join(PUBLIC_IMAGES, 'brand');
const DIR_CLIENTS = path.join(PUBLIC_IMAGES, 'clients');
const DIR_HERO = path.join(PUBLIC_IMAGES, 'hero');
const DIR_PRODUCTS = path.join(PUBLIC_IMAGES, 'products');
const DIR_OG = path.join(PUBLIC_IMAGES, 'og');
const OUT_JSON = path.join(SITE_ROOT, 'src', 'data', 'catalog.json');

const CMYK_ICC = 'C:\\Windows\\System32\\spool\\drivers\\color\\RSWOP.icm';
const SRGB_ICC = 'C:\\Windows\\System32\\spool\\drivers\\color\\sRGB Color Space Profile.icm';
const HAS_WINDOWS_ICC = fs.existsSync(CMYK_ICC) && fs.existsSync(SRGB_ICC);

for (const d of [CACHE_DIR, PDF_OBJ_CACHE, LEGACY_CACHE, DIR_BRAND, DIR_CLIENTS, DIR_HERO, DIR_PRODUCTS, DIR_OG, path.dirname(OUT_JSON)]) {
  fs.mkdirSync(d, { recursive: true });
}

const i18nData = JSON.parse(fs.readFileSync(I18N_AR_PATH, 'utf8'));

// ============================================================================
// 1. PURE NODE PDF BINARY PARSER (Xref, Objects, Content Streams, Image XObjects)
// ============================================================================
console.log('[1/8] Reading and parsing final catalog.pdf...');
const pdfBuf = fs.readFileSync(PDF_PATH);
const pdfLat = pdfBuf.toString('latin1');

function parseAllObjects(latin) {
  const objects = new Map();
  const xrefRegex = /xref\r?\n([\s\S]*?)trailer\r?\n\s*<<([\s\S]*?)>>/g;
  let rootRef = null;
  let m;
  while ((m = xrefRegex.exec(latin)) !== null) {
    const body = m[1];
    const trailer = m[2];
    const rm = trailer.match(/\/Root\s+(\d+)\s+\d+\s+R/);
    if (rm) rootRef = parseInt(rm[1], 10);
    const lines = body.split(/\r?\n/);
    let objNum = 0, remaining = 0;
    for (const line of lines) {
      const t = line.trim();
      if (!t) continue;
      if (remaining === 0) {
        const hdr = t.match(/^(\d+)\s+(\d+)$/);
        if (hdr) { objNum = parseInt(hdr[1], 10); remaining = parseInt(hdr[2], 10); }
      } else {
        const ent = t.match(/^(\d{10})\s+(\d{5})\s+([nf])$/);
        if (ent) {
          if (ent[3] === 'n' && !objects.has(objNum)) objects.set(objNum, parseInt(ent[1], 10));
          objNum++; remaining--;
        }
      }
    }
  }
  return { objects, rootRef };
}

const { objects: objOffsets, rootRef } = parseAllObjects(pdfLat);
const objCache = new Map();

function getObjectRaw(num) {
  if (objCache.has(num)) return objCache.get(num);
  const offset = objOffsets.get(num);
  if (offset === undefined) return null;
  const headerMatch = pdfLat.slice(offset, offset + 40).match(/^(\d+)\s+(\d+)\s+obj\s*/);
  if (!headerMatch) return null;
  const contentStart = offset + headerMatch[0].length;
  const endObjSearch = pdfLat.indexOf('endobj', contentStart);
  const chunkHead = pdfLat.slice(contentStart, endObjSearch !== -1 ? Math.min(endObjSearch, contentStart + 4096) : contentStart + 4096);

  const sm = chunkHead.match(/>>\s*stream(?:\r\n|\n|\r)/);
  let res;
  if (sm) {
    const dictPart = chunkHead.slice(0, sm.index + 2).trim();
    const lenMatch = dictPart.match(/\/Length\s+(\d+)(?:\s+(\d+)\s+R)?/);
    let streamLen = null;
    if (lenMatch) {
      if (lenMatch[2] !== undefined) {
        const lenObj = getObjectRaw(parseInt(lenMatch[1], 10));
        streamLen = parseInt(lenObj.dict.trim(), 10);
      } else {
        streamLen = parseInt(lenMatch[1], 10);
      }
    }
    const sStart = contentStart + sm.index + sm[0].length;
    let streamBuf;
    if (streamLen !== null && Number.isFinite(streamLen)) {
      streamBuf = pdfBuf.subarray(sStart, sStart + streamLen);
    } else {
      const endStreamIdx = pdfLat.indexOf('endstream', sStart);
      streamBuf = pdfBuf.subarray(sStart, endStreamIdx);
    }
    res = { id: num, num, dict: dictPart, stream: streamBuf };
  } else {
    const endIdx = pdfLat.indexOf('endobj', contentStart);
    res = { id: num, num, dict: pdfLat.slice(contentStart, endIdx).trim(), stream: null };
  }
  objCache.set(num, res);
  return res;
}

const pdfObjs = {
  get: (id) => getObjectRaw(id)
};

function decodeStream(obj) {
  if (!obj || !obj.stream) return null;
  const d = obj.dict;
  if (/\/Filter\s*\/FlateDecode\b/.test(d) || /\/Filter\s*\[\s*\/FlateDecode\s*\]/.test(d)) {
    try { return zlib.inflateSync(obj.stream); } catch {
      try { return zlib.inflateRawSync(obj.stream); } catch { return null; }
    }
  }
  return obj.stream;
}

function extractSubDict(dictStr, key) {
  if (!dictStr) return null;
  const idx = dictStr.indexOf(key);
  if (idx === -1) return null;
  const rest = dictStr.slice(idx + key.length).trimStart();
  const refM = rest.match(/^(\d+)\s+\d+\s+R\b/);
  if (refM) {
    const target = getObjectRaw(parseInt(refM[1], 10));
    return target ? target.dict : null;
  }
  if (!rest.startsWith('<<')) return null;
  let depth = 0;
  for (let i = 0; i < rest.length - 1; i++) {
    if (rest[i] === '<' && rest[i + 1] === '<') { depth++; i++; }
    else if (rest[i] === '>' && rest[i + 1] === '>') {
      depth--; i++;
      if (depth === 0) return rest.slice(0, i + 1);
    }
  }
  return null;
}

function parseXObjectMap(resourcesDict) {
  const map = new Map();
  if (!resourcesDict) return map;
  const xobjStr = extractSubDict(resourcesDict, '/XObject');
  if (!xobjStr) return map;
  for (const m of xobjStr.matchAll(/\/([^\s/<>\[\]]+)\s+(\d+)\s+\d+\s+R/g)) {
    map.set(m[1], parseInt(m[2], 10));
  }
  return map;
}

function decodePdfString(s) {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && i + 1 < s.length) {
      const next = s[i + 1];
      if (next === 'n') { out += '\n'; i++; }
      else if (next === 'r') { out += '\r'; i++; }
      else if (next === 't') { out += '\t'; i++; }
      else if (next === 'b') { out += '\b'; i++; }
      else if (next === 'f') { out += '\f'; i++; }
      else if (next === '(' || next === ')' || next === '\\') { out += next; i++; }
      else if (next === '\r' || next === '\n') {
        i++;
        if (next === '\r' && s[i + 1] === '\n') i++;
      } else if (/[0-7]/.test(next)) {
        let oct = next; i++;
        if (/[0-7]/.test(s[i + 1])) { oct += s[++i]; }
        if (/[0-7]/.test(s[i + 1])) { oct += s[++i]; }
        const code = parseInt(oct, 8);
        out += code === 215 ? '×' : String.fromCharCode(code);
      } else {
        out += next; i++;
      }
    } else {
      const code = s.charCodeAt(i);
      out += code === 215 ? '×' : s[i];
    }
  }
  return out;
}

function parseContentStream(streamStr, xobjMap, collectedText, collectedImages, visitedForms = new Set()) {
  let i = 0;
  const len = streamStr.length;
  const tokens = [];
  while (i < len) {
    const ch = streamStr[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (ch === '%') {
      while (i < len && streamStr[i] !== '\n' && streamStr[i] !== '\r') i++;
      continue;
    }
    if (ch === '(') {
      let depth = 1, start = i + 1;
      i++;
      while (i < len && depth > 0) {
        if (streamStr[i] === '\\') { i += 2; continue; }
        if (streamStr[i] === '(') depth++;
        else if (streamStr[i] === ')') depth--;
        i++;
      }
      tokens.push({ type: 'str', val: decodePdfString(streamStr.slice(start, i - 1)) });
      continue;
    }
    if (ch === '<') {
      if (streamStr[i + 1] === '<') {
        tokens.push({ type: 'op', val: '<<' }); i += 2; continue;
      }
      const start = i + 1; i++;
      while (i < len && streamStr[i] !== '>') i++;
      const hex = streamStr.slice(start, i).replace(/\s+/g, '');
      i++;
      let s = '';
      for (let k = 0; k < hex.length; k += 2) {
        const code = parseInt(hex.slice(k, k + 2).padEnd(2, '0'), 16);
        s += code === 215 ? '×' : String.fromCharCode(code);
      }
      tokens.push({ type: 'str', val: s });
      continue;
    }
    if (ch === '>' && streamStr[i + 1] === '>') {
      tokens.push({ type: 'op', val: '>>' }); i += 2; continue;
    }
    if (ch === '[') { tokens.push({ type: '[', val: '[' }); i++; continue; }
    if (ch === ']') { tokens.push({ type: ']', val: ']' }); i++; continue; }
    if (ch === '/') {
      const start = i + 1; i++;
      while (i < len && !/[\s()<>\[\]{}\/%]/.test(streamStr[i])) i++;
      tokens.push({ type: 'name', val: streamStr.slice(start, i) });
      continue;
    }
    const start = i;
    while (i < len && !/[\s()<>\[\]{}\/%]/.test(streamStr[i])) i++;
    const word = streamStr.slice(start, i);
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(word)) {
      tokens.push({ type: 'num', val: parseFloat(word) });
    } else {
      tokens.push({ type: 'op', val: word });
    }
  }

  let tm = [1, 0, 0, 1, 0, 0];
  let tlm = [1, 0, 0, 1, 0, 0];
  let fontName = '';
  let fontSize = 1;
  let leading = 0;
  const ctmStack = [[1, 0, 0, 1, 0, 0]];
  const operands = [];
  let inArray = false;
  let arr = [];

  function mulMat(a, b) {
    return [
      a[0] * b[0] + a[1] * b[2],
      a[0] * b[1] + a[1] * b[3],
      a[2] * b[0] + a[3] * b[2],
      a[2] * b[1] + a[3] * b[3],
      a[4] * b[0] + a[5] * b[2] + b[4],
      a[4] * b[1] + a[5] * b[3] + b[5]
    ];
  }

  for (const tok of tokens) {
    if (tok.type === '[') { inArray = true; arr = []; continue; }
    if (tok.type === ']') { inArray = false; operands.push({ type: 'arr', val: arr }); continue; }
    if (inArray) { arr.push(tok); continue; }
    if (tok.type !== 'op') { operands.push(tok); continue; }

    const op = tok.val;
    if (op === 'q') {
      ctmStack.push([...ctmStack[ctmStack.length - 1]]);
    } else if (op === 'Q') {
      if (ctmStack.length > 1) ctmStack.pop();
    } else if (op === 'cm' && operands.length >= 6) {
      const m = operands.slice(-6).map(x => x.val);
      ctmStack[ctmStack.length - 1] = mulMat(m, ctmStack[ctmStack.length - 1]);
    } else if (op === 'BT') {
      tm = [1, 0, 0, 1, 0, 0];
      tlm = [1, 0, 0, 1, 0, 0];
    } else if (op === 'Tf' && operands.length >= 2) {
      fontName = operands[operands.length - 2].val;
      fontSize = operands[operands.length - 1].val;
    } else if (op === 'TL' && operands.length >= 1) {
      leading = operands[operands.length - 1].val;
    } else if (op === 'Tm' && operands.length >= 6) {
      const m = operands.slice(-6).map(x => x.val);
      tm = [...m]; tlm = [...m];
    } else if ((op === 'Td' || op === 'TD') && operands.length >= 2) {
      const tx = operands[operands.length - 2].val;
      const ty = operands[operands.length - 1].val;
      if (op === 'TD') leading = -ty;
      tlm = mulMat([1, 0, 0, 1, tx, ty], tlm);
      tm = [...tlm];
    } else if (op === 'T*') {
      tlm = mulMat([1, 0, 0, 1, 0, -leading], tlm);
      tm = [...tlm];
    } else if (op === 'Tj' && operands.length >= 1) {
      const str = operands[operands.length - 1].val;
      if (typeof str === 'string' && str.trim()) {
        const effSize = Math.round(Math.hypot(tm[0], tm[1]) * fontSize * 10) / 10;
        collectedText.push({ x: Math.round(tm[4] * 10) / 10, y: Math.round(tm[5] * 10) / 10, size: effSize, font: fontName, text: str });
      }
    } else if (op === 'TJ' && operands.length >= 1) {
      const a = operands[operands.length - 1].val;
      if (Array.isArray(a)) {
        let s = '';
        for (const item of a) {
          if (item.type === 'str') s += item.val;
          else if (item.type === 'num' && item.val < -180) s += ' ';
        }
        if (s.trim()) {
          const effSize = Math.round(Math.hypot(tm[0], tm[1]) * fontSize * 10) / 10;
          collectedText.push({ x: Math.round(tm[4] * 10) / 10, y: Math.round(tm[5] * 10) / 10, size: effSize, font: fontName, text: s });
        }
      }
    } else if ((op === "'" || op === '"') && operands.length >= 1) {
      tlm = mulMat([1, 0, 0, 1, 0, -leading], tlm);
      tm = [...tlm];
      const str = operands[operands.length - 1].val;
      if (typeof str === 'string' && str.trim()) {
        const effSize = Math.round(Math.hypot(tm[0], tm[1]) * fontSize * 10) / 10;
        collectedText.push({ x: Math.round(tm[4] * 10) / 10, y: Math.round(tm[5] * 10) / 10, size: effSize, font: fontName, text: str });
      }
    } else if (op === 'Do' && operands.length >= 1) {
      const name = operands[operands.length - 1].val;
      const objNum = xobjMap.get(name);
      if (objNum !== undefined) {
        const xobj = getObjectRaw(objNum);
        if (xobj) {
          if (/\/Subtype\s*\/Image\b/.test(xobj.dict)) {
            const w = parseInt((xobj.dict.match(/\/Width\s+(\d+)/) || [])[1] || '0', 10);
            const h = parseInt((xobj.dict.match(/\/Height\s+(\d+)/) || [])[1] || '0', 10);
            collectedImages.push({ name, objId: objNum, width: w, height: h, obj: xobj });
          } else if (/\/Subtype\s*\/Form\b/.test(xobj.dict) && !visitedForms.has(objNum)) {
            visitedForms.add(objNum);
            const dec = decodeStream(xobj);
            if (dec) {
              const formRes = extractSubDict(xobj.dict, '/Resources');
              const formXMap = parseXObjectMap(formRes);
              parseContentStream(dec.toString('latin1'), formXMap, collectedText, collectedImages, visitedForms);
            }
          }
        }
      }
    }
    operands.length = 0;
  }
}

const rootObj = getObjectRaw(rootRef);
const pagesRef = parseInt(rootObj.dict.match(/\/Pages\s+(\d+)\s+\d+\s+R/)[1], 10);
const pageMetaList = [];
function walkPages(nodeNum, inheritedRes = null) {
  const node = getObjectRaw(nodeNum);
  const res = extractSubDict(node.dict, '/Resources') || inheritedRes;
  if (/\/Type\s*\/Pages\b/.test(node.dict)) {
    const kidsMatch = node.dict.match(/\/Kids\s*\[([\s\S]*?)\]/);
    if (kidsMatch) {
      for (const m of kidsMatch[1].matchAll(/(\d+)\s+\d+\s+R/g)) walkPages(parseInt(m[1], 10), res);
    }
  } else if (/\/Type\s*\/Page\b/.test(node.dict)) {
    pageMetaList.push({ pageNum: pageMetaList.length + 1, objNum: nodeNum, dict: node.dict, res });
  }
}
walkPages(pagesRef);
if (pageMetaList.length !== 397) {
  throw new Error(`Expected 397 pages in final catalog.pdf, got ${pageMetaList.length}`);
}

function extractPageData(pageNum) {
  const p = pageMetaList[pageNum - 1];
  const xobjMap = parseXObjectMap(p.res);
  const cMatch = p.dict.match(/\/Contents\s+(?:(\d+)\s+\d+\s+R|\[([^\]]+)\])/);
  let fullStream = '';
  if (cMatch) {
    const cRefs = cMatch[1] ? [parseInt(cMatch[1], 10)] : [...cMatch[2].matchAll(/(\d+)\s+\d+\s+R/g)].map(x => parseInt(x[1], 10));
    for (const cr of cRefs) {
      const dec = decodeStream(getObjectRaw(cr));
      if (dec) fullStream += '\n' + dec.toString('latin1');
    }
  }
  const texts = [];
  const images = [];
  parseContentStream(fullStream, xobjMap, texts, images);
  images.sort((a, b) => (b.width * b.height) - (a.width * a.height));

  // Detect multiple title42 paints (Illustrator ghost template layer underneath active layer)
  let startIdx = 0;
  const titleIndices = [];
  texts.forEach((t, idx) => {
    if (Math.abs(t.size - 42) < 5 && t.y > 400 && t.y < 460) titleIndices.push(idx);
  });
  if (titleIndices.length > 1) {
    const lastTitleIdx = titleIndices[titleIndices.length - 1];
    startIdx = lastTitleIdx;
    while (startIdx > 0 && texts[startIdx - 1].y > 470 && texts[startIdx - 1].size < 15) {
      startIdx--;
    }
  }
  const activeTexts = texts.slice(startIdx);

  const title = [...activeTexts].filter(t => Math.abs(t.size - 42) < 5 && t.y > 400).pop()?.text.trim() || '';

  // Top 3 pills at y ~ 334.5 (325..345): code (450..600), material (600..740), capacity (740..950)
  const pills = activeTexts.filter(t => t.y >= 325 && t.y <= 345 && Math.abs(t.size - 12.9) < 2 && t.x >= 450);
  const pillSlot = (minX, maxX) => [...pills].filter(t => t.x >= minX && t.x <= maxX).pop()?.text.trim() || '';
  const code = pillSlot(450, 600);
  const material = pillSlot(600, 740);
  const capacity = pillSlot(740, 950);

  // Spec values column at x ~ 615 (580..720), y < 300
  const valItems = activeTexts.filter(t => t.x >= 580 && t.x <= 720 && t.y < 300 && t.size >= 9 && t.size <= 15);
  const valRows = [];
  for (const t of valItems) {
    const existing = valRows.find(r => Math.abs(r.y - t.y) < 8);
    if (existing) { existing.text = t.text.trim(); existing.y = t.y; }
    else valRows.push({ y: t.y, text: t.text.trim() });
  }
  valRows.sort((a, b) => b.y - a.y);

  const lblItems = activeTexts.filter(t => t.x >= 450 && t.x <= 560 && t.y < 300 && t.size >= 9 && t.size <= 15);
  const lblRows = [];
  for (const t of lblItems) {
    const existing = lblRows.find(r => Math.abs(r.y - t.y) < 8);
    if (existing) { existing.text = t.text.trim(); existing.y = t.y; }
    else lblRows.push({ y: t.y, text: t.text.trim() });
  }
  lblRows.sort((a, b) => b.y - a.y);

  const hasLW = lblRows.some(r => /length/i.test(r.text)) || valRows.length >= 9;
  const rawSpecs = {};
  if (hasLW) {
    const mapRow = (y) => {
      if (y > 253) return 'diameter';
      if (y > 228) return 'length';
      if (y > 197) return 'width';
      if (y > 168) return 'height';
      if (y > 136) return 'weight';
      if (y > 104) return 'pcsPerCarton';
      if (y > 73) return 'cartonSize';
      if (y > 42) return 'cbm';
      return 'color';
    };
    for (const vr of valRows) rawSpecs[mapRow(vr.y)] = vr.text;
  } else {
    const mapRow = (y) => {
      if (y > 240) return 'diameter';
      if (y > 208) return 'height';
      if (y > 176) return 'weight';
      if (y > 144) return 'pcsPerCarton';
      if (y > 113) return 'cartonSize';
      if (y > 82) return 'cbm';
      return 'color';
    };
    for (const vr of valRows) rawSpecs[mapRow(vr.y)] = vr.text;
  }

  // Format unified dimensions string from diameter / length / width / height
  const cleanVal = (v) => (v && !/^[-]+$/.test(v.trim())) ? v.trim() : '';
  const diam = cleanVal(rawSpecs.diameter);
  const len = cleanVal(rawSpecs.length);
  const wid = cleanVal(rawSpecs.width);
  const hgt = cleanVal(rawSpecs.height);
  let dimensions = '';
  if (len && wid && hgt) dimensions = `${len} × ${wid} × ${hgt}`;
  else if (len && wid) dimensions = `${len} × ${wid}`;
  else if (diam && hgt) dimensions = `Ø ${diam} × H ${hgt}`;
  else if (diam) dimensions = `Ø ${diam}`;
  else if (len && hgt) dimensions = `${len} × H ${hgt}`;
  else if (hgt) dimensions = `H ${hgt}`;

  return {
    pageNum,
    title,
    pills: {
      left: material,
      mid: `${cleanVal(capacity)} ${cleanVal(rawSpecs.weight)}`.trim(),
      right: cleanVal(rawSpecs.pcsPerCarton)
    },
    specs: {
      code,
      dimensions,
      cartonSize: cleanVal(rawSpecs.cartonSize),
      cbm: cleanVal(rawSpecs.cbm),
      color: cleanVal(rawSpecs.color)
    },
    primaryImage: images[0] || null,
    allImages: images
  };
}

// ============================================================================
// 2. COLOR-ACCURATE YCCK/CMYK + SMASK IMAGE DECODER + STARTUP SANITY GATE
// ============================================================================
function cmykInvertedToRgb(cmykBuf, pixelCount) {
  const rgb = Buffer.allocUnsafe(pixelCount * 3);
  for (let p = 0, i4 = 0, i3 = 0; p < pixelCount; p++, i4 += 4, i3 += 3) {
    const k = cmykBuf[i4 + 3];
    rgb[i3]     = (cmykBuf[i4]     * k + 127) / 255 | 0;
    rgb[i3 + 1] = (cmykBuf[i4 + 1] * k + 127) / 255 | 0;
    rgb[i3 + 2] = (cmykBuf[i4 + 2] * k + 127) / 255 | 0;
  }
  return rgb;
}

function cmykDirectToRgb(cmykBuf, pixelCount) {
  const rgb = Buffer.allocUnsafe(pixelCount * 3);
  for (let p = 0, i4 = 0, i3 = 0; p < pixelCount; p++, i4 += 4, i3 += 3) {
    const nk = 255 - cmykBuf[i4 + 3];
    rgb[i3]     = ((255 - cmykBuf[i4])     * nk + 127) / 255 | 0;
    rgb[i3 + 1] = ((255 - cmykBuf[i4 + 1]) * nk + 127) / 255 | 0;
    rgb[i3 + 2] = ((255 - cmykBuf[i4 + 2]) * nk + 127) / 255 | 0;
  }
  return rgb;
}

async function decodePdfImageObjectToPng(imgObj) {
  const cachedPng = path.join(PDF_OBJ_CACHE, `obj_${imgObj.id}.png`);
  if (fs.existsSync(cachedPng)) {
    return cachedPng;
  }

  const dict = imgObj.dict;
  const isDCT = /\/DCTDecode\b/.test(dict);
  const isFlate = /\/FlateDecode\b/.test(dict);
  const isCMYK = /\/DeviceCMYK\b/.test(dict);
  const w = parseInt(dict.match(/\/Width\s+(\d+)/)?.[1] || '0', 10);
  const h = parseInt(dict.match(/\/Height\s+(\d+)/)?.[1] || '0', 10);
  const smaskRef = dict.match(/\/SMask\s+(\d+)\s+0\s+R/);

  if (HAS_WINDOWS_ICC && isCMYK) {
    // High-accuracy Adobe RSWOP CMYK ICC -> sRGB with Black Point Compensation via ImageMagick
    const tmpBase = path.join(PDF_OBJ_CACHE, `tmp_${imgObj.id}`);
    const args = [];
    const cleanupFiles = [];

    if (isDCT) {
      const tmpJpg = `${tmpBase}.jpg`;
      fs.writeFileSync(tmpJpg, imgObj.stream);
      cleanupFiles.push(tmpJpg);
      args.push(
        tmpJpg,
        '-channel', 'CMYK', '-negate', '+channel',
        '-profile', CMYK_ICC,
        '-intent', 'Relative',
        '-black-point-compensation',
        '-profile', SRGB_ICC
      );
    } else if (isFlate) {
      const tmpCmyk = `${tmpBase}.cmyk`;
      fs.writeFileSync(tmpCmyk, zlib.inflateSync(imgObj.stream));
      cleanupFiles.push(tmpCmyk);
      args.push(
        '-size', `${w}x${h}`, '-depth', '8', `cmyk:${tmpCmyk}`,
        '-profile', CMYK_ICC,
        '-intent', 'Relative',
        '-black-point-compensation',
        '-profile', SRGB_ICC
      );
    }

    if (smaskRef) {
      const smObj = pdfObjs.get(parseInt(smaskRef[1], 10));
      const smW = parseInt(smObj.dict.match(/\/Width\s+(\d+)/)?.[1] || String(w), 10);
      const smH = parseInt(smObj.dict.match(/\/Height\s+(\d+)/)?.[1] || String(h), 10);
      if (/\/DCTDecode\b/.test(smObj.dict)) {
        const tmpMaskJpg = `${tmpBase}_mask.jpg`;
        fs.writeFileSync(tmpMaskJpg, smObj.stream);
        cleanupFiles.push(tmpMaskJpg);
        args.push('(', tmpMaskJpg, '-colorspace', 'Gray', '-resize', `${w}x${h}!`, ')');
      } else if (/\/FlateDecode\b/.test(smObj.dict)) {
        const tmpMaskGray = `${tmpBase}_mask.gray`;
        fs.writeFileSync(tmpMaskGray, zlib.inflateSync(smObj.stream));
        cleanupFiles.push(tmpMaskGray);
        args.push('(', '-size', `${smW}x${smH}`, '-depth', '8', `gray:${tmpMaskGray}`, '-resize', `${w}x${h}!`, ')');
      }
      args.push(
        '-alpha', 'off', '-compose', 'CopyOpacity', '-composite',
        '-background', 'white', '-alpha', 'remove', '-alpha', 'off'
      );
    }

    args.push('-strip', cachedPng);
    await execFileAsync('magick', args);
    for (const f of cleanupFiles) {
      try { fs.unlinkSync(f); } catch {}
    }
    return cachedPng;
  }

  // Fallback pure-sharp DeviceCMYK conversion (for non-Windows CI environments)
  let rgbBuf, rw = w, rh = h;
  if (isDCT && isCMYK) {
    const { data, info } = await sharp(imgObj.stream, { failOn: 'none' })
      .pipelineColorspace('cmyk')
      .toColorspace('cmyk')
      .raw()
      .toBuffer({ resolveWithObject: true });
    rw = info.width;
    rh = info.height;
    rgbBuf = cmykInvertedToRgb(data, rw * rh);
  } else if (isFlate && isCMYK) {
    const rawCmyk = zlib.inflateSync(imgObj.stream);
    rgbBuf = cmykDirectToRgb(rawCmyk, rw * rh);
  } else {
    const { data, info } = await sharp(imgObj.stream, { failOn: 'none' })
      .toColorspace('srgb')
      .raw()
      .toBuffer({ resolveWithObject: true });
    rw = info.width;
    rh = info.height;
    rgbBuf = data;
  }

  if (smaskRef) {
    const smObj = pdfObjs.get(parseInt(smaskRef[1], 10));
    const smW = parseInt(smObj.dict.match(/\/Width\s+(\d+)/)?.[1] || String(rw), 10);
    const smH = parseInt(smObj.dict.match(/\/Height\s+(\d+)/)?.[1] || String(rh), 10);
    let alphaRaw;
    if (/\/DCTDecode\b/.test(smObj.dict)) {
      alphaRaw = await sharp(smObj.stream, { failOn: 'none' }).greyscale().resize(rw, rh).raw().toBuffer();
    } else if (/\/FlateDecode\b/.test(smObj.dict)) {
      const rawA = zlib.inflateSync(smObj.stream);
      alphaRaw = (smW !== rw || smH !== rh)
        ? await sharp(rawA, { raw: { width: smW, height: smH, channels: 1 } }).resize(rw, rh).raw().toBuffer()
        : rawA;
    }
    if (alphaRaw) {
      const comp = Buffer.allocUnsafe(rw * rh * 3);
      for (let p = 0; p < rw * rh; p++) {
        const a = alphaRaw[p];
        const inv = 255 - a;
        const i3 = p * 3;
        comp[i3]     = (rgbBuf[i3]     * a + 255 * inv + 127) / 255 | 0;
        comp[i3 + 1] = (rgbBuf[i3 + 1] * a + 255 * inv + 127) / 255 | 0;
        comp[i3 + 2] = (rgbBuf[i3 + 2] * a + 255 * inv + 127) / 255 | 0;
      }
      rgbBuf = comp;
    }
  }

  await sharp(rgbBuf, { raw: { width: rw, height: rh, channels: 3 } }).png().toFile(cachedPng);
  return cachedPng;
}

async function detectImageBackdrop(imagePathOrBuffer) {
  const { data, info } = await sharp(imagePathOrBuffer).toColorspace('srgb').raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels: ch } = info;
  const pts = [
    [4, 4], [w - 5, 4], [4, h - 5], [w - 5, h - 5],
    [Math.floor(w / 2), 4], [Math.floor(w / 2), h - 5]
  ];
  let sum = 0;
  for (const [x, y] of pts) {
    const cx = Math.max(0, Math.min(w - 1, x));
    const cy = Math.max(0, Math.min(h - 1, y));
    const idx = (cy * w + cx) * ch;
    sum += (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
  }
  const avg = sum / pts.length;
  return { avg: Math.round(avg), backdrop: avg < 95 ? 'dark' : 'light' };
}

console.log('[2/8] Running Mandatory YCCK CMYK -> sRGB Startup Sanity Gate (P254 white > 240, P004 black < 15)...');
{
  const p254 = extractPageData(254);
  const p004 = extractPageData(4);
  const png254 = await decodePdfImageObjectToPng(p254.primaryImage.obj);
  const png004 = await decodePdfImageObjectToPng(p004.primaryImage.obj);
  const b254 = await detectImageBackdrop(png254);
  const b004 = await detectImageBackdrop(png004);
  console.log(`  Sanity Gate P254 (LRLB-1 white bg): cornerAvg=${b254.avg} (${b254.backdrop})`);
  console.log(`  Sanity Gate P004 (K-92-10 black bg): cornerAvg=${b004.avg} (${b004.backdrop})`);
  if (b254.avg <= 240) {
    throw new Error(`YCCK SANITY GATE FAILED on P254: expected cornerAvg > 240 (pure white), got ${b254.avg}`);
  }
  if (b004.avg >= 15) {
    throw new Error(`YCCK SANITY GATE FAILED on P004: expected cornerAvg < 15 (jet black), got ${b004.avg}`);
  }
}

// ============================================================================
// 3. MASTER 74 NON-FOAM PDF FAMILIES DEFINITION (339 NON-FOAM PRODUCT PAGES)
// ============================================================================
// Excluded completely: Foam P380-P396 (17 product pages + P379 section divider)
const FOAM_PAGES = new Set([379, 380, 381, 382, 383, 384, 385, 386, 387, 388, 389, 390, 391, 392, 393, 394, 395, 396]);

const PDF_FAMILIES = [
  // Category: cake-dessert-trays (6 PDF families)
  {
    slug: 'square-cake-gt',
    cat: 'cake-dessert-trays',
    pages: [179, 183],
    mergedLids: [180, 181, 182, 184, 185],
    lidPolicy: 'paired-lid-box',
    hasLidIncluded: true,
    heroMode: 'cake-composite'
  },
  {
    slug: 'cheesecake-tray-ck1',
    cat: 'cake-dessert-trays',
    pages: [177],
    lidPolicy: 'built-in-hinged',
    hasLidIncluded: true
  },
  {
    slug: 'ps-rect-dessert-trays',
    cat: 'cake-dessert-trays',
    pages: [347, 348],
    lidPolicy: 'included-set',
    hasLidIncluded: true
  },
  {
    slug: 'ps-turky-dessert-trays',
    cat: 'cake-dessert-trays',
    pages: [349, 350, 351, 352, 353],
    lidPolicy: 'included-set',
    hasLidIncluded: true
  },
  {
    slug: 'ps-duet-trays',
    cat: 'cake-dessert-trays',
    pages: [354, 355],
    lidPolicy: 'included-set',
    hasLidIncluded: true
  },
  {
    slug: 'ps-oval-dessert-trays',
    cat: 'cake-dessert-trays',
    pages: [356, 357],
    lidPolicy: 'included-set',
    hasLidIncluded: true
  },

  // Category: dessert-cups-bowls (7 PDF families)
  {
    slug: 'ps-crystal-bowl-200',
    cat: 'dessert-cups-bowls',
    pages: [326],
    lidPolicy: 'included-set',
    hasLidIncluded: true,
    heroMode: 'dc200-tiramisu'
  },
  {
    slug: 'ps-crystal-dessert-bowls',
    cat: 'dessert-cups-bowls',
    pages: [327, 328, 329, 330, 358],
    lidPolicy: 'no-lid',
    hasLidIncluded: false
  },
  {
    slug: 'vip-ice-cup-200',
    cat: 'dessert-cups-bowls',
    pages: [324],
    lidPolicy: 'included-set',
    hasLidIncluded: true
  },
  {
    slug: 'square-dessert-cups-dc',
    cat: 'dessert-cups-bowls',
    pages: [51, 52, 53],
    mergedLids: [54, 55],
    lidPolicy: 'cups-no-lid-separate',
    hasLidIncluded: false
  },
  {
    slug: 'sweet-cups-92',
    cat: 'dessert-cups-bowls',
    pages: [32, 33, 34, 35, 36],
    refLids: [21, 22, 23],
    lidPolicy: 'cups-no-lid-separate',
    hasLidIncluded: false
  },
  {
    slug: 'yogurt-cups-95',
    cat: 'dessert-cups-bowls',
    pages: [37, 38, 39],
    refLids: [41, 42],
    lidPolicy: 'cups-no-lid-separate',
    hasLidIncluded: false
  },
  {
    slug: 'jelly-cups-jc',
    cat: 'dessert-cups-bowls',
    pages: [57, 58, 59],
    mergedLids: [60, 61],
    lidPolicy: 'cups-no-lid-separate',
    hasLidIncluded: false
  },

  // Category: cold-cups (7 PDF families)
  {
    slug: 'ushape-cups-92',
    cat: 'cold-cups',
    pages: [16, 17, 18, 19],
    refLids: [21, 22, 23],
    lidPolicy: 'cups-no-lid-separate',
    hasLidIncluded: false
  },
  {
    slug: 'pet-cups-92',
    cat: 'cold-cups',
    pages: [4, 5, 6, 7, 8, 9],
    refLids: [21, 22, 23],
    lidPolicy: 'cups-no-lid-separate',
    hasLidIncluded: false
  },
  {
    slug: 'smart-cups-92',
    cat: 'cold-cups',
    pages: [11, 12, 13, 14],
    refLids: [21, 22, 23],
    lidPolicy: 'cups-no-lid-separate',
    hasLidIncluded: false
  },
  {
    slug: 'tornado-cups-82',
    cat: 'cold-cups',
    pages: [25, 26, 27],
    refLids: [29, 30],
    lidPolicy: 'cups-no-lid-separate',
    hasLidIncluded: false
  },
  {
    slug: 'ripple-cups-70',
    cat: 'cold-cups',
    pages: [44, 45, 46, 47],
    refLids: [72],
    lidPolicy: 'cups-no-lid-separate',
    hasLidIncluded: false
  },
  {
    slug: 'chop-cups-73',
    cat: 'cold-cups',
    pages: [48, 49],
    refLids: [78, 79],
    lidPolicy: 'cups-no-lid-separate',
    hasLidIncluded: false
  },
  {
    slug: 'pet-cup-lids',
    cat: 'cold-cups',
    pages: [21, 22, 23, 29, 30, 41, 42],
    lidPolicy: 'standalone-lid',
    hasLidIncluded: true
  },

  // Category: sauce-cups (5 PDF families)
  {
    slug: 'oval-hinged-sauce-hst',
    cat: 'sauce-cups',
    pages: [89, 90, 91, 92],
    lidPolicy: 'built-in-hinged',
    hasLidIncluded: true
  },
  {
    slug: 'rect-hinged-sauce-rst',
    cat: 'sauce-cups',
    pages: [93, 94, 95],
    lidPolicy: 'built-in-hinged',
    hasLidIncluded: true
  },
  {
    slug: 'sauce-cups-73',
    cat: 'sauce-cups',
    pages: [74, 75, 76, 77],
    mergedLids: [78, 79],
    lidPolicy: 'cups-no-lid-separate',
    hasLidIncluded: false
  },
  {
    slug: 'sauce-cups-70',
    cat: 'sauce-cups',
    pages: [67, 68, 69, 70, 71],
    mergedLids: [72],
    lidPolicy: 'cups-no-lid-separate',
    hasLidIncluded: false
  },
  {
    slug: 'sauce-cups-62',
    cat: 'sauce-cups',
    pages: [63, 64],
    mergedLids: [65],
    lidPolicy: 'cups-no-lid-separate',
    hasLidIncluded: false
  },

  // Category: hinged-containers (14 PDF families)
  {
    slug: 'smart-hinged-shrec',
    cat: 'hinged-containers',
    pages: [135, 136, 137, 138, 139, 140],
    lidPolicy: 'built-in-hinged',
    hasLidIncluded: true
  },
  {
    slug: 'safety-hinged-sch',
    cat: 'hinged-containers',
    pages: [155, 156, 157, 158, 159, 160, 161, 162, 163, 164, 165, 166, 167, 168],
    lidPolicy: 'built-in-hinged',
    hasLidIncluded: true
  },
  {
    slug: 'turkish-lotus-hinged',
    cat: 'hinged-containers',
    pages: [150, 151, 152, 153],
    lidPolicy: 'built-in-hinged',
    hasLidIncluded: true
  },
  {
    slug: 'rect-hinged-hrec',
    cat: 'hinged-containers',
    pages: [97, 98, 99, 100, 101],
    lidPolicy: 'built-in-hinged',
    hasLidIncluded: true
  },
  {
    slug: 'large-rect-hinged-hct',
    cat: 'hinged-containers',
    pages: [102, 103, 104, 105, 106],
    lidPolicy: 'built-in-hinged',
    hasLidIncluded: true
  },
  {
    slug: 'large-square-hinged-hct',
    cat: 'hinged-containers',
    pages: [123, 124, 125, 126, 127],
    lidPolicy: 'built-in-hinged',
    hasLidIncluded: true,
    heroPageOverride: 126
  },
  {
    slug: 'bakery-hinged-hct5',
    cat: 'hinged-containers',
    pages: [128, 129],
    lidPolicy: 'built-in-hinged',
    hasLidIncluded: true
  },
  {
    slug: 'salad-hinged-hat',
    cat: 'hinged-containers',
    pages: [82, 83, 84, 85, 86, 87],
    lidPolicy: 'built-in-hinged',
    hasLidIncluded: true
  },
  {
    slug: 'modified-rect-hinged-hxct',
    cat: 'hinged-containers',
    pages: [108, 109, 110, 111, 112, 113, 114, 115],
    lidPolicy: 'built-in-hinged',
    hasLidIncluded: true
  },
  {
    slug: 'square-hinged-sh',
    cat: 'hinged-containers',
    pages: [117, 118, 119, 120, 121, 122],
    lidPolicy: 'built-in-hinged',
    hasLidIncluded: true
  },
  {
    slug: 'bulgarian-hinged-sh',
    cat: 'hinged-containers',
    pages: [130, 131, 132, 133],
    lidPolicy: 'built-in-hinged',
    hasLidIncluded: true
  },
  {
    slug: 'round-hinged-rh',
    cat: 'hinged-containers',
    pages: [142, 143, 144, 145, 146, 147, 148],
    lidPolicy: 'built-in-hinged',
    hasLidIncluded: true
  },
  {
    slug: 'secured-hinged-sbt',
    cat: 'hinged-containers',
    pages: [169, 170],
    lidPolicy: 'built-in-hinged',
    hasLidIncluded: true
  },
  {
    slug: 'produce-clamshells',
    cat: 'hinged-containers',
    pages: [172, 173, 174, 175],
    lidPolicy: 'built-in-hinged',
    hasLidIncluded: true
  },

  // Category: meal-containers (9 PDF families + 1 legacy = 10 total)
  {
    slug: 'meal-tray-rlb',
    cat: 'meal-containers',
    pages: [253, 255, 257, 259],
    mergedLids: [254, 256, 258, 260],
    lidPairs: [[253, 254], [255, 256], [257, 258], [259, 260]],
    lidPolicy: 'paired-lid-box',
    hasLidIncluded: true,
    heroMode: 'group-a',
    heroLidPage: 258,
    heroOpenPage: 257
  },
  {
    slug: 'jumbo-meal-tray-fxmc',
    cat: 'meal-containers',
    pages: [261, 263, 265],
    mergedLids: [262, 264, 266],
    lidPairs: [[261, 262], [263, 264], [265, 266]],
    lidPolicy: 'paired-lid-box',
    hasLidIncluded: true,
    heroMode: 'group-a',
    heroLidPage: 264,
    heroOpenPage: 263
  },
  {
    slug: 'small-krno-meal-kslb',
    cat: 'meal-containers',
    pages: [267, 269, 271],
    mergedLids: [268, 270, 272],
    lidPairs: [[267, 268], [269, 270], [271, 272]],
    lidPolicy: 'paired-lid-box',
    hasLidIncluded: true,
    heroMode: 'group-a',
    heroLidPage: 270,
    heroOpenPage: 269
  },
  {
    slug: 'krno-meal-slb',
    cat: 'meal-containers',
    pages: [273, 275, 277],
    mergedLids: [274, 276, 278],
    lidPairs: [[273, 274], [275, 276], [277, 278]],
    lidPolicy: 'paired-lid-box',
    hasLidIncluded: true,
    heroMode: 'group-a',
    heroLidPage: 276,
    heroOpenPage: 275
  },
  {
    slug: 'rect-microwave-mc',
    cat: 'meal-containers',
    pages: [283, 284, 285, 286, 287],
    mergedLids: [288, 289],
    lidPolicy: 'paired-lid-box',
    hasLidIncluded: true,
    heroMode: 'group-a',
    heroLidPage: 288,
    heroOpenPage: 285
  },
  {
    slug: 'vip-meal-ilb',
    cat: 'meal-containers',
    pages: [279, 280],
    lidPolicy: 'included-set',
    hasLidIncluded: true
  },
  {
    slug: 'omw-meal-tray',
    cat: 'meal-containers',
    pages: [281, 282],
    lidPolicy: 'included-set',
    hasLidIncluded: true
  },
  {
    slug: 'fridge-microwave-mw',
    cat: 'meal-containers',
    pages: [290, 291, 292],
    lidPolicy: 'included-set',
    hasLidIncluded: true
  },
  {
    slug: 'pasta-containers-smw',
    cat: 'meal-containers',
    pages: [293, 294, 295],
    lidPolicy: 'included-set',
    hasLidIncluded: true
  },

  // Category: deli-sushi-containers (5 PDF families)
  {
    slug: 'sushi-trays-ct',
    cat: 'deli-sushi-containers',
    pages: [187, 189, 191, 193, 195, 197],
    mergedLids: [188, 190, 192, 194, 196, 198],
    lidPairs: [[187, 188], [189, 190], [191, 192], [193, 194], [195, 196], [197, 198]],
    lidPolicy: 'paired-lid-box',
    hasLidIncluded: true
  },
  {
    slug: 'rect-deli-rec',
    cat: 'deli-sushi-containers',
    pages: [200, 202, 203, 204, 221, 205],
    mergedLids: [201, 206, 207],
    lidPolicy: 'paired-lid-box',
    hasLidIncluded: true
  },
  {
    slug: 'octal-deli-reca',
    cat: 'deli-sushi-containers',
    pages: [208, 210, 212, 213, 222, 223],
    mergedLids: [209, 211, 214, 224],
    lidPolicy: 'paired-lid-box',
    hasLidIncluded: true
  },
  {
    slug: 'clear-rect-brt',
    cat: 'deli-sushi-containers',
    pages: [215, 216, 217, 219],
    mergedLids: [218, 220],
    lidPolicy: 'paired-lid-box',
    hasLidIncluded: true
  },
  {
    slug: 'dairy-containers-dt',
    cat: 'deli-sushi-containers',
    pages: [226, 227, 230, 229],
    mergedLids: [228, 231],
    lidPolicy: 'paired-lid-box',
    hasLidIncluded: true
  },

  // Category: rizo-soup-bowls (6 PDF families)
  {
    slug: 'rizo-bowls-rk',
    cat: 'rizo-soup-bowls',
    pages: [296, 297, 298],
    lidPolicy: 'included-set',
    hasLidIncluded: true
  },
  {
    slug: 'versace-meal-bowls',
    cat: 'rizo-soup-bowls',
    pages: [299, 300],
    lidPolicy: 'included-set',
    hasLidIncluded: true
  },
  {
    slug: 'export-rizo-trk',
    cat: 'rizo-soup-bowls',
    pages: [301, 302, 303, 304],
    mergedLids: [305],
    lidPolicy: 'paired-lid-box',
    hasLidIncluded: true
  },
  {
    slug: 'lotus-rizo-crb-hrb',
    cat: 'rizo-soup-bowls',
    pages: [306, 307, 308, 309],
    mergedLids: [310],
    lidPolicy: 'paired-lid-box',
    hasLidIncluded: true
  },
  {
    slug: 'soup-bowls-sb',
    cat: 'rizo-soup-bowls',
    pages: [311, 312, 316, 313],
    mergedLids: [314],
    mergedDupCombos: [315, 317],
    lidPolicy: 'included-set',
    hasLidIncluded: true,
    heroPageOverride: 312
  },
  {
    slug: 'rondo-bowls-k115',
    cat: 'rizo-soup-bowls',
    pages: [318, 319, 320, 321, 322],
    mergedLids: [323],
    lidPolicy: 'paired-lid-box',
    hasLidIncluded: true
  },

  // Category: plates-serving-trays (9 PDF families + 1 legacy = 10 total)
  {
    slug: 'ps-oriental-round-trays',
    cat: 'plates-serving-trays',
    pages: [339, 340, 341, 342],
    lidPolicy: 'no-lid',
    hasLidIncluded: false,
    heroPageOverride: 341
  },
  {
    slug: 'ps-lotus-round-trays',
    cat: 'plates-serving-trays',
    pages: [334, 335, 336, 337, 338],
    lidPolicy: 'no-lid',
    hasLidIncluded: false
  },
  {
    slug: 'ps-seasonal-trays',
    cat: 'plates-serving-trays',
    pages: [343, 344, 345],
    lidPolicy: 'no-lid',
    hasLidIncluded: false
  },
  {
    slug: 'ps-plain-round-trays',
    cat: 'plates-serving-trays',
    pages: [332, 333],
    lidPolicy: 'no-lid',
    hasLidIncluded: false
  },
  {
    slug: 'absorbent-map-trays',
    cat: 'plates-serving-trays',
    pages: [250, 251],
    lidPolicy: 'no-lid',
    hasLidIncluded: false
  },
  {
    slug: 'pet-weight-plates',
    cat: 'plates-serving-trays',
    pages: [237, 236, 239, 238, 241, 240, 244, 245, 247, 248],
    mergedLids: [246],
    lidPolicy: 'no-lid',
    hasLidIncluded: false
  },
  {
    slug: 'pet-squared-plates-kdr3',
    cat: 'plates-serving-trays',
    pages: [242, 243],
    lidPolicy: 'no-lid',
    hasLidIncluded: false
  },
  {
    slug: 'sweets-plates-kda',
    cat: 'plates-serving-trays',
    pages: [233, 234],
    lidPolicy: 'no-lid',
    hasLidIncluded: false
  },
  {
    slug: 'ps-table-plate-sp28',
    cat: 'plates-serving-trays',
    pages: [235],
    lidPolicy: 'no-lid',
    hasLidIncluded: false
  },

  // Category: cutlery (6 PDF families + 2 legacy = 8 total)
  {
    slug: 'souvenir-cutlery',
    cat: 'cutlery',
    pages: [366, 367, 368, 369, 370],
    lidPolicy: 'no-lid',
    hasLidIncluded: false
  },
  {
    slug: 'lotus-souvenir-cutlery',
    cat: 'cutlery',
    pages: [371, 372, 373],
    lidPolicy: 'no-lid',
    hasLidIncluded: false
  },
  {
    slug: 'turkish-cutlery',
    cat: 'cutlery',
    pages: [361, 362, 363],
    lidPolicy: 'no-lid',
    hasLidIncluded: false
  },
  {
    slug: 'german-cutlery',
    cat: 'cutlery',
    pages: [364, 365],
    lidPolicy: 'no-lid',
    hasLidIncluded: false
  },
  {
    slug: 'dessert-icecream-spoons',
    cat: 'cutlery',
    pages: [374, 375, 376, 377, 378],
    lidPolicy: 'no-lid',
    hasLidIncluded: false
  },
  {
    slug: 'ps-cake-knife-ptsh',
    cat: 'cutlery',
    pages: [359],
    lidPolicy: 'no-lid',
    hasLidIncluded: false
  }
];

// ============================================================================
// 4. PDF ANOMALY & TYPO OVERRIDES + DETERMINISTIC SYNTHETIC SKUS (29 PAGES)
// ============================================================================
const PAGE_OVERRIDES = {
  57:  { sku: 'JC-1-100', altSkus: ['JC-1'] },
  58:  { sku: 'JC-1-200', altSkus: ['JC-1'] },
  86:  { dimensionsMm: '110 × 145 × 35 mm' },
  115: { sku: 'HXCT-2250', altSkus: ['HXCT-2000'] },
  118: { sku: 'SH-1-PET', altSkus: ['SH-1'] },
  119: { sku: 'SH-1-PP', altSkus: ['SH-1'], material: 'PP' },
  120: { sku: 'SH-1A-PET', altSkus: ['SH-1A'] },
  121: { sku: 'SH-1A-PP', altSkus: ['SH-1A'], material: 'PP' },
  123: { imagePageFallback: 126 },
  124: { imagePageFallback: 126 },
  125: { imagePageFallback: 126 },
  132: { sku: 'SH-6-850', altSkus: ['SH-6'] },
  133: { sku: 'SH-6-1000', altSkus: ['SH-6'] },
  135: { sku: 'SHREC-5A-FLAT', altSkus: ['SHREC-5A'] },
  136: { sku: 'SHREC-5A-DOME', altSkus: ['SHREC-5A'] },
  137: { sku: 'SHREC-5-FLAT', altSkus: ['SHREC-5'] },
  138: { sku: 'SHREC-5-DOME', altSkus: ['SHREC-5'] },
  139: { sku: 'SHREC-6-FLAT', altSkus: ['SHREC-6'] },
  140: { sku: 'SHREC-6-DOME', altSkus: ['SHREC-6'] },
  150: { sku: 'LOTUS-H-375', isSyntheticSku: true },
  151: { sku: 'LOTUS-H-750', isSyntheticSku: true },
  152: { sku: 'TURK-H-RECT-550', isSyntheticSku: true },
  153: { sku: 'TURK-H-RND-550', isSyntheticSku: true },
  160: { sku: 'SCH-2C-FLAT', altSkus: ['SCH-2C'] },
  161: { sku: 'SCH-2C-DOME', altSkus: ['SCH-2C'] },
  166: { sku: 'SCH-4A-FLAT', altSkus: ['SCH-4A'] },
  167: { sku: 'SCH-4A-DOME', altSkus: ['SCH-4A'], imagePageFallback: 166 },
  188: { colorKey: 'Transparent' },
  190: { colorKey: 'Transparent' },
  192: { colorKey: 'Transparent' },
  194: { colorKey: 'Transparent' },
  196: { colorKey: 'Transparent' },
  198: { colorKey: 'Transparent' },
  204: { title: 'RECTANGULAR CONTAINER 24 OZ (750ML)' },
  213: { title: 'OCTAL CONTAINER 24 OZ (750ML)' },
  229: { sku: 'DT-2-PP', altSkus: ['DT-1 PP', 'DT-2 PP'], capacity: '500 ml' },
  274: { colorKey: 'Transparent' },
  276: { colorKey: 'Transparent' },
  278: { colorKey: 'Transparent' },
  299: { sku: 'RKV-16', isSyntheticSku: true },
  300: { sku: 'RKV-22', isSyntheticSku: true },
  311: { altSkus: ['SB1/LSB'] },
  313: { altSkus: ['SB2-LSB'] },
  323: { sku: 'LSLB-115', altSkus: ['LSLB'] },
  332: { sku: 'PRT-29', isSyntheticSku: true },
  333: { sku: 'PRT-33', isSyntheticSku: true },
  343: { sku: 'ST-30-1C', isSyntheticSku: true },
  344: { sku: 'ST-30-2C', isSyntheticSku: true },
  345: { sku: 'ST-30-4C', isSyntheticSku: true },
  354: { altSkus: ['LT-2C'] },
  356: { altSkus: ['LDTT'] },
  361: { sku: 'CUT-TRK-SPN', isSyntheticSku: true },
  362: { sku: 'CUT-TRK-FRK', isSyntheticSku: true },
  363: { sku: 'CUT-TRK-KNF', isSyntheticSku: true },
  364: { sku: 'CUT-GER-SPN', isSyntheticSku: true },
  365: { sku: 'CUT-GER-FRK', isSyntheticSku: true },
  366: { sku: 'CUT-SOUV-SPN-PS', isSyntheticSku: true },
  367: { sku: 'CUT-SOUV-SPN-PP', isSyntheticSku: true },
  368: { sku: 'CUT-SOUV-FRK-PS', isSyntheticSku: true },
  369: { sku: 'CUT-SOUV-FRK-PP', isSyntheticSku: true },
  370: { sku: 'CUT-SOUV-KNF-PS', isSyntheticSku: true },
  371: { sku: 'CUT-LOT-SPN', isSyntheticSku: true },
  372: { sku: 'CUT-LOT-FRK', isSyntheticSku: true },
  373: { sku: 'CUT-LOT-KNF', isSyntheticSku: true },
  374: { sku: 'CUT-DES-TRK', isSyntheticSku: true },
  375: { sku: 'CUT-DES-GER', isSyntheticSku: true },
  376: { sku: 'CUT-ICE-SPN', isSyntheticSku: true },
  377: { sku: 'CUT-ICE-10KG', isSyntheticSku: true, packUnit: '10 KG Carton', orderUnit: 'carton', pcsPerBox: undefined },
  378: { sku: 'CUT-MINI-SPN', isSyntheticSku: true }
};

// Parse all 397 pages once
console.log('[3/8] Extracting structured specifications from all 339 non-foam PDF product pages...');
const parsedPages = new Map();
for (let pn = 1; pn <= 397; pn++) {
  if (FOAM_PAGES.has(pn)) continue;
  parsedPages.set(pn, extractPageData(pn));
}

function normalizeColor(rawColor, overrideKey) {
  if (overrideKey && i18nData.colors[overrideKey]) return i18nData.colors[overrideKey];
  const s = (rawColor || '').toUpperCase();
  const hasT = /TRANSPARENT|CLEAR/.test(s);
  const hasB = /BLACK/.test(s);
  const hasW = /WHITE/.test(s);
  const hasG = /GOLD/.test(s);
  const hasR = /RED/.test(s);
  const hasY = /YELLOW/.test(s);
  if (hasT && hasB && hasW && hasG) return i18nData.colors['Transparent, Black, White & Gold'];
  if (hasT && hasB && hasW) return i18nData.colors['Transparent, Black & White'];
  if (hasT && hasB) return i18nData.colors['Transparent & Black'];
  if (hasW && hasB && hasY) return { en: 'White / Black / Yellow', ar: 'أبيض / أسود / أصفر' };
  if (hasW && hasB) return i18nData.colors['White & Black'];
  if (hasR && hasB) return i18nData.colors['Red & Black'];
  if (hasG) return i18nData.colors['Gold'];
  if (hasB) return i18nData.colors['Black'];
  if (hasW) return i18nData.colors['White'];
  if (hasT) return i18nData.colors['Transparent'];
  return i18nData.colors['Transparent'];
}

function parseDimensionsMm(rawDim) {
  if (!rawDim) return undefined;
  const s = rawDim.replace(/\s+/g, ' ').trim();
  if (!s || /^[-]+$/.test(s)) return undefined;
  // Convert cm dimensions to mm or keep clean formatted string with cm/mm
  return s;
}

function parseWeightOrCap(midPill, titleStr) {
  const s = (midPill || '').trim();
  let weightG;
  let capacity;
  const gmM = s.match(/(\d+(?:\.\d+)?)\s*(?:GM|G)\b/i);
  if (gmM) weightG = parseFloat(gmM[1]);
  const mlM = s.match(/(\d+(?:\.\d+)?)\s*ML\b/i) || titleStr.match(/(\d+(?:\.\d+)?)\s*ML\b/i);
  if (mlM) capacity = `${mlM[1]} ml`;
  const ozM = titleStr.match(/(\d+(?:\.\d+)?)\s*OZ\b/i);
  if (ozM && capacity) capacity = `${capacity} (${ozM[1]} oz)`;
  else if (ozM) capacity = `${ozM[1]} oz`;
  return { weightG, capacity };
}

function parsePcsPerBox(rightPill) {
  const s = (rightPill || '').trim();
  if (/10\s*K\b/i.test(s)) {
    return { pcsPerBox: undefined, packUnit: '10 KG Carton', orderUnit: 'carton' };
  }
  const m = s.match(/(\d[\d,]*)/);
  if (!m) return { pcsPerBox: undefined, orderUnit: 'box' };
  const n = parseInt(m[1].replace(/,/g, ''), 10);
  return { pcsPerBox: n, orderUnit: 'box' };
}

function translateVariantTitleToAr(enTitle, sku, capacity) {
  let s = enTitle
    .replace(/\s+/g, ' ')
    .trim();
  const map = [
    [/^CLEAR CUP\s*/i, 'كوب PET شفاف '],
    [/^SMART CUP\s*/i, 'كوب سمارت شفاف '],
    [/^U-SHAPE CUP\s*/i, 'كوب U-Shape شفاف '],
    [/^TORNADO CUP\s*/i, 'كوب تورنادو شفاف '],
    [/^FLAT LID\s*/i, 'غطاء مسطح '],
    [/^DOME LID\s*/i, 'غطاء بومبيه '],
    [/^SIPPER LID\s*/i, 'غطاء سبر '],
    [/^SWEET CUP\s*/i, 'كوب حلويات '],
    [/^YOGURT CUP\s*/i, 'كوب زبادي '],
    [/^RIPPLE CUP\s*/i, 'كوب ريبل مضلع '],
    [/^CHOP CUP\s*/i, 'كوب شوب '],
    [/^SQUARE DESSERT CUP\s*/i, 'كوب حلويات مربع '],
    [/^SQUARE DESSERT FLAT LID\s*/i, 'غطاء كوب حلويات مربع مسطح '],
    [/^SQUARE DESSERT DOME LID\s*/i, 'غطاء كوب حلويات مربع بومبيه '],
    [/^JELLY CUP\s*/i, 'كوب جيلي '],
    [/^JELLY FLAT LID\s*/i, 'غطاء كوب جيلي مسطح '],
    [/^JELLY DOME LID\s*/i, 'غطاء كوب جيلي بومبيه '],
    [/^SMALL ROUND SAUCE CUP\s*/i, 'كوب صوص دائري صغير '],
    [/^SMALL ROUND SAUCE LID\s*/i, 'غطاء كوب صوص دائري صغير '],
    [/^REGULAR SAUCE CUP\s*/i, 'كوب صوص قياسي '],
    [/^CURVED SAUCE CUP\s*/i, 'كوب صوص منحني '],
    [/^SAUCE CUP LID\s*/i, 'غطاء كوب صوص '],
    [/^ROUND SAUCE CUP\s*/i, 'كوب صوص دائري '],
    [/^ROUND SAUCE DOME LID\s*/i, 'غطاء صوص دائري بومبيه '],
    [/^ROUND SAUCE FLAT LID\s*/i, 'غطاء صوص دائري مسطح '],
    [/^SALAD HINGED CONTAINER\s*/i, 'علبة سلطة بمفصلة '],
    [/^OVAL HINGED SAUCE CUP\s*/i, 'علبة صوص بيضاوية بمفصلة '],
    [/^RECTANGULAR HINGED SAUCE CUP\s*/i, 'علبة صوص مستطيلة بمفصلة '],
    [/^RECTANGULAR HINGED CONTAINER\s*/i, 'علبة مستطيلة بمفصلة '],
    [/^MODIFIED RECT\.? HINGED CONTAINER\s*/i, 'علبة مستطيلة معدلة بمفصلة '],
    [/^SQUARE HINGED CONTAINER\s*/i, 'علبة مربعة بمفصلة '],
    [/^BULGARIAN HINGED CONTAINER\s*/i, 'علبة بلغاري بمفصلة '],
    [/^SMART HINGED CONTAINER\s*/i, 'علبة سمارت بمفصلة '],
    [/^ROUND HINGED CONTAINER\s*/i, 'علبة دائرية بمفصلة '],
    [/^SMALL LOTUS HINGED CONTAINER\s*/i, 'علبة لوتس صغيرة بمفصلة '],
    [/^LARGE LOTUS HINGED CONTAINER\s*/i, 'علبة لوتس كبيرة بمفصلة '],
    [/^RECTANGULAR TURKISH HINGED CONTAINER\s*/i, 'علبة تركي مستطيلة بمفصلة '],
    [/^ROUND TURKISH HINGED CONTAINER\s*/i, 'علبة تركي دائرية بمفصلة '],
    [/^SAFETY HINGED CONTAINER\s*/i, 'علبة أمان بمفصلة '],
    [/^RECTANGULAR SECURED HINGED TRAY\s*/i, 'علبة مستطيلة محكمة الغلق '],
    [/^STRAWBERRY CONTAINER\s*/i, 'علبة فراولة مثقبة '],
    [/^GRAPES CONTAINER\s*/i, 'علبة عنب مثقبة '],
    [/^TOMATOES CONTAINER\s*/i, 'علبة طماطم شيري مثقبة '],
    [/^CHEESE CAKE TRAY\s*/i, 'علبة شريحة تشيز كيك '],
    [/^SQUARE CAKE CONTAINER\s*/i, 'قاعدة تورتة وكيك مربعة '],
    [/^SMALL SQUARE CAKE LID\s*/i, 'غطاء تورتة مربع منخفض '],
    [/^MEDIUM SQUARE CAKE LID\s*/i, 'غطاء تورتة مربع متوسط '],
    [/^HIGH SQUARE CAKE LID\s*/i, 'غطاء تورتة مربع عالي '],
    [/^SUSHI\s*/i, 'علبة سوشي '],
    [/^RECTANGULAR CONTAINER\s*/i, 'علبة دلي مستطيلة '],
    [/^RECTANGULAR LID\s*/i, 'غطاء علبة دلي مستطيلة '],
    [/^OCTAL CONTAINER\s*/i, 'علبة دلي ثمانية الأضلاع '],
    [/^OCTAL LID\s*/i, 'غطاء علبة دلي ثمانية الأضلاع '],
    [/^CLEAR RECTANGULAR CONTAINER\s*/i, 'علبة PET مستطيلة شفافة '],
    [/^CLEAR RECTANGULAR LID\s*/i, 'غطاء علبة PET مستطيلة '],
    [/^DAIRY CONTAINER\s*/i, 'علبة ألبان مربعة '],
    [/^DAIRY LID\s*/i, 'غطاء علبة ألبان مربعة '],
    [/^SWEETS PLATE\s*/i, 'طبق حلويات دائري '],
    [/^TABLE PLATE\s*/i, 'طبق سفرة دائري '],
    [/^SHALLOW PLATE\s*/i, 'طبق PET مسطح '],
    [/^DEEP PLATE\s*/i, 'طبق PET عميق '],
    [/^SQUARED SHALLOW PLATE\s*/i, 'طبق PET مربع مسطح '],
    [/^SQUARED DEEP PLATE\s*/i, 'طبق PET مربع عميق '],
    [/^PLATE LID\s*/i, 'غطاء طبق PET '],
    [/^ULTRA-ABSORBENT TRAY\s*/i, 'طبق امتصاص سوائل MAP '],
    [/^MEAL TRAY LID\s*/i, 'غطاء علبة وجبات '],
    [/^MEAL TRAY\s*/i, 'علبة وجبات '],
    [/^MEDIUM JUMBO MEAL TRAY LID\s*/i, 'غطاء علبة وجبات جامبو '],
    [/^MEDIUM JUMBO MEAL TRAY\s*/i, 'علبة وجبات جامبو '],
    [/^SMALL KRNO MEAL TRAY LID\s*/i, 'غطاء علبة وجبات كرنو صغيرة '],
    [/^SMALL KRNO MEAL TRAY\s*/i, 'علبة وجبات كرنو صغيرة '],
    [/^KRNO MEAL TRAY LID\s*/i, 'غطاء علبة وجبات كرنو '],
    [/^KRNO MEAL TRAY\s*/i, 'علبة وجبات كرنو '],
    [/^VIP MEAL TRAY\s*/i, 'علبة وجبات VIP بالغطاء '],
    [/^RECTANGULAR MEAL TRAY\s*/i, 'علبة مايكروويف مستطيلة '],
    [/^EMBOSSED DOME MEAL TRAY LID\s*/i, 'غطاء مايكروويف مستطيل بومبيه '],
    [/^PLAIN FLAT MEAL TRAY LID\s*/i, 'غطاء مايكروويف مستطيل مسطح '],
    [/^FRIDGE & MICROWAVE CONTAINER\s*/i, 'علبة ثلاجة ومايكروويف بالغطاء '],
    [/^PASTA CONTAINER\s*/i, 'علبة باستا مربعة بالغطاء '],
    [/^SMALL RIZO BOWL\s*/i, 'بولة ريزو صغيرة بالغطاء '],
    [/^MEDIUM RIZO BOWL\s*/i, 'بولة ريزو متوسطة بالغطاء '],
    [/^LARGE RIZO BOWL\s*/i, 'بولة ريزو كبيرة بالغطاء '],
    [/^SMALL VERSACE MEAL TRAY\s*/i, 'بولة فيرساتشي صغيرة بالغطاء '],
    [/^MEDIUM VERSACE MEAL TRAY\s*/i, 'بولة فيرساتشي متوسطة بالغطاء '],
    [/^EXPORT RIZO BOWL\s*/i, 'بولة ريزو تصدير '],
    [/^EXPORT RIZO LID\s*/i, 'غطاء بولة ريزو تصدير '],
    [/^COLD RIZO BOWL\s*/i, 'بولة لوتس باردة PET '],
    [/^HOT RIZO BOWL\s*/i, 'بولة لوتس ساخنة PP '],
    [/^LOTUS RIZO LID\s*/i, 'غطاء بولة لوتس '],
    [/^SMALL SOUP BOWL\s*/i, 'بولة شوربة صغيرة '],
    [/^MEDIUM SOUP BOWL\s*/i, 'بولة شوربة متوسطة '],
    [/^LARGE SOUP BOWL\s*/i, 'بولة شوربة كبيرة '],
    [/^SOUP BOWL LID\s*/i, 'غطاء بولة شوربة '],
    [/^RONDO BOWL\s*/i, 'بولة روندو دائرية '],
    [/^RIPPLED RONDO BOWL\s*/i, 'بولة روندو مضلعة '],
    [/^RONDO LID\s*/i, 'غطاء بولة روندو '],
    [/^VIP ICE CUP\s*/i, 'كوب آيس كريم VIP بالغطاء '],
    [/^CRYSTAL BOWL\s*/i, 'بولة كريستال بالغطاء '],
    [/^WAVY DESSERT BOWL\s*/i, 'بولة حلويات كريستال مموجة '],
    [/^MINI CAKE CUP\s*/i, 'كوب ميني كيك كريستال '],
    [/^ICE DESSERT BOWL\s*/i, 'بولة آيس كريم وحلويات كريستال '],
    [/^PLAIN ROUND TRAY\s*/i, 'صينية تقديم دائرية سادة '],
    [/^LOTUS ROUND TRAY\s*/i, 'صينية تقديم لوتس دائرية '],
    [/^ORIENTAL ROUND TRAY\s*/i, 'صينية تقديم شرقي دائرية '],
    [/^SEASONAL TRAY\s*/i, 'صينية تقديم موسمية '],
    [/^SMALL RECTANGULAR DESSERT TRAY\s*/i, 'صينية حلويات مستطيلة صغيرة بالغطاء '],
    [/^LARGE RECTANGULAR DESSERT TRAY\s*/i, 'صينية حلويات مستطيلة كبيرة بالغطاء '],
    [/^SQUARE TURKY TRAY\s*/i, 'صينية حلويات تركي مربعة بالغطاء '],
    [/^RECTANGULAR TURKY TRAY\s*/i, 'صينية حلويات تركي مستطيلة بالغطاء '],
    [/^TURKY TRAY\s*/i, 'صينية حلويات تركي عائلية بالغطاء '],
    [/^DUET TRAY\s*/i, 'صينية حلويات دويت مقسمة بالغطاء '],
    [/^SMALL DUET TRAY\s*/i, 'صينية حلويات دويت صغيرة مقسمة بالغطاء '],
    [/^OVAL BOWL TRAY\s*/i, 'بولة حلويات بيضاوية بالغطاء '],
    [/^LARGE OVAL BOWL TRAY\s*/i, 'بولة حلويات بيضاوية كبيرة بالغطاء '],
    [/^MINI ICE CREAM CUP\s*/i, 'كوب ميني آيس كريم كريستال '],
    [/^CAKE KNIFE\s*/i, 'سكين تقطيع وتقديم الكيك كريستال '],
    [/^TURKISH MEAL SPOON\s*/i, 'ملعقة وجبات تركي '],
    [/^TURKISH MEAL FORK\s*/i, 'شوكة وجبات تركي '],
    [/^TURKISH MEAL KNIFE\s*/i, 'سكين وجبات تركي '],
    [/^GERMAN MEAL SPOON\s*/i, 'ملعقة وجبات ألماني '],
    [/^GERMAN MEAL FORK\s*/i, 'شوكة وجبات ألماني '],
    [/^SOUVENIR MEAL SPOON\s*/i, 'ملعقة وجبات سوفنير '],
    [/^SOUVENIR MEAL FORK\s*/i, 'شوكة وجبات سوفنير '],
    [/^SOUVENIR MEAL KNIFE\s*/i, 'سكين وجبات سوفنير '],
    [/^LOTUS SOUVENIR MEAL SPOON\s*/i, 'ملعقة وجبات لوتس سوفنير '],
    [/^LOTUS SOUVENIR MEAL FORK\s*/i, 'شوكة وجبات لوتس سوفنير '],
    [/^LOTUS SOUVENIR MEAL KNIFE\s*/i, 'سكين وجبات لوتس سوفنير '],
    [/^TURKISH DESSERT SPOON\s*/i, 'ملعقة حلويات تركي '],
    [/^GERMAN DESSERT SPOON\s*/i, 'ملعقة حلويات ألماني '],
    [/^ICE CREAM SPOON\s*/i, 'ملعقة آيس كريم '],
    [/^MINI SPOON\s*/i, 'ملعقة ميني تذوق ']
  ];
  for (const [re, arPrefix] of map) {
    if (re.test(s)) {
      s = s.replace(re, arPrefix);
      break;
    }
  }
  s = s
    .replace(/\+\s*LID/gi, 'بالغطاء')
    .replace(/-\s*1\s*SECTION/gi, '— قسم واحد')
    .replace(/-\s*2\s*SECTIONS?/gi, '— قسمان')
    .replace(/-\s*3\s*SECTIONS?/gi, '— 3 أقسام')
    .replace(/-\s*4\s*SECTIONS?/gi, '— 4 أقسام')
    .replace(/\b1\s*SECTION\b/gi, 'قسم واحد')
    .replace(/\b2\s*SECTIONS?\b/gi, 'قسمان')
    .replace(/\b4\s*SECTIONS?\b/gi, '4 أقسام')
    .replace(/\bFLAT\b/gi, 'مسطح')
    .replace(/\bDOME\b/gi, 'بومبيه')
    .replace(/\bOZ\b/gi, 'أونصة')
    .replace(/\bML\b/gi, 'مل')
    .replace(/\bGM\b/gi, 'جم');
  return s.trim() || `${sku}${capacity ? ' — ' + capacity : ''}`;
}

// ============================================================================
// 5. IMAGE GENERATION HELPERS (PRODUCT WEBP, ASSEMBLED CAKE COMPOSITE, OG JPEG)
// ============================================================================
async function writeProductWebpFromSource(srcPngPath, outRelPath, maxDim = 800) {
  const absOut = path.join( SITE_ROOT, 'public', outRelPath.replace(/^\//, '') );
  await sharp(srcPngPath)
    .resize({ width: maxDim, height: maxDim, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 85 })
    .toFile(absOut);
  const { backdrop } = await detectImageBackdrop(absOut);
  return { webpPath: outRelPath, backdrop };
}

async function writeOgJpegFromWebp(srcWebpRelPath, slug, backdrop) {
  const absSrc = path.join(SITE_ROOT, 'public', srcWebpRelPath.replace(/^\//, ''));
  const relOg = `/images/og/${slug}.jpg`;
  const absOg = path.join(DIR_OG, `${slug}.jpg`);
  const bg = backdrop === 'dark' ? { r: 5, g: 6, b: 8 } : { r: 255, g: 255, b: 255 };
  await sharp(absSrc)
    .resize({ width: 1200, height: 630, fit: 'contain', background: bg })
    .flatten({ background: bg })
    .jpeg({ quality: 82, mozjpeg: true })
    .toFile(absOg);
  return relOg;
}

async function generateAssembledSquareCakeHero() {
  const p179 = parsedPages.get(179);
  const p182 = parsedPages.get(182);
  const basePng = await decodePdfImageObjectToPng(p179.primaryImage.obj);
  const domePng = await decodePdfImageObjectToPng(p182.primaryImage.obj);

  async function findBounds(filePath, isDarkBg) {
    const { data, info } = await sharp(filePath).raw().toBuffer({ resolveWithObject: true });
    const { width: w, height: h, channels: ch } = info;
    let minX = w, minY = h, maxX = 0, maxY = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * ch;
        const lum = (data[i] + data[i + 1] + data[i + 2]) / 3;
        const fg = isDarkBg ? lum > 24 : lum < 140;
        if (fg) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    return { w, h, minX, minY, maxX, maxY, bw: maxX - minX + 1, bh: maxY - minY + 1 };
  }

  const bBase = await findBounds(basePng, false);
  const bDome = await findBounds(domePng, true);
  const W = 1000, H = 750;

  const baseCropBuf = await sharp(basePng)
    .extract({ left: bBase.minX, top: bBase.minY, width: bBase.bw, height: bBase.bh })
    .flop()
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { data: bd, info: bi } = baseCropBuf;
  for (let i = 0; i < bd.length; i += 4) {
    const r = bd[i], g = bd[i + 1], b = bd[i + 2];
    const lum = (r + g + b) / 3;
    let alpha = 255;
    if (lum > 145) alpha = 0;
    else if (lum > 115) alpha = Math.round(((145 - lum) / 30) * 255);
    bd[i + 3] = alpha;
    if (alpha > 0) {
      bd[i]     = Math.min(255, Math.round(r * 1.15 + 12));
      bd[i + 1] = Math.min(255, Math.round(g * 1.15 + 13));
      bd[i + 2] = Math.min(255, Math.round(b * 1.18 + 16));
    }
  }

  const domePad = 24;
  const dLeft = Math.max(0, bDome.minX - domePad);
  const dTop = Math.max(0, bDome.minY - domePad);
  const dW = Math.min(bDome.w - dLeft, bDome.bw + domePad * 2);
  const dH = Math.min(bDome.h - dTop, bDome.bh + domePad * 2);

  const domeResized = await sharp(domePng)
    .extract({ left: dLeft, top: dTop, width: dW, height: dH })
    .resize({ width: 760, height: 580, fit: 'inside' })
    .toBuffer({ resolveWithObject: true });

  const scaleD = domeResized.info.width / dW;
  const domeActualW = Math.round(bDome.bw * scaleD);
  const domeX = Math.round((W - domeResized.info.width) / 2);
  const domeY = Math.round((H - domeResized.info.height) / 2) - 10;
  const domeBottomY = domeY + Math.round((bDome.maxY - dTop) * scaleD);

  const baseTargetW = Math.round(domeActualW * 0.995);
  const baseTargetH = Math.round(domeActualW * 0.25);
  const baseReady = await sharp(bd, { raw: { width: bi.width, height: bi.height, channels: 4 } })
    .resize(baseTargetW, baseTargetH, { fit: 'fill' })
    .png()
    .toBuffer();

  const bgSvg = Buffer.from(`
  <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="floorGlow" cx="50%" cy="76%" r="44%" fx="50%" fy="76%">
        <stop offset="0%" stop-color="#1E2330" stop-opacity="0.55"/>
        <stop offset="55%" stop-color="#0D1017" stop-opacity="0.25"/>
        <stop offset="100%" stop-color="#050608" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="#050608"/>
    <ellipse cx="${W / 2}" cy="${domeBottomY + 4}" rx="${Math.round(domeActualW * 0.52)}" ry="54" fill="url(#floorGlow)"/>
  </svg>
  `);

  const baseX = Math.round((W - baseTargetW) / 2) - 4;
  const baseY = domeBottomY - Math.round(baseTargetH * 0.88);

  const prodRel = '/images/products/square-cake-gt.webp';
  const heroRel = '/images/hero/hero-cake-gt250.webp';
  const rawCompPng = await sharp(bgSvg)
    .composite([
      { input: baseReady, left: baseX, top: baseY, blend: 'over' },
      { input: domeResized.data, left: domeX, top: domeY, blend: 'screen' }
    ])
    .png()
    .toBuffer();

  const compositeBuf = await sharp(rawCompPng)
    .resize({ width: 800, height: 800, fit: 'inside' })
    .webp({ quality: 88 })
    .toBuffer();

  fs.writeFileSync(path.join(DIR_PRODUCTS, 'square-cake-gt.webp'), compositeBuf);
  fs.writeFileSync(path.join(DIR_HERO, 'hero-cake-gt250.webp'), compositeBuf);

  // Also write openImage (P179 standalone black waffle base on white)
  const openRes = await writeProductWebpFromSource(basePng, '/images/products/square-cake-gt-open.webp');
  return {
    webpPath: prodRel,
    backdrop: 'dark',
    openWebpPath: openRes.webpPath,
    openBackdrop: openRes.backdrop,
    heroWebpPath: heroRel
  };
}

// ============================================================================
// 6. BUILD ALL 74 NON-FOAM PDF FAMILIES + EXTRACT IMAGES
// ============================================================================
console.log('[4/8] Decoding PDF images & building 74 PDF product families...');

// Pre-decode all unique PDF image objects needed across non-foam pages using 6 parallel workers
const uniqueImgObjs = new Map();
for (const [pn, pd] of parsedPages.entries()) {
  if (pd.primaryImage) uniqueImgObjs.set(pd.primaryImage.objId, pd.primaryImage.obj);
}
const objList = [...uniqueImgObjs.values()];
const CONCURRENCY = 6;
let idxCursor = 0;
async function runDecodeWorker() {
  while (idxCursor < objList.length) {
    const myIdx = idxCursor++;
    await decodePdfImageObjectToPng(objList[myIdx]);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, () => runDecodeWorker()));
console.log(`  Decoded ${objList.length} unique non-foam PDF image XObjects into cache.`);

// Helper to build a LidSpec from a PDF lid page
const lidImageCache = new Map();
async function buildLidSpecFromPage(lidPageNum, familySlug) {
  const pd = parsedPages.get(lidPageNum);
  const ov = PAGE_OVERRIDES[lidPageNum] || {};
  const rawCode = pd.specs.code.replace(/\s*-\s*/g, '-').replace(/\s+/g, ' ').trim();
  const sku = ov.sku || ((rawCode && !/^[-]+$/.test(rawCode)) ? rawCode : `LID-P${lidPageNum}`);
  const matRaw = (ov.material || pd.pills.left || 'PET').toUpperCase();
  const material = (['PET', 'PP', 'PS'].includes(matRaw) ? matRaw : 'PET');
  const { weightG } = parseWeightOrCap(pd.pills.mid, pd.title);
  const { pcsPerBox } = parsePcsPerBox(pd.pills.right);
  const dimensionsMm = ov.dimensionsMm || parseDimensionsMm(pd.specs.dimensions);
  const cartonSizeCm = parseDimensionsMm(pd.specs.cartonSize);
  const cbmNum = parseFloat(pd.specs.cbm);
  const cbm = Number.isFinite(cbmNum) ? cbmNum : undefined;
  const color = normalizeColor(pd.specs.color, ov.colorKey);

  let lidWebp, lidBackdrop;
  const cacheKey = `${pd.primaryImage?.objId || lidPageNum}`;
  if (lidImageCache.has(cacheKey)) {
    ({ webpPath: lidWebp, backdrop: lidBackdrop } = lidImageCache.get(cacheKey));
  } else if (pd.primaryImage) {
    const srcPng = await decodePdfImageObjectToPng(pd.primaryImage.obj);
    const safeSku = sku.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const rel = `/images/products/lid-${safeSku}-p${lidPageNum}.webp`;
    const res = await writeProductWebpFromSource(srcPng, rel, 640);
    lidWebp = res.webpPath;
    lidBackdrop = res.backdrop;
    lidImageCache.set(cacheKey, res);
  }

  return {
    sku,
    label: {
      en: `${pd.title} (${sku})`,
      ar: `${translateVariantTitleToAr(pd.title, sku)} (${sku})`
    },
    material,
    dimensionsMm,
    weightG,
    pcsPerBox,
    cartonSizeCm,
    cbm,
    color,
    image: lidWebp,
    photoBackdrop: lidBackdrop,
    pdfPage: lidPageNum
  };
}

const allFamilies = [];
const pageWebpCache = new Map();

async function getPageWebp(pageNum, outNameHint) {
  const ov = PAGE_OVERRIDES[pageNum] || {};
  const effPage = ov.imagePageFallback || pageNum;
  const pd = parsedPages.get(effPage);
  if (!pd?.primaryImage) throw new Error(`No image on page ${effPage}`);
  const objId = pd.primaryImage.objId;
  if (pageWebpCache.has(objId) && !outNameHint) {
    return pageWebpCache.get(objId);
  }
  const srcPng = await decodePdfImageObjectToPng(pd.primaryImage.obj);
  const rel = outNameHint || `/images/products/p${String(effPage).padStart(3, '0')}-obj${objId}.webp`;
  const res = await writeProductWebpFromSource(srcPng, rel, 800);
  if (!outNameHint) pageWebpCache.set(objId, res);
  return res;
}

for (const famDef of PDF_FAMILIES) {
  const i18nFam = i18nData.families[famDef.slug];
  if (!i18nFam) throw new Error(`Missing i18n entry for family: ${famDef.slug}`);

  // Build lid specs from mergedLids and refLids
  const mergedLidSpecs = [];
  const seenLidSkusInFam = new Set();
  for (const lpn of (famDef.mergedLids || [])) {
    const ls = await buildLidSpecFromPage(lpn, famDef.slug);
    // Deduplicate P211 (duplicate of P209 LREC-A) inside compatibleLids while still accounting for P211
    if (!seenLidSkusInFam.has(ls.sku)) {
      seenLidSkusInFam.add(ls.sku);
      mergedLidSpecs.push(ls);
    }
  }
  const refLidSpecs = [];
  for (const rpn of (famDef.refLids || [])) {
    const ls = await buildLidSpecFromPage(rpn, famDef.slug);
    if (!seenLidSkusInFam.has(ls.sku)) {
      seenLidSkusInFam.add(ls.sku);
      refLidSpecs.push(ls);
    }
  }

  // Pair map for 1:1 base-to-lid pairs (RLB, FXMC, KSLB, SLB, Sushi CT)
  const pairMap = new Map(famDef.lidPairs || []);

  // Build family hero image + optional openImage
  let heroImage, heroBackdrop, openImage, openImageBackdrop;
  const gallery = [];

  if (famDef.heroMode === 'cake-composite') {
    const cakeHero = await generateAssembledSquareCakeHero();
    heroImage = cakeHero.webpPath;
    heroBackdrop = cakeHero.backdrop;
    openImage = cakeHero.openWebpPath;
    openImageBackdrop = cakeHero.openBackdrop;
    gallery.push(
      { src: heroImage, backdrop: heroBackdrop, label: { en: 'Assembled GT-250 Cake Box + HLGT-250 High Dome', ar: 'علبة التورتة المربعة كاملة بالقاعدة والغطاء البومبيه العالي' } },
      { src: openImage, backdrop: openImageBackdrop, label: { en: 'GT-250 Black Anti-Slip Waffle Base', ar: 'قاعدة التورتة السوداء المضلعة المانعة للانزلاق (GT-250)' } }
    );
    for (const ls of mergedLidSpecs) {
      if (ls.image && ls.photoBackdrop) {
        gallery.push({ src: ls.image, backdrop: ls.photoBackdrop, label: ls.label });
      }
    }
  } else if (famDef.heroMode === 'dc200-tiramisu') {
    const tiramisuSrc = path.join(UPACK_FILES_ROOT, 'DC 200', 'Plastic_container_filled_with_ti…_20260930132002.jpg');
    const heroRes = await writeProductWebpFromSource(tiramisuSrc, `/images/products/${famDef.slug}.webp`, 800);
    await writeProductWebpFromSource(tiramisuSrc, '/images/hero/hero-dessert-dc200.webp', 800);
    const pdfOpenRes = await getPageWebp(326, `/images/products/${famDef.slug}-open.webp`);
    heroImage = heroRes.webpPath;
    heroBackdrop = heroRes.backdrop;
    openImage = pdfOpenRes.webpPath;
    openImageBackdrop = pdfOpenRes.backdrop;
    gallery.push(
      { src: heroImage, backdrop: heroBackdrop, label: { en: 'DC-200 Crystal Bowl with Lid — Tiramisu Presentation', ar: 'بولة DC-200 الكريستال بالغطاء — عرض تقديم التيراميسو' } },
      { src: openImage, backdrop: openImageBackdrop, label: { en: 'DC-200 Empty Crystal Bowl & Lid Studio View', ar: 'بولة DC-200 الكريستال الفارغة مع الغطاء' } }
    );
  } else if (famDef.heroMode === 'group-a') {
    const closedRes = await getPageWebp(famDef.heroLidPage, `/images/products/${famDef.slug}.webp`);
    const openRes = await getPageWebp(famDef.heroOpenPage, `/images/products/${famDef.slug}-open.webp`);
    heroImage = closedRes.webpPath;
    heroBackdrop = closedRes.backdrop;
    openImage = openRes.webpPath;
    openImageBackdrop = openRes.backdrop;
    gallery.push(
      { src: heroImage, backdrop: heroBackdrop, label: { en: 'Closed Container with Snap-Fit Clear Lid', ar: 'العلبة مغلقة بالغطاء الشفاف المحكم' } },
      { src: openImage, backdrop: openImageBackdrop, label: { en: 'Open Container Interior & Compartments', ar: 'العلبة مفتوحة وتقسيمات القاعدة من الداخل' } }
    );
  } else {
    const heroPage = famDef.heroPageOverride || famDef.pages[0];
    const hRes = await getPageWebp(heroPage, `/images/products/${famDef.slug}.webp`);
    heroImage = hRes.webpPath;
    heroBackdrop = hRes.backdrop;
  }

  // Build display variants from famDef.pages
  const variants = [];
  const materialsSet = new Set();

  for (const pn of famDef.pages) {
    const pd = parsedPages.get(pn);
    const ov = PAGE_OVERRIDES[pn] || {};
    const rawCode = pd.specs.code.replace(/\s*-\s*/g, '-').replace(/\s+/g, ' ').trim();
    const isBlankCode = !rawCode || /^[-]+$/.test(rawCode);
    const sku = ov.sku || (isBlankCode ? `UP-P${pn}` : rawCode);
    const isSyntheticSku = Boolean(ov.isSyntheticSku || isBlankCode);

    const matRaw = (ov.material || pd.pills.left || 'PET').toUpperCase();
    const matCode = (['PET', 'PP', 'PS'].includes(matRaw) ? matRaw : 'PET');
    materialsSet.add(matCode);

    const parsedWC = parseWeightOrCap(pd.pills.mid, pd.title);
    const capacity = ov.capacity || parsedWC.capacity;
    const weightG = parsedWC.weightG;

    const parsedBox = parsePcsPerBox(pd.pills.right);
    const pcsPerBox = 'pcsPerBox' in ov ? ov.pcsPerBox : parsedBox.pcsPerBox;
    const orderUnit = ov.orderUnit || parsedBox.orderUnit;
    const packUnit = ov.packUnit || parsedBox.packUnit;

    const dimensionsMm = ov.dimensionsMm || parseDimensionsMm(pd.specs.dimensions);
    const cartonSizeCm = parseDimensionsMm(pd.specs.cartonSize);
    const cbmNum = parseFloat(pd.specs.cbm);
    const cbm = Number.isFinite(cbmNum) ? cbmNum : undefined;
    const color = normalizeColor(pd.specs.color, ov.colorKey);
    const cleanEnTitle = ov.title || pd.title;

    // Determine variant image & openImage + paired lid SKU
    let varImg = heroImage;
    let varBackdrop = heroBackdrop;
    let varOpenImg = openImage;
    let lidSku;
    let lidSpecsText;

    if (pairMap.has(pn)) {
      const lidPn = pairMap.get(pn);
      const lidSpec = mergedLidSpecs.find(l => l.pdfPage === lidPn) || mergedLidSpecs[0];
      if (lidSpec) {
        lidSku = lidSpec.sku;
        lidSpecsText = {
          en: `Matching Lid ${lidSpec.sku} (${lidSpec.pcsPerBox || 600} pcs/box)`,
          ar: `الغطاء المتوافق ${lidSpec.sku} (${lidSpec.pcsPerBox || 600} قطعة/كرتونة)`
        };
      }
      if (famDef.heroMode === 'group-a') {
        const closedV = await getPageWebp(lidPn);
        const openV = await getPageWebp(pn);
        varImg = closedV.webpPath;
        varBackdrop = closedV.backdrop;
        varOpenImg = openV.webpPath;
      } else {
        const baseV = await getPageWebp(pn);
        varImg = baseV.webpPath;
        varBackdrop = baseV.backdrop;
      }
    } else if (famDef.slug === 'rect-microwave-mc') {
      lidSku = 'LMC-04 / LMC-03';
      lidSpecsText = {
        en: 'Fits LMC-04 Embossed Dome Lid or LMC-03 Plain Flat Lid (500 pcs/box)',
        ar: 'يتوافق مع الغطاء البومبيه LMC-04 أو المسطح LMC-03 (500 غطاء/كرتونة)'
      };
      const openV = await getPageWebp(pn);
      varImg = heroImage;
      varBackdrop = heroBackdrop;
      varOpenImg = openV.webpPath;
    } else if (famDef.slug === 'square-cake-gt') {
      lidSku = pn === 179 ? 'SLGT-250 / MLGT-250 / HLGT-250' : 'SLGT-280 / MLGT-280';
      lidSpecsText = pn === 179
        ? { en: 'Compatible 25×25 Dome Lids: SLGT-250 (8cm), MLGT-250 (10cm), HLGT-250 (13cm)', ar: 'الأغطية البومبيه المتوافقة (25×25): ارتفاع 8 سم (SLGT-250)، 10 سم (MLGT-250)، 13 سم (HLGT-250)' }
        : { en: 'Compatible 28×28 Dome Lids: SLGT-280 (8.5cm), MLGT-280 (10.5cm)', ar: 'الأغطية البومبيه المتوافقة (28×28): ارتفاع 8.5 سم (SLGT-280)، 10.5 سم (MLGT-280)' };
      varImg = heroImage;
      varBackdrop = heroBackdrop;
      varOpenImg = openImage;
    } else {
      const vRes = await getPageWebp(pn);
      varImg = vRes.webpPath;
      varBackdrop = vRes.backdrop;
      if (mergedLidSpecs.length === 1 && famDef.lidPolicy === 'paired-lid-box') {
        lidSku = mergedLidSpecs[0].sku;
        lidSpecsText = {
          en: `Matching Lid ${mergedLidSpecs[0].sku} (${mergedLidSpecs[0].pcsPerBox || ''} pcs/box)`,
          ar: `الغطاء المتوافق ${mergedLidSpecs[0].sku} (${mergedLidSpecs[0].pcsPerBox || ''} قطعة/كرتونة)`
        };
      } else if (mergedLidSpecs.length > 1 && famDef.lidPolicy === 'paired-lid-box') {
        lidSku = mergedLidSpecs.map(l => l.sku).join(' / ');
      }
    }

    // Add distinct variant photo to family gallery if not already present
    if (!gallery.some(g => g.src === varImg)) {
      gallery.push({
        src: varImg,
        backdrop: varBackdrop,
        label: {
          en: `${cleanEnTitle} (${sku})`,
          ar: `${translateVariantTitleToAr(cleanEnTitle, sku, capacity)} (${sku})`
        }
      });
    }

    variants.push({
      sku,
      ...(ov.altSkus ? { altSkus: ov.altSkus } : {}),
      ...(isSyntheticSku ? { isSyntheticSku: true } : {}),
      label: {
        en: `${cleanEnTitle}${capacity && !cleanEnTitle.toLowerCase().includes(capacity.toLowerCase().split(' ')[0]) ? ' — ' + capacity : ''}`,
        ar: translateVariantTitleToAr(cleanEnTitle, sku, capacity)
      },
      ...(capacity ? { capacity } : {}),
      ...(dimensionsMm ? { dimensionsMm } : {}),
      ...(weightG ? { weightG } : {}),
      ...(pcsPerBox ? { pcsPerBox, pcsPerCarton: pcsPerBox } : {}),
      orderUnit,
      ...(packUnit ? { packUnit } : {}),
      ...(cartonSizeCm ? { cartonSizeCm } : {}),
      ...(cbm ? { cbm } : {}),
      color,
      ...(lidSku ? { lidSku } : {}),
      ...(lidSpecsText ? { lidSpecs: lidSpecsText } : {}),
      image: varImg,
      ...(varOpenImg ? { openImage: varOpenImg } : {}),
      photoBackdrop: varBackdrop,
      pdfPage: pn
    });
  }

  // Generate 1200x630 OG JPEG for WhatsApp rich link preview
  const ogImage = await writeOgJpegFromWebp(heroImage, famDef.slug, heroBackdrop);

  // Assign separateLidOptions vs compatibleLids based on lidPolicy
  const allLidsForFam = [...mergedLidSpecs, ...refLidSpecs];
  const isCupSeparate = famDef.lidPolicy === 'cups-no-lid-separate';

  allFamilies.push({
    slug: famDef.slug,
    category: famDef.cat,
    source: 'pdf',
    name: { en: i18nFam.en, ar: i18nFam.ar },
    subtitle: { en: i18nFam.subEn, ar: i18nFam.subAr },
    description: { en: i18nFam.descEn, ar: i18nFam.descAr },
    material: [...materialsSet],
    image: heroImage,
    ogImage,
    ...(openImage ? { openImage, openImageBackdrop } : {}),
    ...(gallery.length > 1 ? { gallery } : {}),
    photoBackdrop: heroBackdrop,
    ...(i18nFam.featured ? { featured: true } : {}),
    ...(i18nFam.isDessertFeatured ? { isDessertFeatured: true, dessertGroup: i18nFam.dessertGroup } : {}),
    hasLidIncluded: famDef.hasLidIncluded,
    lidPolicy: famDef.lidPolicy,
    ...(!isCupSeparate && allLidsForFam.length ? { compatibleLids: allLidsForFam } : {}),
    ...(isCupSeparate && allLidsForFam.length ? { separateLidOptions: allLidsForFam } : {}),
    tags: [
      famDef.cat,
      ...materialsSet,
      ...variants.map(v => v.sku),
      ...allLidsForFam.map(l => l.sku)
    ],
    variants
  });
}

// ============================================================================
// 7. MERGE THE 9 UNIQUE LEGACY FAMILIES (26 SKUS — 100% SELF-HOSTED LOCAL WEBP)
// ============================================================================
console.log('[5/8] Fetching/caching legacy images & building 9 unique legacy product families (26 SKUs)...');

async function resolveLegacySourceImage(localCandidatePaths, remoteUrl, cacheFilename) {
  for (const p of localCandidatePaths) {
    if (p && fs.existsSync(p)) return p;
  }
  const cachedFile = path.join(LEGACY_CACHE, cacheFilename);
  if (fs.existsSync(cachedFile)) return cachedFile;
  if (remoteUrl) {
    const res = await fetch(remoteUrl);
    if (!res.ok) throw new Error(`Failed to fetch legacy image ${remoteUrl}: ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(cachedFile, buf);
    return cachedFile;
  }
  throw new Error(`No local or remote image source for ${cacheFilename}`);
}

const LEGACY_FAMILIES_DEF = [
  {
    slug: 'chicken-trays-cht10',
    cat: 'meal-containers',
    material: ['PP', 'PET'],
    lidPolicy: 'included-set',
    hasLidIncluded: true,
    variants: [
      {
        sku: 'CHT-10XBlack',
        label: { en: 'Oval Chicken Tray with Clear Dome Lid — Black', ar: 'علبة دجاج مشوي بيضاوية بالغطاء البومبيه — أسود' },
        color: i18nData.colors['Black'],
        orderUnit: 'box',
        srcLocal: [path.join(UPACK_FILES_ROOT, 'resrauant', 'counteinrs', '51PjutBL2AL._AC_SX679_.jpg')],
        srcRemote: 'https://m.media-amazon.com/images/I/51PjutBL2AL._AC_SX679_.jpg',
        cacheName: 'cht10-black.jpg'
      },
      {
        sku: 'CHT-10XWhite',
        label: { en: 'Oval Chicken Tray with Clear Dome Lid — White', ar: 'علبة دجاج مشوي بيضاوية بالغطاء البومبيه — أبيض' },
        color: i18nData.colors['White'],
        orderUnit: 'box',
        srcLocal: [path.join(CATALOG_ROOT, 'assets', 'products', 'CHT-10XWhite.jpg')],
        cacheName: 'cht10-white.jpg'
      }
    ]
  },
  {
    slug: 'ps-rect-serving-trays-st',
    cat: 'plates-serving-trays',
    material: ['PS'],
    lidPolicy: 'no-lid',
    hasLidIncluded: false,
    variants: [
      {
        sku: 'ST1X1',
        label: { en: 'PS Rectangular Serving Tray — Size 1 (ST1)', ar: 'صينية تقديم مستطيلة PS — مقاس 1 (ST1)' },
        color: i18nData.colors['Transparent'],
        orderUnit: 'box',
        srcLocal: [],
        srcRemote: 'https://m.media-amazon.com/images/I/51-PVRWyk2L._AC_SX466_.jpg',
        cacheName: 'st1x1.jpg'
      },
      {
        sku: 'ST2X1',
        label: { en: 'PS Rectangular Serving Tray — Size 2 (ST2)', ar: 'صينية تقديم مستطيلة PS — مقاس 2 (ST2)' },
        color: i18nData.colors['Transparent'],
        orderUnit: 'box',
        srcLocal: [],
        srcRemote: 'https://m.media-amazon.com/images/I/51J2sGzCOSL._AC_SX466_.jpg',
        cacheName: 'st2x1.jpg'
      },
      {
        sku: 'ST3X1',
        label: { en: 'PS Rectangular Serving Tray — Size 3 (ST3)', ar: 'صينية تقديم مستطيلة PS — مقاس 3 (ST3)' },
        color: i18nData.colors['Transparent'],
        orderUnit: 'box',
        srcLocal: [],
        srcRemote: 'https://m.media-amazon.com/images/I/61NzMbtpN2L._AC_SX466_.jpg',
        cacheName: 'st3x1.jpg'
      }
    ]
  },
  {
    slug: 'wrapped-cutlery-napkin-pack',
    cat: 'cutlery',
    material: ['PS'],
    lidPolicy: 'no-lid',
    hasLidIncluded: false,
    variants: [
      {
        sku: 'Cutlery-Packet-BX25',
        label: { en: 'Individually Wrapped Cutlery Set with Napkin — Black', ar: 'طقم أدوات مائدة مغلف مع منديل — أسود' },
        color: i18nData.colors['Black'],
        orderUnit: 'box',
        srcLocal: [],
        srcRemote: 'https://m.media-amazon.com/images/I/51v12v+caPL._AC_SX679_.jpg',
        cacheName: 'cutlery-pack-black.jpg'
      },
      {
        sku: 'Cutlery-Packet-WX25',
        label: { en: 'Individually Wrapped Cutlery Set with Napkin — White', ar: 'طقم أدوات مائدة مغلف مع منديل — أبيض' },
        color: i18nData.colors['White'],
        orderUnit: 'box',
        srcLocal: [],
        srcRemote: 'https://m.media-amazon.com/images/I/41bCCX+lt+L._AC_SX679_.jpg',
        cacheName: 'cutlery-pack-white.jpg'
      }
    ]
  },
  {
    slug: 'ps-dessert-fork-knife',
    cat: 'cutlery',
    material: ['PS'],
    lidPolicy: 'no-lid',
    hasLidIncluded: false,
    variants: [
      {
        sku: 'HODC-201853',
        label: { en: 'Crystal Clear PS Dessert Fork', ar: 'شوكة حلويات كريستال شفافة (PS)' },
        color: i18nData.colors['Transparent'],
        orderUnit: 'box',
        srcLocal: [],
        srcRemote: 'https://m.media-amazon.com/images/I/41pdHdwELqL._AC_SY879_.jpg',
        cacheName: 'ps-dessert-fork.jpg'
      },
      {
        sku: 'HODC-205870',
        label: { en: 'Crystal Clear PS Dessert Knife', ar: 'سكين حلويات كريستال شفافة (PS)' },
        color: i18nData.colors['Transparent'],
        orderUnit: 'box',
        srcLocal: [],
        srcRemote: 'https://m.media-amazon.com/images/I/71zW5J0WRfL._AC_SX679_.jpg',
        cacheName: 'ps-dessert-knife.jpg'
      }
    ]
  },
  {
    slug: 'plastic-straws',
    cat: 'straws-accessories-bundles',
    material: ['PP'],
    lidPolicy: 'no-lid',
    hasLidIncluded: false,
    variants: [
      {
        sku: 'BLuex8mm',
        label: { en: '8mm Wide Smoothie & Beverage Straws — Blue', ar: 'شفاطات سموذي وعصائر عريضة 8 مم — أزرق' },
        dimensionsMm: 'Ø 8 mm',
        color: i18nData.colors['Blue'],
        orderUnit: 'box',
        srcLocal: [path.join(CATALOG_ROOT, 'assets', 'products', 'BLuex8mm.jpg')],
        cacheName: 'straw-blue-8mm.jpg'
      },
      {
        sku: 'Pinkx8mm',
        label: { en: '8mm Wide Smoothie & Beverage Straws — Pink', ar: 'شفاطات سموذي وعصائر عريضة 8 مم — وردي (بينك)' },
        dimensionsMm: 'Ø 8 mm',
        color: i18nData.colors['Pink'],
        orderUnit: 'box',
        srcLocal: [path.join(CATALOG_ROOT, 'assets', 'products', 'Pinkx8mm.jpg')],
        cacheName: 'straw-pink-8mm.jpg'
      },
      {
        sku: 'StrawsxLxB',
        label: { en: 'Large Drinking Straws — Black', ar: 'شفاطات مشروبات كبيرة — أسود' },
        color: i18nData.colors['Black'],
        orderUnit: 'box',
        srcLocal: [path.join(CATALOG_ROOT, 'assets', 'products', 'StrawsxLxB.jpg')],
        cacheName: 'straw-large-black.jpg'
      },
      {
        sku: 'strawsxLxBlue',
        label: { en: 'Multi-Purpose Drinking Straws — Blue', ar: 'شفاطات مشروبات متعددة الاستخدام — أزرق' },
        color: i18nData.colors['Blue'],
        orderUnit: 'box',
        srcLocal: [path.join(CATALOG_ROOT, 'assets', 'products', 'strawsxLxBlue.jpg')],
        cacheName: 'straw-large-blue.jpg'
      },
      {
        sku: 'StrawsMxc',
        label: { en: 'Large Drinking Straws — Multicolor Assortment', ar: 'شفاطات مشروبات كبيرة — ألوان متعددة' },
        color: i18nData.colors['Multicolor'],
        orderUnit: 'box',
        srcLocal: [path.join(CATALOG_ROOT, 'assets', 'products', 'StrawsMxc.jpg')],
        cacheName: 'straw-large-multi.jpg'
      }
    ]
  },
  {
    slug: 'paper-straws',
    cat: 'straws-accessories-bundles',
    material: ['Paper'],
    lidPolicy: 'no-lid',
    hasLidIncluded: false,
    variants: [
      {
        sku: 'StrawsLxC',
        label: { en: 'Eco Food-Grade Paper Drinking Straws', ar: 'شفاطات مشروبات ورقية صديقة للبيئة' },
        color: i18nData.colors['Multicolor'],
        orderUnit: 'box',
        srcLocal: [path.join(CATALOG_ROOT, 'assets', 'products', 'StrawsLxC.jpg')],
        cacheName: 'straw-paper.jpg'
      }
    ]
  },
  {
    slug: 'wooden-stirrers',
    cat: 'straws-accessories-bundles',
    material: ['Wood'],
    lidPolicy: 'no-lid',
    hasLidIncluded: false,
    variants: [
      {
        sku: 'JX-FWQY-7MAH',
        label: { en: 'Natural Birchwood Coffee & Tea Stirrers', ar: 'مقلبات قهوة وشاي خشبية طبيعية' },
        color: i18nData.colors['Natural Wood'],
        orderUnit: 'box',
        srcLocal: [],
        srcRemote: 'https://m.media-amazon.com/images/I/51xwPUrov-L._AC_SY879_.jpg',
        cacheName: 'wooden-stirrers.jpg'
      }
    ]
  },
  {
    slug: 'cups-straws-bundles',
    cat: 'straws-accessories-bundles',
    material: ['PET', 'PP'],
    lidPolicy: 'included-set',
    hasLidIncluded: true,
    variants: [
      {
        sku: 'PxDLx16oz',
        label: { en: '16 oz Clear PET Cups + Dome Lids + Pink Straws Bundle', ar: 'باقة أكواب 16 أونصة + غطاء بومبيه + شفاطات بينك' },
        capacity: '16 oz',
        color: i18nData.colors['Pink'],
        orderUnit: 'pack',
        srcLocal: [path.join(CATALOG_ROOT, 'assets', 'products', 'B0H6SV7RXQ.jpg')],
        cacheName: 'bundle-dome-pink-16.jpg'
      },
      {
        sku: 'PxDLx14oz',
        label: { en: '14 oz Clear PET Cups + Dome Lids + Pink Straws Bundle', ar: 'باقة أكواب 14 أونصة + غطاء بومبيه + شفاطات بينك' },
        capacity: '14 oz',
        color: i18nData.colors['Pink'],
        orderUnit: 'pack',
        srcLocal: [path.join(CATALOG_ROOT, 'assets', 'products', 'B0H6SV7RXQ.jpg')],
        cacheName: 'bundle-dome-pink-14.jpg'
      },
      {
        sku: 'BxDLx16oz',
        label: { en: '16 oz Clear PET Cups + Dome Lids + Blue Straws Bundle', ar: 'باقة أكواب 16 أونصة + غطاء بومبيه + شفاطات أزرق' },
        capacity: '16 oz',
        color: i18nData.colors['Blue'],
        orderUnit: 'pack',
        srcLocal: [
          path.join(UPACK_FILES_ROOT, 'bundle listing', '20260520_161359(1).jpg_202606271421.jpeg'),
          path.join(CATALOG_ROOT, 'assets', 'products', 'B0H6SV7RXQ.jpg')
        ],
        cacheName: 'bundle-dome-blue-16.jpg'
      },
      {
        sku: 'BxDLx14oz',
        label: { en: '14 oz Clear PET Cups + Dome Lids + Blue Straws Bundle', ar: 'باقة أكواب 14 أونصة + غطاء بومبيه + شفاطات أزرق' },
        capacity: '14 oz',
        color: i18nData.colors['Blue'],
        orderUnit: 'pack',
        srcLocal: [
          path.join(UPACK_FILES_ROOT, 'bundle listing', '20260520_161359(1).jpg_202606271421.jpeg'),
          path.join(CATALOG_ROOT, 'assets', 'products', 'B0H6SV7RXQ.jpg')
        ],
        cacheName: 'bundle-dome-blue-14.jpg'
      },
      {
        sku: 'PxLx16oz',
        label: { en: '16 oz Clear PET Cups + Black Lids + Pink Straws Bundle', ar: 'باقة أكواب 16 أونصة + غطاء أسود + شفاطات بينك' },
        capacity: '16 oz',
        color: i18nData.colors['Pink'],
        orderUnit: 'pack',
        srcLocal: [path.join(CATALOG_ROOT, 'assets', 'products', 'B0H6SMQ4TD.jpg')],
        cacheName: 'bundle-black-pink-16.jpg'
      },
      {
        sku: 'PxLx14oz',
        label: { en: '14 oz Clear PET Cups + Black Lids + Pink Straws Bundle', ar: 'باقة أكواب 14 أونصة + غطاء أسود + شفاطات بينك' },
        capacity: '14 oz',
        color: i18nData.colors['Pink'],
        orderUnit: 'pack',
        srcLocal: [path.join(CATALOG_ROOT, 'assets', 'products', 'B0H6SMQ4TD.jpg')],
        cacheName: 'bundle-black-pink-14.jpg'
      },
      {
        sku: 'BxLx16oz',
        label: { en: '16 oz Clear PET Cups + Black Lids + Blue Straws Bundle', ar: 'باقة أكواب 16 أونصة + غطاء أسود + شفاطات أزرق' },
        capacity: '16 oz',
        color: i18nData.colors['Blue'],
        orderUnit: 'pack',
        srcLocal: [
          path.join(UPACK_FILES_ROOT, 'bundle listing', '20260520_161359(1).jpg_202606271422.jpeg'),
          path.join(CATALOG_ROOT, 'assets', 'products', 'B0H6SMQ4TD.jpg')
        ],
        cacheName: 'bundle-black-blue-16.jpg'
      },
      {
        sku: 'BxLx14oz',
        label: { en: '14 oz Clear PET Cups + Black Lids + Blue Straws Bundle', ar: 'باقة أكواب 14 أونصة + غطاء أسود + شفاطات أزرق' },
        capacity: '14 oz',
        color: i18nData.colors['Blue'],
        orderUnit: 'pack',
        srcLocal: [
          path.join(UPACK_FILES_ROOT, 'bundle listing', '20260520_161359(1).jpg_202606271422.jpeg'),
          path.join(CATALOG_ROOT, 'assets', 'products', 'B0H6SMQ4TD.jpg')
        ],
        cacheName: 'bundle-black-blue-14.jpg'
      }
    ]
  },
  {
    slug: 'krno2go-party-pack',
    cat: 'straws-accessories-bundles',
    material: ['Mixed'],
    lidPolicy: 'no-lid',
    hasLidIncluded: false,
    variants: [
      {
        sku: 'KRNO2GO-Pink',
        label: { en: 'KRNO2GO Complete Disposable Tableware Party Pack — Pink', ar: 'باقة الحفلات المتكاملة KRNO2GO — وردي (بينك)' },
        color: i18nData.colors['Pink'],
        orderUnit: 'pack',
        srcLocal: [path.join(CATALOG_ROOT, 'assets', 'products', 'pink.jpg')],
        cacheName: 'krno2go-pink.jpg'
      },
      {
        sku: 'KRNO2GO-Blue',
        label: { en: 'KRNO2GO Complete Disposable Tableware Party Pack — Blue', ar: 'باقة الحفلات المتكاملة KRNO2GO — أزرق' },
        color: i18nData.colors['Blue'],
        orderUnit: 'pack',
        srcLocal: [path.join(CATALOG_ROOT, 'assets', 'products', 'blue.jpg')],
        cacheName: 'krno2go-blue.jpg'
      }
    ]
  }
];

for (const lDef of LEGACY_FAMILIES_DEF) {
  const i18nFam = i18nData.families[lDef.slug];
  if (!i18nFam) throw new Error(`Missing i18n for legacy family: ${lDef.slug}`);

  const builtVars = [];
  const gallery = [];
  let famHeroImg = '';
  let famHeroBackdrop = 'light';

  for (let vi = 0; vi < lDef.variants.length; vi++) {
    const v = lDef.variants[vi];
    const srcImg = await resolveLegacySourceImage(v.srcLocal, v.srcRemote, v.cacheName);
    const relWebp = vi === 0
      ? `/images/products/${lDef.slug}.webp`
      : `/images/products/${lDef.slug}-${v.sku.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.webp`;
    const { webpPath, backdrop } = await writeProductWebpFromSource(srcImg, relWebp, 800);
    if (vi === 0) {
      famHeroImg = webpPath;
      famHeroBackdrop = backdrop;
    }
    if (!gallery.some(g => g.src === webpPath)) {
      gallery.push({ src: webpPath, backdrop, label: v.label });
    }
    builtVars.push({
      sku: v.sku,
      label: v.label,
      ...(v.capacity ? { capacity: v.capacity } : {}),
      ...(v.dimensionsMm ? { dimensionsMm: v.dimensionsMm } : {}),
      orderUnit: v.orderUnit,
      color: v.color,
      image: webpPath,
      photoBackdrop: backdrop
    });
  }

  const ogImage = await writeOgJpegFromWebp(famHeroImg, lDef.slug, famHeroBackdrop);

  allFamilies.push({
    slug: lDef.slug,
    category: lDef.cat,
    source: 'legacy',
    name: { en: i18nFam.en, ar: i18nFam.ar },
    subtitle: { en: i18nFam.subEn, ar: i18nFam.subAr },
    description: { en: i18nFam.descEn, ar: i18nFam.descAr },
    material: lDef.material,
    image: famHeroImg,
    ogImage,
    ...(gallery.length > 1 ? { gallery } : {}),
    photoBackdrop: famHeroBackdrop,
    ...(i18nFam.featured ? { featured: true } : {}),
    ...(i18nFam.isDessertFeatured ? { isDessertFeatured: true, dessertGroup: i18nFam.dessertGroup } : {}),
    hasLidIncluded: lDef.hasLidIncluded,
    lidPolicy: lDef.lidPolicy,
    tags: [lDef.cat, ...lDef.material, ...builtVars.map(v => v.sku)],
    variants: builtVars
  });
}

// ============================================================================
// 8. BRAND LOGOS, 9 CLIENT LOGOS & 4 HERO COLLAGE ASSETS
// ============================================================================
console.log('[6/8] Generating brand logos, copying all 9 exact client logos & 4 flagship hero collage assets...');

const upackLogoSrc = path.join(UPACK_FILES_ROOT, 'logos', 'IMG-20260717-WA0004.jpg');
const krnoLogoSrc = path.join(UPACK_FILES_ROOT, 'logos', 'krno-logo.png');

await sharp(upackLogoSrc).resize({ width: 640, withoutEnlargement: true }).webp({ quality: 90 }).toFile(path.join(DIR_BRAND, 'upack-logo.webp'));
await sharp(upackLogoSrc).resize({ width: 1200, height: 630, fit: 'contain', background: { r: 255, g: 255, b: 255 } }).flatten({ background: { r: 255, g: 255, b: 255 } }).jpeg({ quality: 88 }).toFile(path.join(DIR_BRAND, 'upack-logo.jpg'));
await sharp(krnoLogoSrc).resize({ width: 640, withoutEnlargement: true }).webp({ quality: 90 }).toFile(path.join(DIR_BRAND, 'krno-logo.webp'));
fs.copyFileSync(krnoLogoSrc, path.join(DIR_BRAND, 'krno-logo.png'));

const CLIENTS_LIST = [
  { id: 'meals-more', file: 'meals-more.jpg', name: { en: 'Meals & More', ar: 'Meals & More' } },
  { id: 'voo', file: 'voo.png', name: { en: 'VOO', ar: 'VOO' } },
  { id: 'shrimp-anatomy', file: 'shrimp-anatomy.jpg', name: { en: 'Shrimp Anatomy', ar: 'Shrimp Anatomy' } },
  { id: 'canele-patisserie', file: 'canele-patisserie.jpg', name: { en: 'Canelé Pâtisserie', ar: 'Canelé Pâtisserie' } },
  { id: 'paplo-adam', file: 'paplo-adam.png', name: { en: 'Paplo & Abdo', ar: 'Paplo&عبده' } },
  { id: 'nour-eldeen', file: 'nour-eldeen.webp', name: { en: '1920 Nour Eldeen', ar: '1920 Nour Eldeen' } },
  { id: 'babboos-eats', file: 'babboos-eats.webp', name: { en: "Babboo's Eats", ar: "Babboo's Eats" } },
  { id: 'anas-aldimashqi', file: 'anas-aldimashqi.png', name: { en: 'Anas Al-Dimashqi', ar: 'أنس الدمشقي' } },
  { id: 'abou-mazen', file: 'abou-mazen.png', name: { en: 'Abou Mazen', ar: 'أبو مازن السوري' } }
];

const clientsData = [];
for (const c of CLIENTS_LIST) {
  const srcClient = path.join(CATALOG_ROOT, 'assets', 'clients', c.file);
  const dstClient = path.join(DIR_CLIENTS, c.file);
  fs.copyFileSync(srcClient, dstClient);
  clientsData.push({
    id: c.id,
    name: c.name,
    image: `/images/clients/${c.file}`
  });
}

// Copy additional 2 hero collage WebPs (hero-dessert-dc200.webp & hero-cake-gt250.webp already written!)
fs.copyFileSync(path.join(DIR_PRODUCTS, 'ushape-cups-92.webp'), path.join(DIR_HERO, 'hero-cup-uk92.webp'));
fs.copyFileSync(path.join(DIR_PRODUCTS, 'meal-tray-rlb.webp'), path.join(DIR_HERO, 'hero-meal-rlb3.webp'));

const heroShowcase = [
  {
    slug: 'ps-crystal-bowl-200',
    category: 'dessert-cups-bowls',
    name: { en: 'PS Crystal Bowl 200ml + Lid (DC-200)', ar: 'بولة PS كريستال 200 مل بالغطاء (DC-200)' },
    tag: { en: 'Dessert Bestseller', ar: 'الأكثر مبيعاً للحلويات' },
    boxCount: { en: '100 Sets / Box · Lid Included', ar: '100 طقم / كرتونة · شامل الغطاء' },
    image: '/images/hero/hero-dessert-dc200.webp',
    photoBackdrop: 'light'
  },
  {
    slug: 'ushape-cups-92',
    category: 'cold-cups',
    name: { en: 'U-Shape Crystal PET Café Cups (92mm)', ar: 'أكواب كافيهات U-Shape شفافة (قطر 92 مم)' },
    tag: { en: '12 to 20 oz · 92mm Rim', ar: '12 إلى 20 أونصة · قطر 92 مم' },
    boxCount: { en: '1,000 Cups / Box · Lids Separate', ar: '1000 كوب / كرتونة · الأغطية منفصلة' },
    image: '/images/hero/hero-cup-uk92.webp',
    photoBackdrop: 'light'
  },
  {
    slug: 'meal-tray-rlb',
    category: 'meal-containers',
    name: { en: 'Divided Microwave Meal Tray + Clear Lid (RLB-3)', ar: 'علبة وجبات مايكروويف مقسمة بالغطاء (RLB-3)' },
    tag: { en: '1 to 4 Sections', ar: 'من قسم إلى 4 أقسام' },
    boxCount: { en: '200 Pcs / Box · PP + Clear Lid', ar: '200 قطعة / كرتونة · مايكروويف بالغطاء' },
    image: '/images/hero/hero-meal-rlb3.webp',
    photoBackdrop: 'light'
  },
  {
    slug: 'krno2go-party-pack',
    category: 'straws-accessories-bundles',
    name: { en: 'KRNO2GO Birthday & Party Pack (Pink & Blue)', ar: 'باقة أعياد الميلاد والحفلات KRNO2GO (وردي وأزرق)' },
    tag: { en: 'Birthday & Party Pack', ar: 'باقة أعياد الميلاد' },
    boxCount: { en: 'Complete 12-Guest Birthday Pack', ar: 'طقم عيد ميلاد وحفلات متكامل لـ 12 فرد' },
    image: '/images/products/krno2go-party-pack.webp',
    photoBackdrop: 'light'
  }
];

// ============================================================================
// 9. CLIENT REVIEW STRUCTURE: SPLIT K-115-400, UNIFY 20 DESSERT & PS, MERGE RIZO (9 CATEGORIES / 84 FAMILIES)
// ============================================================================
console.log('[7/8] Assembling 9 categories and writing src/data/catalog.json...');

// Split K-115-400 (Crème Caramel 400ml) out of rondo-bowls-k115
const rondoFam = allFamilies.find(f => f.slug === 'rondo-bowls-k115');
if (rondoFam) {
  const k400Idx = rondoFam.variants.findIndex(v => v.sku === 'K-115-400');
  if (k400Idx >= 0) {
    const [k400Var] = rondoFam.variants.splice(k400Idx, 1);
    const cremeOg = await writeOgJpegFromWebp('/images/products/p321-obj1394.webp', 'rondo-creme-caramel-400', 'light');
    allFamilies.push({
      slug: 'rondo-creme-caramel-400',
      category: 'dessert-cups-bowls',
      source: 'pdf',
      name: {
        en: 'Rippled Rondo Crème Caramel Bowl 400ml + Lid (K-115-400)',
        ar: 'بولة روندو مضلعة للكريم كراميل 400 مل بالغطاء (K-115-400)'
      },
      subtitle: {
        en: 'Ideal for Crème Caramel, Caramel Pudding & Chilled Desserts · 300 pcs/box',
        ar: 'مثالية للكريم كراميل والحلويات الباردة · 300 قطعة/كرتونة'
      },
      description: {
        en: '400ml rippled 115mm Rondo polypropylene bowl (K-115-400) engineered for crème caramel, caramel pudding, mahalabia, and chilled desserts — supplied with matching snap-fit clear lid LSLB-115 (300 pcs/box).',
        ar: 'بولة روندو مضلعة سعة 400 مل بقطر 115 مم (K-115-400) مصممة خصيصاً للكريم كراميل والمهلبية والحلويات الباردة، متوفرة باللون الشفاف أو الأسود مع الغطاء المحكم LSLB-115 (300 قطعة/كرتونة).'
      },
      material: ['PP'],
      image: '/images/products/p321-obj1394.webp',
      ogImage: cremeOg,
      photoBackdrop: 'light',
      featured: true,
      isDessertFeatured: true,
      dessertGroup: 'cups-bowls',
      hasLidIncluded: true,
      lidPolicy: 'paired-lid-box',
      tags: ['dessert-cups-bowls', 'PP', 'K-115-400', 'LSLB-115', 'creme caramel', 'كريم كراميل'],
      variants: [k400Var]
    });
  }
}

// Merge StrawsLxC from paper-straws into plastic-straws and remove paper-straws (zero Paper material)
const paperIdx = allFamilies.findIndex(f => f.slug === 'paper-straws');
const plasticFam = allFamilies.find(f => f.slug === 'plastic-straws');
if (paperIdx >= 0 && plasticFam) {
  const [paperFam] = allFamilies.splice(paperIdx, 1);
  const srcStrawImg = path.join(DIR_PRODUCTS, 'paper-straws.webp');
  const dstStrawImg = path.join(DIR_PRODUCTS, 'plastic-straws-strawslxc.webp');
  if (fs.existsSync(srcStrawImg)) fs.copyFileSync(srcStrawImg, dstStrawImg);
  const strawVar = {
    sku: 'StrawsLxC',
    label: { en: 'Small Plastic Drinking Straws (StrawsLxC)', ar: 'شفاطات مشروبات بلاستيك قياسية (StrawsLxC)' },
    orderUnit: 'box',
    color: { en: 'Multicolor', ar: 'ألوان متعددة' },
    image: '/images/products/plastic-straws-strawslxc.webp',
    photoBackdrop: 'light'
  };
  if (!plasticFam.variants.some(v => v.sku === 'StrawsLxC')) plasticFam.variants.push(strawVar);
  plasticFam.gallery = [...(plasticFam.gallery || []), { src: strawVar.image, backdrop: 'light', label: strawVar.label }];
  plasticFam.tags = Array.from(new Set([...(plasticFam.tags || []), 'StrawsLxC']));
  void paperFam;
}

const STRICT_DESSERT_ORDER = new Map([
  ['ps-crystal-bowl-200', { pos: 1, group: 'ps-trays' }],
  ['ps-rect-dessert-trays', { pos: 2, group: 'ps-trays' }],
  ['ps-turky-dessert-trays', { pos: 3, group: 'ps-trays' }],
  ['ps-duet-trays', { pos: 4, group: 'ps-trays' }],
  ['ps-oval-dessert-trays', { pos: 5, group: 'ps-trays' }],
  ['ps-crystal-dessert-bowls', { pos: 6, group: 'ps-trays' }],
  ['ps-oriental-round-trays', { pos: 7, group: 'ps-serving' }],
  ['ps-lotus-round-trays', { pos: 8, group: 'ps-serving' }],
  ['ps-seasonal-trays', { pos: 9, group: 'ps-serving' }],
  ['ps-rect-serving-trays-st', { pos: 10, group: 'ps-serving' }],
  ['ps-plain-round-trays', { pos: 11, group: 'ps-serving' }],
  ['ps-table-plate-sp28', { pos: 12, group: 'ps-serving' }],
  ['rondo-creme-caramel-400', { pos: 13, group: 'cups-bowls' }],
  ['vip-ice-cup-200', { pos: 14, group: 'cups-bowls' }],
  ['square-dessert-cups-dc', { pos: 15, group: 'cups-bowls' }],
  ['sweet-cups-92', { pos: 16, group: 'sweet-yogurt' }],
  ['yogurt-cups-95', { pos: 17, group: 'sweet-yogurt' }],
  ['jelly-cups-jc', { pos: 18, group: 'cups-bowls' }],
  ['cheesecake-tray-ck1', { pos: 19, group: 'cake-bakery' }],
  ['square-cake-gt', { pos: 20, group: 'cake-bakery' }]
]);

for (const f of allFamilies) {
  if (STRICT_DESSERT_ORDER.has(f.slug)) {
    f.category = 'dessert-cups-bowls';
    f.isDessertFeatured = true;
    f.dessertGroup = STRICT_DESSERT_ORDER.get(f.slug).group;
  } else {
    delete f.isDessertFeatured;
    delete f.dessertGroup;
    if (f.category === 'rizo-soup-bowls') f.category = 'meal-containers';
  }
}

const FINAL_CAT_ORDER = [
  'dessert-cups-bowls',
  'cold-cups',
  'sauce-cups',
  'hinged-containers',
  'meal-containers',
  'deli-sushi-containers',
  'plates-serving-trays',
  'cutlery',
  'straws-accessories-bundles'
];

const CAT_OVERRIDES = {
  'dessert-cups-bowls': {
    name: { en: 'Dessert, PS Trays & Cake Packaging', ar: 'قسم الحلويات وصواني PS وعلب الكيك' },
    image: '/images/products/ps-crystal-bowl-200.webp',
    photoBackdrop: 'light',
    isDessertPriority: true
  },
  'meal-containers': {
    name: { en: 'Microwave, Meals, Rizo & Soup Bowls', ar: 'علب الوجبات والمايكروويف والريزو والشوربة' }
  },
  'plates-serving-trays': {
    name: { en: 'PET Plates & Absorbent MAP Trays', ar: 'أطباق PET وأطباق الامتصاص MAP' },
    image: '/images/products/absorbent-map-trays.webp',
    photoBackdrop: 'light'
  }
};

const categories = FINAL_CAT_ORDER.map((slug, idx) => {
  const catDef = i18nData.categories.find(c => c.slug === slug);
  const catFams = allFamilies.filter(f => f.category === slug);
  const heroFam = catFams.find(f => f.slug === catDef.heroFamily) || catFams[0];
  const variantCount = catFams.reduce((acc, f) => acc + f.variants.length, 0);
  const ov = CAT_OVERRIDES[slug] || {};
  return {
    slug,
    name: ov.name || catDef.name,
    description: catDef.description,
    seoKeywords: catDef.seoKeywords,
    image: ov.image || heroFam.image,
    photoBackdrop: ov.photoBackdrop || heroFam.photoBackdrop,
    count: catFams.length,
    variantCount,
    order: idx + 1,
    ...(ov.isDessertPriority || catDef.isDessertPriority ? { isDessertPriority: true } : {})
  };
});

// Order products by category order, with strict 1..20 order inside dessert-cups-bowls (square-cake-gt LAST)
const catOrderMap = new Map(categories.map(c => [c.slug, c.order]));
allFamilies.sort((a, b) => {
  const ca = catOrderMap.get(a.category) ?? 99;
  const cb = catOrderMap.get(b.category) ?? 99;
  if (ca !== cb) return ca - cb;
  if (a.category === 'dessert-cups-bowls' && b.category === 'dessert-cups-bowls') {
    return (STRICT_DESSERT_ORDER.get(a.slug)?.pos ?? 99) - (STRICT_DESSERT_ORDER.get(b.slug)?.pos ?? 99);
  }
  if (Boolean(b.featured) !== Boolean(a.featured)) return b.featured ? 1 : -1;
  return 0;
});

const displayVariantsCount = allFamilies.reduce((acc, f) => acc + f.variants.length, 0);
const uniqueEmbeddedLidSkus = new Set();
for (const f of allFamilies) {
  for (const l of (f.compatibleLids || [])) {
    // Only count lid SKUs from mergedLids that aren't standalone variants in pet-cup-lids
    if (![21, 22, 23, 29, 30, 41, 42].includes(l.pdfPage)) uniqueEmbeddedLidSkus.add(`${l.sku}:${l.pdfPage}`);
  }
  for (const l of (f.separateLidOptions || [])) {
    if (![21, 22, 23, 29, 30, 41, 42].includes(l.pdfPage)) uniqueEmbeddedLidSkus.add(`${l.sku}:${l.pdfPage}`);
  }
}

const embeddedLidSkusCount = uniqueEmbeddedLidSkus.size; // 49
const totalUniqueSkusCount = displayVariantsCount + embeddedLidSkusCount; // 313 + 49 = 362
const dessertFamiliesCount = allFamilies.filter(f => f.isDessertFeatured).length;

const catalogData = {
  generatedAt: new Date().toISOString(),
  brand: {
    name: { en: 'U-Pack for Trading', ar: 'يو-باك للتجارة (U-Pack)' },
    tagline: { en: 'KRNO Distributor', ar: 'موزع KRNO' },
    phone: '01055400404',
    phoneIntl: '+201055400404',
    whatsappBase: 'https://wa.me/201055400404',
    emails: ['Khodeirmostafa80@gmail.com', 'soliman.lashien@gmail.com'],
    delivery: { en: 'Nationwide Delivery Across All of Egypt', ar: 'توصيل لجميع محافظات مصر' },
    logoWebp: '/images/brand/upack-logo.webp',
    logoJpg: '/images/brand/upack-logo.jpg',
    krnoLogoWebp: '/images/brand/krno-logo.webp',
    krnoLogoPng: '/images/brand/krno-logo.png'
  },
  stats: {
    categories: categories.length,
    families: allFamilies.length,
    displayVariants: displayVariantsCount,
    embeddedLidSkus: embeddedLidSkusCount,
    totalUniqueSkus: totalUniqueSkusCount,
    dessertFamilies: dessertFamiliesCount
  },
  heroShowcase,
  clients: clientsData,
  categories,
  products: allFamilies
};

const jsonString = JSON.stringify(catalogData, null, 2);
fs.writeFileSync(OUT_JSON, jsonString, 'utf8');

// ============================================================================
// 10. GATE 1 DETERMINISTIC VERIFICATION ASSERTIONS
// ============================================================================
console.log('[8/8] Running Gate 1 Verification Suite on catalog.json & public/images/**...');

const errors = [];
const assert = (cond, msg) => { if (!cond) errors.push(msg); };

assert(catalogData.stats.categories === 9, `Expected 9 categories, got ${catalogData.stats.categories}`);
assert(catalogData.stats.families === 83, `Expected 83 families, got ${catalogData.stats.families}`);
assert(catalogData.stats.displayVariants === 313, `Expected 313 displayVariants, got ${catalogData.stats.displayVariants}`);
assert(catalogData.stats.embeddedLidSkus === 49, `Expected 49 embeddedLidSkus, got ${catalogData.stats.embeddedLidSkus}`);
assert(catalogData.stats.totalUniqueSkus === 362, `Expected 362 totalUniqueSkus, got ${catalogData.stats.totalUniqueSkus}`);
assert(catalogData.clients.length === 9, `Expected 9 clients, got ${catalogData.clients.length}`);

// Check zero foam, zero official, zero Amazon hotlinks, zero old phone number
assert(!/foam|فوم/i.test(jsonString), 'Forbidden foam reference found in catalog.json');
assert(!/official distributor|الموزع الرسمي/i.test(jsonString), 'Forbidden "Official Distributor" found in catalog.json');
assert(!/media-amazon\.com|https?:\/\/(?!wa\.me)/i.test(jsonString), 'Forbidden external image URL found in catalog.json');
assert(!/01065407000/.test(jsonString), 'Forbidden legacy phone number found in catalog.json');

// Check unique family slugs & unique display variant SKUs
const seenFamSlugs = new Set();
const seenVarSkus = new Set();
let syntheticCount = 0;

for (const f of catalogData.products) {
  assert(!seenFamSlugs.has(f.slug), `Duplicate family slug: ${f.slug}`);
  seenFamSlugs.add(f.slug);
  assert(f.name.en && f.name.ar, `Missing bilingual name on ${f.slug}`);
  assert(f.description.en && f.description.ar, `Missing bilingual description on ${f.slug}`);
  assert(f.variants.length > 0, `Family ${f.slug} has 0 variants`);

  // Check cup lid policy rule
  if (f.category === 'cold-cups' && f.slug !== 'pet-cup-lids') {
    assert(f.lidPolicy === 'cups-no-lid-separate' && f.hasLidIncluded === false, `Cold cup ${f.slug} must have lidPolicy=cups-no-lid-separate and hasLidIncluded=false`);
    assert(Array.isArray(f.separateLidOptions) && f.separateLidOptions.length > 0, `Cold cup ${f.slug} must have separateLidOptions`);
  }
  if (['sweet-cups-92', 'yogurt-cups-95', 'square-dessert-cups-dc', 'jelly-cups-jc', 'sauce-cups-62', 'sauce-cups-70', 'sauce-cups-73'].includes(f.slug)) {
    assert(f.lidPolicy === 'cups-no-lid-separate' && f.hasLidIncluded === false, `Cup family ${f.slug} must have lidPolicy=cups-no-lid-separate and hasLidIncluded=false`);
    assert(Array.isArray(f.separateLidOptions) && f.separateLidOptions.length > 0, `Cup family ${f.slug} must have separateLidOptions`);
  }

  for (const v of f.variants) {
    assert(!seenVarSkus.has(v.sku), `Duplicate display variant SKU: ${v.sku} in ${f.slug}`);
    seenVarSkus.add(v.sku);
    if (v.isSyntheticSku) syntheticCount++;
  }
}
assert(syntheticCount === 29, `Expected exactly 29 synthetic SKUs for blank-code PDF pages, got ${syntheticCount}`);

// Verify 100% of all 339 non-foam PDF product pages are accounted for
const accountedPdfPages = new Set();
for (const fDef of PDF_FAMILIES) {
  for (const p of fDef.pages) accountedPdfPages.add(p);
  for (const p of (fDef.mergedLids || [])) accountedPdfPages.add(p);
  for (const p of (fDef.mergedDupCombos || [])) accountedPdfPages.add(p);
}
assert(accountedPdfPages.size === 339, `Expected 339 non-foam PDF product pages accounted for, got ${accountedPdfPages.size}`);

// Verify every single image path referenced in catalog.json exists on disk and is > 100 bytes
const referencedImages = new Set();
function collectImagePaths(obj) {
  if (!obj || typeof obj !== 'object') return;
  if (Array.isArray(obj)) {
    for (const item of obj) collectImagePaths(item);
    return;
  }
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string' && v.startsWith('/images/')) {
      referencedImages.add(v);
    } else if (typeof v === 'object') {
      collectImagePaths(v);
    }
  }
}
collectImagePaths(catalogData);

for (const relImg of referencedImages) {
  const absImg = path.join(SITE_ROOT, 'public', relImg.replace(/^\//, ''));
  if (!fs.existsSync(absImg)) {
    errors.push(`Missing referenced image on disk: ${relImg}`);
  } else {
    const st = fs.statSync(absImg);
    if (st.size < 100) errors.push(`Empty/corrupt image on disk (<100B): ${relImg} (${st.size}B)`);
  }
}

if (errors.length > 0) {
  console.error('GATE 1 FAILED WITH ERRORS:', errors);
  process.exit(1);
}

console.log('================================================================');
console.log('GATE 1 PASSED WITH ZERO ERRORS!');
console.log({
  categories: catalogData.stats.categories,
  families: catalogData.stats.families,
  displayVariants: catalogData.stats.displayVariants,
  embeddedLidSkus: catalogData.stats.embeddedLidSkus,
  totalUniqueSkus: catalogData.stats.totalUniqueSkus,
  dessertFamilies: catalogData.stats.dessertFamilies,
  syntheticSkus: syntheticCount,
  accountedNonFoamPdfPages: accountedPdfPages.size,
  verifiedImageFilesOnDisk: referencedImages.size
});
console.log('================================================================');
