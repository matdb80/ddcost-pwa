/**
 * Merge minimale di documenti PDF classici (senza object stream, senza xref
 * stream, senza cifratura): aggiunge le pagine del secondo documento in coda
 * al primo, rinumerando gli oggetti e ricalcolando la xref table.
 *
 * Uso: accodare la pagina originale delle condizioni di vendita al PDF del
 * preventivo. I documenti generati da quote-pdf-file.ts e la pagina 417
 * ufficiale rientrano entrambi nei limiti supportati.
 */

const latin1 = (bytes: Uint8Array): string => {
  let out = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK)
    out += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return out;
};

interface PdfObject {
  id: number;
  gen: number;
  /** Contenuto grezzo dell'oggetto (senza "N G obj" / "endobj"). */
  body: string;
  /** Indice in body dove inizia il flusso (dopo "stream\r\n"), -1 se assente. */
  streamStart: number;
  /** Indice in body dove finisce il flusso (prima di "endstream"), -1 se assente. */
  streamEnd: number;
}

interface ParsedPdf {
  objects: Map<number, PdfObject>;
  rootId: number;
  infoId: number | null;
  pagesId: number;
  pageIds: number[];
  count: number;
}

function fail(message: string): never {
  throw new Error("PDF non supportato per l'unione: " + message);
}

/** Individua gli oggetti indiretti scansionando il file; in caso di
 * aggiornamenti incrementali vale l'ultima occorrenza di ogni oggetto. */
function parsePdf(bytes: Uint8Array): ParsedPdf {
  const text = latin1(bytes);
  if (!/^%PDF-1\.[0-9]/.test(text)) fail("header mancante");
  if (/\/Encrypt\b/.test(text)) fail("documento cifrato");
  if (/\/ObjStm\b/.test(text)) fail("object stream (PDF 1.5 compresso)");
  if (/\/XRef\b/.test(text)) fail("xref stream");
  const objects = new Map<number, PdfObject>();
  const headRe = /(?:^|[\r\n])(\d{1,6})[ \t](\d{1,3})[ \t]obj[\r\n]/g;
  let match: RegExpExecArray | null;
  while ((match = headRe.exec(text))) {
    const id = Number(match[1]);
    const gen = Number(match[2]);
    const bodyStart = match.index + match[0].length;
    let end = text.indexOf("endobj", bodyStart);
    if (end < 0) fail(`oggetto ${id} senza endobj`);
    let body = text.slice(bodyStart, end);
    let streamStart = -1, streamEnd = -1;
    const streamAt = body.search(/stream[\r\n]/);
    if (streamAt >= 0) {
      const dict = body.slice(0, streamAt);
      const lengthMatch = /\/Length\s+(\d+)\b/.exec(dict);
      if (!lengthMatch) fail(`oggetto ${id}: /Length indiretta o assente`);
      const streamKeyword = /stream\r\n|stream\n|stream\r/.exec(body.slice(streamAt, streamAt + 9));
      if (!streamKeyword) fail(`oggetto ${id}: EOL dopo stream non riconosciuto`);
      streamStart = streamAt + streamKeyword[0].length;
      const length = Number(lengthMatch[1]);
      streamEnd = streamStart + length;
      if (body.slice(streamEnd, streamEnd + 12).replace(/^[\r\n]+/, "").indexOf("endstream") !== 0)
        fail(`oggetto ${id}: endstream non dove atteso (/Length errata?)`);
      // Il vero "endobj" è quello dopo endstream: il flusso può contenere
      // la sequenza "endobj" nei dati binari.
      end = text.indexOf("endobj", bodyStart + streamEnd);
      if (end < 0) fail(`oggetto ${id} senza endobj dopo endstream`);
      body = text.slice(bodyStart, end);
    }
    objects.set(id, { id, gen, body, streamStart, streamEnd });
    headRe.lastIndex = bodyStart + (streamEnd >= 0 ? streamEnd : body.length);
  }
  if (!objects.size) fail("nessun oggetto trovato");
  const trailerMatch = /trailer\s*<<([\s\S]*?)>>\s*startxref/.exec(text);
  if (!trailerMatch) fail("trailer mancante");
  const trailer = trailerMatch[1];
  const rootRef = /\/Root\s+(\d+)\s+\d+\s+R/.exec(trailer);
  if (!rootRef) fail("/Root assente nel trailer");
  const rootId = Number(rootRef[1]);
  const infoRef = /\/Info\s+(\d+)\s+\d+\s+R/.exec(trailer);
  const root = objects.get(rootId);
  if (!root) fail("oggetto Root non trovato");
  const pagesRef = /\/Pages\s+(\d+)\s+\d+\s+R/.exec(root.body);
  if (!pagesRef) fail("Catalog senza /Pages");
  const pagesId = Number(pagesRef[1]);
  const pageIds: number[] = [];
  const walkPages = (nodeId: number, depth: number): void => {
    if (depth > 8) fail("albero delle pagine troppo profondo");
    const node = objects.get(nodeId);
    if (!node) fail(`nodo pagine ${nodeId} mancante`);
    if (/\/Type\s*\/Page(?![a-zs])/i.test(node.body)) {
      pageIds.push(nodeId);
      return;
    }
    const kidsMatch = /\/Kids\s*\[([\s\S]*?)\]/.exec(node.body);
    if (!kidsMatch) fail(`nodo pagine ${nodeId} senza /Kids`);
    const kids = [...kidsMatch[1].matchAll(/(\d+)\s+\d+\s+R/g)].map(k => Number(k[1]));
    for (const kid of kids) walkPages(kid, depth + 1);
  };
  walkPages(pagesId, 0);
  if (!pageIds.length) fail("nessuna pagina nel documento");
  return { objects, rootId, infoId: infoRef ? Number(infoRef[1]) : null, pagesId, pageIds, count: pageIds.length };
}

/** Rimappa i riferimenti indiretti "N G R" fuori dai flussi di contenuto. */
function remapObject(obj: PdfObject, map: (id: number) => number): string {
  const remapText = (segment: string) =>
    segment.replace(/(\d{1,6})(\s+)(\d{1,3})(\s+)R\b/g, (whole, id, ws1, gen, ws2) => {
      const mapped = map(Number(id));
      return mapped < 0 ? whole : `${mapped}${ws1}${gen}${ws2}R`;
    });
  if (obj.streamStart < 0) return remapText(obj.body);
  return (
    remapText(obj.body.slice(0, obj.streamStart)) +
    obj.body.slice(obj.streamStart, obj.streamEnd) +
    remapText(obj.body.slice(obj.streamEnd))
  );
}

/**
 * Restituisce un nuovo PDF con le pagine di `extra` accodate a quelle di
 * `base`. Root, metadati e contenuti del primo documento restano invariati;
 * dal secondo vengono importati solo gli oggetti necessari alle sue pagine
 * (in pratica: tutti, con i riferimenti rinumerati).
 */
export function appendPdfPages(base: Uint8Array, extra: Uint8Array): Uint8Array {
  const a = parsePdf(base);
  const b = parsePdf(extra);
  const offset = Math.max(...a.objects.keys()) + 1;
  const idMap = new Map<number, number>();
  for (const id of b.objects.keys()) idMap.set(id, id + offset);
  const mapId = (id: number) => idMap.get(id) ?? -1;

  // Le pagine importate puntano al nodo /Pages del documento base.
  const importedPages = b.pageIds.map(pageId => {
    const page = b.objects.get(pageId)!;
    let body = remapObject(page, mapId);
    const remappedParent = String(a.pagesId) + " 0 R";
    if (/\/Parent\s+\d+\s+\d+\s+R/.test(body))
      body = body.replace(/\/Parent\s+\d+\s+\d+\s+R/, `/Parent ${remappedParent}`);
    else
      body = body.replace(/<</, `<< /Parent ${remappedParent} `);
    return { id: idMap.get(pageId)!, body };
  });
  const importedIds = new Set(importedPages.map(p => p.id));
  const importedObjects: Array<{ id: number; body: string }> = [];
  for (const [oldId, obj] of [...b.objects.entries()].sort((x, y) => x[0] - y[0])) {
    const newId = idMap.get(oldId)!;
    importedObjects.push({ id: newId, body: importedIds.has(newId) ? importedPages.find(p => p.id === newId)!.body : remapObject(obj, mapId) });
  }

  // Aggiorna il nodo /Pages del documento base: Kids e Count.
  const basePages = a.objects.get(a.pagesId)!;
  let pagesBody = remapObject(basePages, id => id);
  const kidsMatch = /\/Kids\s*\[([\s\S]*?)\]/.exec(pagesBody);
  if (!kidsMatch) fail("nodo /Pages del documento base senza /Kids");
  const extraKids = importedPages.map(p => `${p.id} 0 R`).join(" ");
  pagesBody = pagesBody.replace(kidsMatch[0], `/Kids [${kidsMatch[1].trim()} ${extraKids}]`);
  const countMatch = /\/Count\s+(\d+)/.exec(pagesBody);
  if (!countMatch) fail("nodo /Pages del documento base senza /Count");
  pagesBody = pagesBody.replace(countMatch[0], `/Count ${Number(countMatch[1]) + b.pageIds.length}`);

  const allObjects: Array<{ id: number; body: string }> = [];
  for (const [id, obj] of [...a.objects.entries()].sort((x, y) => x[0] - y[0]))
    allObjects.push({ id, body: id === a.pagesId ? pagesBody : obj.body });
  allObjects.push(...importedObjects);

  // Serializza: header binario, oggetti, xref completa (sottosezione unica
  // con eventuali buchi marcati liberi), trailer con il Root del documento base.
  const chunks: string[] = ["%PDF-1.7\n%\xE2\xE3\xCF\xD3\n"];
  let position = chunks[0].length;
  const maxId = Math.max(...allObjects.map(o => o.id));
  const offsets = new Array<number>(maxId + 1).fill(0);
  for (const obj of allObjects) {
    const serialized = `${obj.id} 0 obj\n${obj.body.replace(/[\r\n]+$/, "")}\nendobj\n`;
    offsets[obj.id] = position;
    chunks.push(serialized);
    position += serialized.length;
  }
  const xrefStart = position;
  let xref = `xref\n0 ${maxId + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= maxId; id++)
    xref += offsets[id]
      ? `${String(offsets[id]).padStart(10, "0")} 00000 n \n`
      : "0000000000 65535 f \n";
  const infoPart = a.infoId ? ` /Info ${a.infoId} 0 R` : "";
  xref += `trailer\n<< /Size ${maxId + 1} /Root ${a.rootId} 0 R${infoPart} >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  chunks.push(xref);
  const merged = chunks.join("");
  const out = new Uint8Array(merged.length);
  for (let i = 0; i < merged.length; i++) out[i] = merged.charCodeAt(i) & 0xff;
  return out;
}
