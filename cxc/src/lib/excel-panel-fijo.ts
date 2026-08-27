// Deja la fila de encabezados FIJA al bajar por la hoja ("congelar paneles").
//
// ⚠️ POR QUÉ ESTO EXISTE: **`xlsx-js-style` NO sabe escribir paneles.** Se
// verificó escribiendo un libro con `ws["!freeze"]` y `ws["!panes"]` puestos y
// leyendo el XML que salió: `<sheetViews><sheetView workbookViewId="0"/>`, sin
// un solo `<pane>`. El filtro sí lo escribe (`ws["!autofilter"]` sale como
// `<autoFilter ref>` + el `_xlnm._FilterDatabase` que Excel espera); el panel
// fijo no. Las dos cosas juntas son lo que Daniel pidió: filtrar desde los
// nombres de columna y no perderlos al bajar.
//
// 🔴 LA SALIDA NO CAMBIA DE LIBRERÍA — mismo truco que `depurador/fotos-xlsx.ts`
// usa para incrustar fotos: el libro lo sigue armando `xlsx-js-style` igual que
// siempre y acá se le agrega al ZIP la parte que le falta.
//
// La diferencia con `fotos-xlsx.ts` es que ESTE camino es SÍNCRONO. Tiene que
// serlo: `downloadWorkbook()` se llama desde botones y `workbookBuffer()` desde
// rutas que devuelven el Buffer de una; volverlas asíncronas por un `<pane/>`
// habría tocado los ~25 exports del sistema. Se puede porque **SheetJS escribe
// el .xlsx SIN comprimir** (todas las entradas con método 0 STORED, verificado
// recorriendo los local headers): sin compresión, reescribir el ZIP es copiar
// bytes y recalcular un CRC32, sin necesidad de deflate ni de JSZip.
//
// 🔴 SI ALGO NO CALZA, SALE EL ARCHIVO ORIGINAL. Un Excel sin la fila fija es
// una molestia; un Excel corrupto es un archivo que no se abre. Por eso cada
// paso que no reconoce lo que ve devuelve los bytes tal cual: entradas
// comprimidas, ZIP64, un `<sheetView>` que no aparece. El candado de que hoy sí
// se aplica lo pone el test, que abre el archivo y busca el `<pane>`.

/** La primera fila queda fija y la vista arranca en A2. */
const PANEL_FIJO =
  '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' +
  '<selection pane="bottomLeft" activeCell="A2" sqref="A2"/>';

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_EOCD = 0x06054b50;

const TABLA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(b: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = TABLA_CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

interface EntradaZip {
  nombre: Uint8Array;
  nombreTxt: string;
  metodo: number;
  flags: number;
  hora: number;
  fecha: number;
  crc: number;
  csize: number;
  usize: number;
  datos: Uint8Array;
}

/**
 * Mete el `<pane>` en el XML de una hoja.
 *
 * 🔑 SOLO en las hojas que YA tienen filtro desde A1 — o sea, exactamente las
 * que salen de `buildReportSheet`. Es un marcador de CONDUCTA, no un índice de
 * hoja: las fichas con layout propio (Reclamos, el Depurador) no ponen filtro y
 * por eso no se les congela una fila que no es de encabezados.
 */
function congelarPrimeraFila(xml: string): string | null {
  if (!/<autoFilter ref="A1:/.test(xml)) return null;
  if (/<pane\b/.test(xml)) return null;

  const cerrado = /<sheetView\b([^>]*)\/>/.exec(xml);
  if (cerrado) return xml.replace(cerrado[0], `<sheetView${cerrado[1]}>${PANEL_FIJO}</sheetView>`);

  const abierto = /<sheetView\b[^>]*>/.exec(xml);
  if (abierto) return xml.replace(abierto[0], `${abierto[0]}${PANEL_FIJO}`);

  // Sin `<sheetViews>`: se agrega entero, después de `<dimension/>` — ése es el
  // orden que exige el esquema (sheetPr, dimension, sheetViews, …).
  const bloque = `<sheetViews><sheetView workbookViewId="0">${PANEL_FIJO}</sheetView></sheetViews>`;
  const dim = /<dimension\b[^>]*\/>/.exec(xml);
  if (dim) return xml.replace(dim[0], `${dim[0]}${bloque}`);
  const raiz = /<worksheet\b[^>]*>/.exec(xml);
  return raiz ? xml.replace(raiz[0], `${raiz[0]}${bloque}`) : null;
}

function buscarEocd(b: Uint8Array): number {
  const piso = Math.max(0, b.length - 66_000);
  for (let i = b.length - 22; i >= piso; i--) {
    if (b[i] === 0x50 && b[i + 1] === 0x4b && b[i + 2] === 0x05 && b[i + 3] === 0x06) return i;
  }
  return -1;
}

/** Lee el ZIP por su directorio central (el único lugar donde los tamaños son
 *  siempre confiables: con data descriptor el local header los trae en cero). */
function leerZip(b: Uint8Array): EntradaZip[] | null {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const eocd = buscarEocd(b);
  if (eocd < 0) return null;
  const total = dv.getUint16(eocd + 10, true);
  const inicioCd = dv.getUint32(eocd + 16, true);
  // ZIP64: los centinelas no se interpretan, se devuelve el archivo tal cual.
  if (total === 0xffff || inicioCd === 0xffffffff) return null;

  const entradas: EntradaZip[] = [];
  let p = inicioCd;
  for (let i = 0; i < total; i++) {
    if (p + 46 > b.length || dv.getUint32(p, true) !== SIG_CENTRAL) return null;
    const flags = dv.getUint16(p + 8, true);
    const metodo = dv.getUint16(p + 10, true);
    const hora = dv.getUint16(p + 12, true);
    const fecha = dv.getUint16(p + 14, true);
    const crc = dv.getUint32(p + 16, true);
    const csize = dv.getUint32(p + 20, true);
    const usize = dv.getUint32(p + 24, true);
    const nLen = dv.getUint16(p + 28, true);
    const eLen = dv.getUint16(p + 30, true);
    const cLen = dv.getUint16(p + 32, true);
    const offLocal = dv.getUint32(p + 42, true);
    if (csize === 0xffffffff || usize === 0xffffffff || offLocal === 0xffffffff) return null;
    const nombre = b.slice(p + 46, p + 46 + nLen);

    if (offLocal + 30 > b.length || dv.getUint32(offLocal, true) !== SIG_LOCAL) return null;
    const nLenLocal = dv.getUint16(offLocal + 26, true);
    const eLenLocal = dv.getUint16(offLocal + 28, true);
    const inicioDatos = offLocal + 30 + nLenLocal + eLenLocal;
    if (inicioDatos + csize > b.length) return null;

    entradas.push({
      nombre,
      nombreTxt: new TextDecoder().decode(nombre),
      metodo,
      // El bit 3 (data descriptor) se cae: acá los tamaños se escriben en el
      // local header, que es lo que ese bit dice que NO están.
      flags: flags & ~0x08,
      hora,
      fecha,
      crc,
      csize,
      usize,
      datos: b.slice(inicioDatos, inicioDatos + csize),
    });
    p += 46 + nLen + eLen + cLen;
  }
  return entradas;
}

function escribirZip(entradas: readonly EntradaZip[]): Uint8Array {
  let bytes = 0;
  for (const e of entradas) bytes += 30 + e.nombre.length + e.csize + 46 + e.nombre.length;
  bytes += 22;

  const out = new Uint8Array(bytes);
  const dv = new DataView(out.buffer);
  const offsets: number[] = [];
  let p = 0;

  for (const e of entradas) {
    offsets.push(p);
    dv.setUint32(p, SIG_LOCAL, true);
    dv.setUint16(p + 4, 20, true);
    dv.setUint16(p + 6, e.flags, true);
    dv.setUint16(p + 8, e.metodo, true);
    dv.setUint16(p + 10, e.hora, true);
    dv.setUint16(p + 12, e.fecha, true);
    dv.setUint32(p + 14, e.crc, true);
    dv.setUint32(p + 18, e.csize, true);
    dv.setUint32(p + 22, e.usize, true);
    dv.setUint16(p + 26, e.nombre.length, true);
    dv.setUint16(p + 28, 0, true);
    out.set(e.nombre, p + 30);
    out.set(e.datos, p + 30 + e.nombre.length);
    p += 30 + e.nombre.length + e.csize;
  }

  const inicioCd = p;
  entradas.forEach((e, i) => {
    dv.setUint32(p, SIG_CENTRAL, true);
    dv.setUint16(p + 4, 20, true);
    dv.setUint16(p + 6, 20, true);
    dv.setUint16(p + 8, e.flags, true);
    dv.setUint16(p + 10, e.metodo, true);
    dv.setUint16(p + 12, e.hora, true);
    dv.setUint16(p + 14, e.fecha, true);
    dv.setUint32(p + 16, e.crc, true);
    dv.setUint32(p + 20, e.csize, true);
    dv.setUint32(p + 24, e.usize, true);
    dv.setUint16(p + 28, e.nombre.length, true);
    dv.setUint16(p + 30, 0, true);
    dv.setUint16(p + 32, 0, true);
    dv.setUint16(p + 34, 0, true);
    dv.setUint16(p + 36, 0, true);
    dv.setUint32(p + 38, 0, true);
    dv.setUint32(p + 42, offsets[i], true);
    out.set(e.nombre, p + 46);
    p += 46 + e.nombre.length;
  });

  dv.setUint32(p, SIG_EOCD, true);
  dv.setUint16(p + 4, 0, true);
  dv.setUint16(p + 6, 0, true);
  dv.setUint16(p + 8, entradas.length, true);
  dv.setUint16(p + 10, entradas.length, true);
  dv.setUint32(p + 12, p - inicioCd, true);
  dv.setUint32(p + 16, inicioCd, true);
  dv.setUint16(p + 20, 0, true);
  return out;
}

/**
 * Devuelve el .xlsx con la fila de encabezados fija en todas las hojas que
 * tienen filtro desde A1. Si el archivo no se puede reescribir con seguridad,
 * devuelve los bytes de entrada SIN tocar.
 */
export function congelarEncabezadosXlsx(xlsx: Uint8Array): Uint8Array {
  let entradas: EntradaZip[] | null = null;
  try {
    entradas = leerZip(xlsx);
  } catch {
    return xlsx;
  }
  if (!entradas) return xlsx;

  let cambio = false;
  for (const e of entradas) {
    if (e.metodo !== 0) continue; // comprimida: no se toca (ver cabecera)
    if (!/^xl\/worksheets\/[^/]+\.xml$/.test(e.nombreTxt)) continue;
    const xml = new TextDecoder().decode(e.datos);
    const nuevo = congelarPrimeraFila(xml);
    if (nuevo === null) continue;
    const datos = new TextEncoder().encode(nuevo);
    e.datos = datos;
    e.csize = datos.length;
    e.usize = datos.length;
    e.crc = crc32(datos);
    cambio = true;
  }
  if (!cambio) return xlsx;

  try {
    return escribirZip(entradas);
  } catch {
    return xlsx;
  }
}
