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

  const hoja = await rutaPrimeraHoja(zip);
  const hojaXml = await zip.file(hoja)?.async("string");
  if (!hojaXml) throw new Error("El Excel no tiene hoja donde pegar las fotos.");
  if (hojaXml.includes("<drawing ")) {
    // SheetJS nunca escribe dibujos; si aparece uno, alguien más ya tocó el
    // archivo y pisarlo silenciosamente perdería su contenido.
    throw new Error("La hoja ya tenía un dibujo; no se pegaron las fotos.");
  }

  // ── media + relaciones del dibujo ─────────────────────────────────────────
  // Dos filas pueden compartir la MISMA foto (el mismo artículo en dos PO): esos
  // bytes se guardan una sola vez en el ZIP y las dos anclas apuntan a la misma
  // relación. Se compara por identidad del arreglo, no por contenido.
  const rIdDeBytes = new Map<Uint8Array, string>();
  const anclas: string[] = [];
  let relsDibujo = "";
  let medias = 0;
  for (let i = 0; i < fotos.length; i++) {
    const f = fotos[i];
    const n = i + 1;
    let rId = rIdDeBytes.get(f.bytes);
    if (!rId) {
      medias++;
      rId = `rId${medias}`;
      zip.file(`xl/media/imagen${medias}.jpeg`, f.bytes);
      relsDibujo = agregarRelacion(relsDibujo, rId, TIPO_IMAGEN, `../media/imagen${medias}.jpeg`);
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

  zip.file(
    "xl/drawings/drawing1.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n` +
      `<xdr:wsDr xmlns:xdr="${NS_XDR}" xmlns:a="${NS_A}">${anclas.join("")}</xdr:wsDr>`,
  );
  zip.file("xl/drawings/_rels/drawing1.xml.rels", relsDibujo);

  // ── la hoja apunta al dibujo ──────────────────────────────────────────────
  const relsHojaPath = hoja.replace(/([^/]+)$/, "_rels/$1.rels");
  const relsHojaPrev = (await zip.file(relsHojaPath)?.async("string")) ?? null;
  const rIdDibujo = siguienteRId(relsHojaPrev);
  zip.file(relsHojaPath, agregarRelacion(relsHojaPrev, rIdDibujo, TIPO_DIBUJO, "../drawings/drawing1.xml"));

  // <drawing> va al FINAL del elemento <worksheet> (después de <ignoredErrors>,
  // que es lo último que escribe SheetJS): ese es el orden que exige el esquema.
  zip.file(hoja, hojaXml.replace("</worksheet>", `<drawing r:id="${rIdDibujo}"/></worksheet>`));

  // ── content types ─────────────────────────────────────────────────────────
  const ctPath = "[Content_Types].xml";
  let ct = await zip.file(ctPath)?.async("string");
  if (!ct) throw new Error("El Excel no tiene [Content_Types].xml.");
  if (!/Extension="jpeg"/i.test(ct)) {
    ct = ct.replace("<Override", `<Default Extension="jpeg" ContentType="image/jpeg"/><Override`);
  }
  if (!ct.includes("/xl/drawings/drawing1.xml")) {
    ct = ct.replace(
      "</Types>",
      `<Override PartName="/xl/drawings/drawing1.xml" ContentType="${CT_DIBUJO}"/></Types>`,
    );
  }
  zip.file(ctPath, ct);

  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}
