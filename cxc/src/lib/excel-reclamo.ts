// ─────────────────────────────────────────────────────────────────────────────
// RECLAMOS — LA HOJA EXCEL DE UN RECLAMO, CON LA FORMA DEL PAPEL
// (11-sep-2026, mockup aprobado por Daniel).
//
// 🔴 LAS FILAS Y EL PIE SALEN DE `lib/reclamos/papel.ts`, el MISMO módulo que
// dibuja el PDF. Antes cada superficie tenía su propia lista de columnas —el
// Excel ocho fijas, el PDF siete distintas, la pantalla diez condicionales— y
// las tres decían cosas distintas del mismo reclamo. Separarlas otra vez es
// volver a eso.
//
// Lo que cambió con el mockup:
//   · La cabecera dice FASHION GROUP y la empresa, y la ficha arranca por el
//     N° de reclamo y la FECHA DE LA FACTURA (la que mide los días).
//   · Las columnas vacías (Género, Factura, PO) no se dibujan.
//   · El pie de totales va a la derecha y uno debajo del otro —Subtotal ·
//     Importación N% · ITBMS N% · Total con raya arriba—, como el pie de la
//     factura del proveedor. Se fue la banda «TOTAL A ACREDITAR».
//
// 🔴 EL EXCEL NO LLEVA NI UN LINK, NI EL QUE SE MANDA NI EL QUE SE DESCARGA
// (11-sep-2026). Daniel, textual: *«sin links»*. Llevaba dos: la factura
// firmada por UN AÑO contra el bucket privado y una galería PÚBLICA de fotos
// abierta con un token HMAC sin vencimiento. Los dos eran accesos de larga vida
// a archivos nuestros, viajando dentro de un archivo que se reenvía. La factura
// y las fotos se bajan desde la página del reclamo —«Descargar › Factura del
// proveedor» y las fotos ahí mismo— y viajan ADJUNTAS al correo del proveedor.
// Con eso la galería pública se quedó sin un solo lector y se retiró.
// ─────────────────────────────────────────────────────────────────────────────

import XLSX from "xlsx-js-style";
import { fmtDate } from "@/lib/format";
import {
  columnasDelPapel,
  datosDelPapel,
  fechaDeLaCabecera,
  itemsDelPapel,
  subtotalDelPapel,
  totalesDelPapel,
  valorDeCelda,
  type ContactoDePapel,
  type ItemDePapel,
  type ReclamoDePapel,
} from "@/lib/reclamos/papel";
import { addr, makeCellStyles, CASA_PALETTE, MONEY_FMT } from "@/lib/excel-export";

interface ReclamoFoto {
  url?: string;
  storage_path: string;
}

// Paleta y celdas del estilo de la casa (helper estándar de exports — I11):
// PRI/MID/SEP/bordes vienen de CASA_PALETTE vía makeCellStyles.
const { B, fillRow, hdr, td, tdN, band, palette } = makeCellStyles(CASA_PALETTE);

// Fondos propios de la FICHA de reclamo (label azul claro / valor casi blanco).
// El helper no los provee — quedan como constantes del módulo.
const LBL_BG = "EBF5FB";
const VAL_BG = "FDFEFE";
/** Ancho mínimo de la hoja en columnas, para que las bandas de arriba no queden
 *  apretadas cuando el reclamo trae pocas columnas con datos. */
const COLUMNAS_MINIMAS = 7;

export interface OpcionesHojaReclamo {
  /** El contacto del proveedor, para la ficha (mismo dato que la línea del PDF). */
  contacto?: ContactoDePapel | null;
}

export function buildReclamoSheet(
  rec: Record<string, unknown>,
  items: Record<string, unknown>[],
  // Las fotos ya NO se dibujan (no hay link que poner). Se conserva en la firma
  // porque la pasan las tres rutas que arman este Excel, y sacarla del
  // parámetro no compra nada.
  _fotos: ReclamoFoto[] = [],
  opts: OpcionesHojaReclamo = {},
): XLSX.WorkSheet {
  const nroReclamo = String(rec.nro_reclamo || "");
  const empresa = String(rec.empresa || "");

  // 🔴 Los renglones y las columnas salen del módulo del papel. `items` llega
  // por parámetro (así lo llaman las 3 rutas), pero si el reclamo los trae
  // adentro se usa esa lista, que es la que ya filtra los borrados.
  const delReclamo = itemsDelPapel(rec as ReclamoDePapel);
  const renglones: ItemDePapel[] = delReclamo.length
    ? delReclamo
    : (items as ItemDePapel[]).filter((i) => !i?.deleted);
  const columnas = columnasDelPapel(renglones);
  const CMAX = Math.max(columnas.length, COLUMNAS_MINIMAS) - 1;

  const ws: XLSX.WorkSheet = {};
  const h: number[] = [];
  const merges: XLSX.Range[] = [];
  let r = 0;

  // Cabecera: FASHION GROUP y, debajo, la empresa (mockup 11-sep-2026 — antes
  // decía «Reclamo a Proveedor», que es lo que dice el título del archivo).
  band(ws, r, CMAX, merges, "FASHION GROUP", palette.pri, 18); h[r] = 32; r++;
  band(ws, r, CMAX, merges, empresa || "Reclamo a Proveedor", palette.mid, 12); h[r] = 22; r++;
  fillRow(ws, r, CMAX, palette.sep); merges.push({ s: { r, c: 0 }, e: { r, c: CMAX } }); h[r] = 6; r++;

  // Metadata helpers (layout de ficha: label LBL_BG / valor VAL_BG)
  const mLbl = (v: string) => ({ v, t: "s", s: { font: { bold: true, sz: 10, color: { rgb: palette.pri }, name: "Calibri" }, fill: { fgColor: { rgb: LBL_BG } }, alignment: { horizontal: "left" }, border: B } });
  const mVal = (v: string, bold = false) => ({ v, t: "s", s: { font: { bold, sz: 10, color: { rgb: "111111" }, name: "Calibri" }, fill: { fgColor: { rgb: VAL_BG } }, alignment: { horizontal: "left" }, border: { bottom: { style: "thin", color: { rgb: palette.brd } } } } });

  // La ficha, en el orden del papel: N° de reclamo y FECHA DE LA FACTURA
  // primero, y después la misma línea de datos del PDF (Proveedor · Marca ·
  // Factura · PO · Contacto), sin los renglones que están vacíos.
  const fechaCabecera = fechaDeLaCabecera(rec as ReclamoDePapel);
  const meta: [string, string, boolean][] = [
    ["N° Reclamo", nroReclamo, true],
    ...(fechaCabecera ? [["Fecha de factura", fmtDate(fechaCabecera), false] as [string, string, boolean]] : []),
    ...datosDelPapel(rec as ReclamoDePapel, opts.contacto ?? null).map(
      (d) => [d.rotulo, d.valor, d.rotulo.startsWith("Factura")] as [string, string, boolean],
    ),
  ];

  for (const [lbl, val, bold] of meta) {
    ws[addr(r, 0)] = mLbl(lbl);
    ws[addr(r, 1)] = mVal(val, bold as boolean);
    for (let c = 2; c <= CMAX; c++) ws[addr(r, c)] = { v: "", t: "s", s: { fill: { fgColor: { rgb: VAL_BG } } } };
    merges.push({ s: { r, c: 1 }, e: { r, c: CMAX } });
    h[r] = 18; r++;
  }

  // Separator
  fillRow(ws, r, CMAX, palette.sep); merges.push({ s: { r, c: 0 }, e: { r, c: CMAX } }); h[r] = 8; r++;

  // Encabezados de la tabla — los que de verdad traen datos.
  columnas.forEach((c, i) => { ws[addr(r, i)] = hdr(c.rotulo, c.tipo === "texto" ? "left" : "center"); });
  for (let c = columnas.length; c <= CMAX; c++) ws[addr(r, c)] = hdr("", "center");
  h[r] = 22; r++;

  // Items (celdas td/tdN del helper; alt=true → fondo dataBg uniforme)
  for (const item of renglones) {
    columnas.forEach((c, i) => {
      const v = valorDeCelda(item, c.clave);
      if (c.tipo === "dinero") {
        ws[addr(r, i)] = tdN(Number(v) || 0, true, { fmt: MONEY_FMT, bold: c.clave === "subtotal", fg: "111111" });
        return;
      }
      if (c.tipo === "entero") {
        ws[addr(r, i)] = tdN(Number(v) || 0, true, { fg: "111111" });
        return;
      }
      if (c.clave === "descripcion") {
        ws[addr(r, i)] = td(String(v), true, { fg: "111111" });
        return;
      }
      if (c.clave === "motivo") {
        const motivo = td(String(v), true, { fg: "666666", sz: 9 });
        Object.assign(motivo.s.font, { italic: true });
        ws[addr(r, i)] = motivo;
        return;
      }
      if (c.clave === "talla" || c.clave === "genero") {
        ws[addr(r, i)] = td(String(v), true, { fg: "555555", sz: 9, ha: "center" });
        return;
      }
      ws[addr(r, i)] = td(String(v), true, { sz: 9 });
    });
    for (let c = columnas.length; c <= CMAX; c++) ws[addr(r, c)] = td("", true, { sz: 9 });
    h[r] = 18; r++;
  }

  // Spacer
  ws[addr(r, 0)] = { v: "", t: "s", s: { fill: { fgColor: { rgb: "FFFFFF" } } } };
  h[r] = 6; r++;

  // 🔴 EL PIE DE TOTALES, A LA DERECHA Y UNO DEBAJO DEL OTRO — el mismo de
  // `papel.ts` que dibuja el PDF, con el Total en negrita y raya arriba. Antes
  // esto terminaba en una banda azul «TOTAL A ACREDITAR» que ninguna factura de
  // proveedor tiene.
  const subtotal = subtotalDelPapel(renglones);
  const colRotulo = Math.max(CMAX - 1, 0);
  const colValor = CMAX;
  const tLbl = (v: string, fuerte: boolean) => ({ v, t: "s", s: { font: { bold: true, sz: fuerte ? 11 : 9, color: { rgb: fuerte ? "111111" : palette.pri }, name: "Calibri" }, fill: { fgColor: { rgb: "FFFFFF" } }, alignment: { horizontal: "right" }, ...(fuerte ? { border: { top: { style: "medium", color: { rgb: "111111" } } } } : {}) } });
  const tVal = (v: number, fuerte: boolean) => ({ v, t: "n", z: MONEY_FMT, s: { font: { bold: fuerte, sz: fuerte ? 11 : 10, color: { rgb: "111111" }, name: "Calibri" }, fill: { fgColor: { rgb: "FFFFFF" } }, alignment: { horizontal: "right" }, border: fuerte ? { top: { style: "medium", color: { rgb: "111111" } } } : { bottom: { style: "thin", color: { rgb: palette.brd } } } } });

  for (const t of totalesDelPapel(empresa, subtotal)) {
    ws[addr(r, colRotulo)] = tLbl(`${t.rotulo}:`, t.fuerte);
    ws[addr(r, colValor)] = tVal(t.valor, t.fuerte);
    h[r] = t.fuerte ? 22 : 16; r++;
  }

  // 🩸 Acá iba la sección «ARCHIVOS Y EVIDENCIA», con un link a la factura
  // firmada por un año y otro a la galería pública de fotos. Se retiró el
  // 11-sep-2026 (Daniel: *«sin links»*) y con ella la galería entera: no hay
  // una versión de este Excel que los lleve.

  ws["!ref"] = `A1:${XLSX.utils.encode_col(CMAX)}${r}`;
  ws["!merges"] = merges;
  ws["!cols"] = Array.from({ length: CMAX + 1 }, (_, i) => ({ wch: columnas[i]?.wch ?? 12 }));
  ws["!rows"] = h.map((v) => ({ hpt: v || 16 }));

  return ws;
}
