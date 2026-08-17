// Incrusta fotos DENTRO del .xlsx que ya genera el Depurador.
//
// ⚠️ POR QUÉ ESTO EXISTE: **`xlsx-js-style` NO sabe incrustar imágenes.** Se
// verificó abriendo el bundle publicado (`dist/xlsx.bundle.js`, v1.2.0): no
// aparece ni una vez `xdr:`, `oneCellAnchor`, `twoCellAnchor`, `xl/media`,
// `drawing1.xml` ni `sheet_add_image`. No hay opción ni API escondida: la
// librería escribe hojas, estilos y anchos, y nada más.
//
// 🔴 LA SALIDA NO CAMBIA DE LIBRERÍA. El libro lo sigue armando `xlsx-js-style`
// exactamente como hoy (mismas celdas, mismos anchos, mismo forzado a texto de
// los códigos); acá se toma el archivo YA generado y se le agregan las partes
// que le faltan al ZIP. Cambiar `xlsx-js-style` por otra librería habría tocado
// TODOS los exports del sistema por un botón, y eso no es lo que se pidió.
// `jszip` ya era dependencia del proyecto (lo usa el ZIP de Marketing).
//
// Las partes que se agregan son las cuatro del estándar OOXML:
//   xl/media/imageN.jpeg              ← los bytes de cada foto
//   xl/drawings/drawing1.xml          ← dónde va cada foto y de qué tamaño
//   xl/drawings/_rels/drawing1.xml.rels
//   xl/worksheets/_rels/sheetN.xml.rels + <drawing r:id> en la hoja
//   [Content_Types].xml               ← declara el dibujo
//
// ⚠️ `[Content_Types].xml` de SheetJS YA trae `<Default Extension="jpeg">` y
// `jpg` (verificado en la salida real), así que solo hace falta el Override del
// dibujo — pero se agrega el Default igual si algún día no viniera: un ZIP sin
// el content-type de la imagen lo abre Excel como archivo dañado.

import JSZip from "jszip";

/** Una foto ya comprimida y medida, lista para pegarse en una fila. */
export interface FotoParaExcel {
  /** Fila de la hoja, 0-based (0 = la fila de encabezados). */
  fila: number;
  /** JPEG. */
  bytes: Uint8Array;
  /** Tamaño con el que se dibuja, en píxeles (ya encajado en la celda). */
  anchoPx: number;
  altoPx: number;
  /** Sangría dentro de la celda, en píxeles. */
  offsetXPx?: number;
  offsetYPx?: number;
}

export interface OpcionesIncrustar {
  /** Columna donde va la foto, 0-based. Por defecto la primera. */
  columna?: number;
  /**
   * Hoja donde pegar, como ruta dentro del zip (`xl/worksheets/sheet3.xml`).
   * Por defecto la primera del libro. Lo usa el camino "mi propio Excel", que
   * ya resolvió la hoja para leerle los códigos: resolverla dos veces con dos
   * reglas distintas es cómo se termina leyendo de una hoja y escribiendo en otra.
   */
  hoja?: string;
  /**
   * 🔴 SOLO para el camino "mi propio Excel": si la hoja YA tenía un dibujo
   * (o sea, fotos pegadas antes por el macro de VBA), lo REEMPLAZA en vez de
   * cortar con error. Se reusa el mismo part y la misma relación, y se borran
   * las imágenes viejas que ese dibujo tenía — si no, el archivo se llevaría el
   * peso de dos juegos de fotos.
   *
   * Por defecto es `false`, o sea el comportamiento de siempre: el Excel del
   * pedido Reebok lo arma el sistema y ahí un dibujo preexistente solo puede
   * ser algo que alguien más escribió, y pisarlo en silencio perdería su
   * contenido.
   */
  reemplazarDibujo?: boolean;
}

const NS_XDR = "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing";
const NS_A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const NS_R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const NS_PKG_REL = "http://schemas.openxmlformats.org/package/2006/relationships";
const TIPO_IMAGEN = `${NS_R}/image`;
const TIPO_DIBUJO = `${NS_R}/drawing`;
const CT_DIBUJO = "application/vnd.openxmlformats-officedocument.drawing+xml";

const EMU_POR_PX = 9525;
const emu = (px: number): number => Math.round(px * EMU_POR_PX);

const escapar = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Siguiente rId libre de un archivo .rels (rId1 si está vacío o no existe). */
function siguienteRId(relsXml: string | null): string {
  if (!relsXml) return "rId1";
  let max = 0;
  for (const m of relsXml.matchAll(/Id="rId(\d+)"/g)) {
    const n = parseInt(m[1], 10);
    if (n > max) max = n;
  }
  return `rId${max + 1}`;
}

/** Agrega una relación al final de un .rels, creándolo si no existía. */
function agregarRelacion(relsXml: string | null, id: string, tipo: string, destino: string): string {
  const rel = `<Relationship Id="${id}" Type="${tipo}" Target="${escapar(destino)}"/>`;
  if (!relsXml) {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n<Relationships xmlns="${NS_PKG_REL}">${rel}</Relationships>`;
  }
  return relsXml.replace("</Relationships>", `${rel}</Relationships>`);
}

/**
 * Ruta de la PRIMERA hoja del libro, resuelta por el índice del propio archivo
 * (workbook.xml → workbook.xml.rels) y no adivinada como "sheet1.xml": si algún
 * día el libro tuviera más de una hoja o SheetJS cambiara el nombre del archivo,
 * escribir a ciegas dejaría el dibujo colgado de una hoja que no es.
 */
async function rutaPrimeraHoja(zip: JSZip): Promise<string> {
  const wb = await zip.file("xl/workbook.xml")?.async("string");
  const rels = await zip.file("xl/_rels/workbook.xml.rels")?.async("string");
  if (wb && rels) {
    const rid = /<sheet\b[^>]*\br:id="([^"]+)"/.exec(wb)?.[1];
    if (rid) {
      const target = new RegExp(`Id="${rid}"[^>]*Target="([^"]+)"`).exec(rels)?.[1];
      if (target) {
        const limpio = target.replace(/^\/?xl\//, "").replace(/^\.\//, "");
        return `xl/${limpio}`;
      }
    }
  }
  return "xl/worksheets/sheet1.xml";
}

interface DibujoPrevio {
  /** Ruta del part del dibujo dentro del zip. */
  ruta: string;
  /** Ruta de su `.rels`. */
  rels: string;
}

/** Encuentra el dibujo que la hoja ya tiene colgado, siguiendo su `r:id` por el
 *  `.rels` de la hoja — no por el nombre del archivo. */
async function ubicarDibujo(
  zip: JSZip,
  hojaXml: string,
  relsHojaPath: string,
): Promise<DibujoPrevio | null> {
  const rid = /<drawing\b[^>]*\br:id="([^"]+)"/.exec(hojaXml)?.[1];
  if (!rid) return null;
  const rels = await zip.file(relsHojaPath)?.async("string");
  if (!rels) return null;
  const target = new RegExp(`Id="${rid}"[^>]*Target="([^"]+)"`).exec(rels)?.[1];
  if (!target) return null;
  const ruta = `xl/${target.replace(/^\/?xl\//, "").replace(/^\.\.\//, "").replace(/^\.\//, "")}`;
  return { ruta, rels: ruta.replace(/([^/]+)$/, "_rels/$1.rels") };
}

/** Borra del zip las imágenes que solo usaba el dibujo que se está reemplazando.
 *  Una imagen referenciada por OTRA parte del libro (un encabezado, otra hoja)
 *  no se toca: sacarla dejaría a esa otra parte apuntando a la nada. */
async function borrarMediaDelDibujo(zip: JSZip, relsDibujoPath: string): Promise<void> {
  const rels = await zip.file(relsDibujoPath)?.async("string");
  if (!rels) return;
  const rutas = new Set<string>();
  for (const m of rels.matchAll(/Target="([^"]+)"/g)) {
    if (!/\/media\//.test(m[1]) && !/^\.\.\/media\//.test(m[1])) continue;
    rutas.add(`xl/${m[1].replace(/^\/?xl\//, "").replace(/^\.\.\//, "").replace(/^\.\//, "")}`);
  }
  if (rutas.size === 0) return;
  // Se miran TODOS los demás .rels del libro antes de borrar.
  const otrosRels: string[] = [];
  zip.forEach((path, entry) => {
    if (entry.dir) return;
    if (path.endsWith(".rels") && path !== relsDibujoPath) otrosRels.push(path);
  });
  const usadasEnOtroLado = new Set<string>();
  for (const p of otrosRels) {
    const xml = await zip.file(p)?.async("string");
    if (!xml) continue;
    for (const ruta of rutas) {
      const archivo = ruta.split("/").pop() ?? "";
      if (archivo && xml.includes(archivo)) usadasEnOtroLado.add(ruta);
    }
  }
  for (const ruta of rutas) {
    if (!usadasEnOtroLado.has(ruta)) zip.remove(ruta);
  }
}

/** Prefijo libre para las imágenes nuevas: en un archivo ajeno puede haber
 *  `xl/media/image1.jpeg` de otra parte del libro y pisarlo sería destruirla. */
function prefijoMediaLibre(zip: JSZip): string {
  for (const p of ["imagen", "fgfoto", "fgfoto2", "fgfoto3"]) {
    if (!zip.file(`xl/media/${p}1.jpeg`)) return p;
  }
  return `fg${Date.now()}`;
}

/**
 * Devuelve el .xlsx con las fotos incrustadas.
 *
 * 🔴 SIN FOTOS DEVUELVE LOS BYTES TAL CUAL, sin abrir ni reescribir el ZIP —
 * o sea que el Excel de siempre sale idéntico al de siempre. Que las fotos sean
 * opcionales no puede significar "el archivo se re-empaqueta por las dudas".
 */
export async function incrustarFotosEnXlsx(
  xlsx: Uint8Array | ArrayBuffer,
  fotos: readonly FotoParaExcel[],
  opts: OpcionesIncrustar = {},
): Promise<Uint8Array> {
  const entrada = xlsx instanceof Uint8Array ? xlsx : new Uint8Array(xlsx);
  if (fotos.length === 0) return entrada;

  const columna = opts.columna ?? 0;
  const zip = await JSZip.loadAsync(entrada);

  const hoja = opts.hoja ?? (await rutaPrimeraHoja(zip));
  const hojaXml = await zip.file(hoja)?.async("string");
  if (!hojaXml) throw new Error("El Excel no tiene hoja donde pegar las fotos.");
  const relsHojaPath = hoja.replace(/([^/]+)$/, "_rels/$1.rels");
  const dibujoPrevio = opts.reemplazarDibujo
    ? await ubicarDibujo(zip, hojaXml, relsHojaPath)
    : null;
  if (hojaXml.includes("<drawing ") && !dibujoPrevio) {
    // SheetJS nunca escribe dibujos; si aparece uno, alguien más ya tocó el
    // archivo y pisarlo silenciosamente perdería su contenido.
    throw new Error("La hoja ya tenía un dibujo; no se pegaron las fotos.");
  }
  if (dibujoPrevio) await borrarMediaDelDibujo(zip, dibujoPrevio.rels);

  // ── media + relaciones del dibujo ─────────────────────────────────────────
  // Dos filas pueden compartir la MISMA foto (el mismo artículo en dos PO): esos
  // bytes se guardan una sola vez en el ZIP y las dos anclas apuntan a la misma
  // relación. Se compara por identidad del arreglo, no por contenido.
  const rIdDeBytes = new Map<Uint8Array, string>();
  const anclas: string[] = [];
  const prefijo = prefijoMediaLibre(zip);
  let relsDibujo = "";
  let medias = 0;
  for (let i = 0; i < fotos.length; i++) {
    const f = fotos[i];
    const n = i + 1;
    let rId = rIdDeBytes.get(f.bytes);
    if (!rId) {
      medias++;
      rId = `rId${medias}`;
      zip.file(`xl/media/${prefijo}${medias}.jpeg`, f.bytes);
      relsDibujo = agregarRelacion(relsDibujo, rId, TIPO_IMAGEN, `../media/${prefijo}${medias}.jpeg`);
      rIdDeBytes.set(f.bytes, rId);
    }
    anclas.push(
      `<xdr:oneCellAnchor>` +
        `<xdr:from><xdr:col>${columna}</xdr:col><xdr:colOff>${emu(f.offsetXPx ?? 0)}</xdr:colOff>` +
        `<xdr:row>${f.fila}</xdr:row><xdr:rowOff>${emu(f.offsetYPx ?? 0)}</xdr:rowOff></xdr:from>` +
        `<xdr:ext cx="${emu(f.anchoPx)}" cy="${emu(f.altoPx)}"/>` +
        `<xdr:pic>` +
          `<xdr:nvPicPr>` +
            `<xdr:cNvPr id="${n + 1}" name="Foto ${n}"/>` +
            `<xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr>` +
          `</xdr:nvPicPr>` +
          `<xdr:blipFill><a:blip xmlns:r="${NS_R}" r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>` +
          `<xdr:spPr>` +
            `<a:xfrm><a:off x="0" y="0"/><a:ext cx="${emu(f.anchoPx)}" cy="${emu(f.altoPx)}"/></a:xfrm>` +
            `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>` +
          `</xdr:spPr>` +
        `</xdr:pic>` +
        `<xdr:clientData/>` +
      `</xdr:oneCellAnchor>`,
    );
  }

  // Reusando el dibujo que ya estaba: mismo part, misma relación, mismo
  // `<drawing r:id>` en la hoja y mismo Override. Así el reemplazo toca UNA
  // parte del archivo en vez de cinco.
  const rutaDibujo = dibujoPrevio?.ruta ?? "xl/drawings/drawing1.xml";
  const rutaRelsDibujo = dibujoPrevio?.rels ?? "xl/drawings/_rels/drawing1.xml.rels";
  zip.file(
    rutaDibujo,
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n` +
      `<xdr:wsDr xmlns:xdr="${NS_XDR}" xmlns:a="${NS_A}">${anclas.join("")}</xdr:wsDr>`,
  );
  zip.file(rutaRelsDibujo, relsDibujo);

  if (!dibujoPrevio) {
    // ── la hoja apunta al dibujo ────────────────────────────────────────────
    const relsHojaPrev = (await zip.file(relsHojaPath)?.async("string")) ?? null;
    const rIdDibujo = siguienteRId(relsHojaPrev);
    zip.file(relsHojaPath, agregarRelacion(relsHojaPrev, rIdDibujo, TIPO_DIBUJO, `../drawings/${rutaDibujo.split("/").pop()}`));

    // <drawing> va al FINAL del elemento <worksheet> (después de <ignoredErrors>,
    // que es lo último que escribe SheetJS): ese es el orden que exige el esquema.
    zip.file(hoja, hojaXml.replace("</worksheet>", `<drawing r:id="${rIdDibujo}"/></worksheet>`));
  }

  // ── content types ─────────────────────────────────────────────────────────
  const ctPath = "[Content_Types].xml";
  let ct = await zip.file(ctPath)?.async("string");
  if (!ct) throw new Error("El Excel no tiene [Content_Types].xml.");
  if (!/Extension="jpeg"/i.test(ct)) {
    ct = ct.replace("<Override", `<Default Extension="jpeg" ContentType="image/jpeg"/><Override`);
  }
  if (!ct.includes(`/${rutaDibujo}`)) {
    ct = ct.replace(
      "</Types>",
      `<Override PartName="/${rutaDibujo}" ContentType="${CT_DIBUJO}"/></Types>`,
    );
  }
  zip.file(ctPath, ct);

  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}
