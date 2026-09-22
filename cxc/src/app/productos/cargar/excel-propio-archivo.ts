// ─────────────────────────────────────────────────────────────────────────────
// 🩸 RETIRADO DE LA PANTALLA EL 22-sep-2026 — «Fotos a mi Excel».
//
// Daniel: *«si si borra ese»* (y, en la misma frase, *«y no talla por bulto»*:
// «Tallas por bulto» SE QUEDA). Medido contra producción antes de tocar nada:
// `activity_logs` no tiene NI UNA fila de `descarga_misfotos` en toda su
// historia — cero usos. El contador escribe de verdad (se comprobó con las
// filas de `descarga_excel` del 20-sep-2026), así que ese cero sí significa
// «nadie lo usó».
//
// 🔴 EL CÓDIGO NO SE BORRA (patrón `mayor_lineas`, `csv-export.ts`,
// `cxc_favorites`): queda acá, SIN LECTORES, con la explicación de por qué este
// camino no pasa por `xlsx-js-style`. El candado
// `src/__tests__/lib/fotos-a-mi-excel-retirado.test.ts` pone el build ROJO si
// alguien vuelve a montarlo en una pantalla.
//
// ⚠️ LO QUE SÍ SIGUE VIVO Y NO SE TOCÓ (lo usa el pedido de Reebok):
// `lib/depurador/fotos-excel.ts` (el emparejador), `lib/depurador/fotos-xlsx.ts`
// (el armador del zip) y `app/productos/cargar/fotos-carpeta.ts`
// (`prepararFotos` → `compressImage`).
// ─────────────────────────────────────────────────────────────────────────────

// El lado "archivo" del camino "subo MI Excel y le pegan las fotos": abre el
// .xlsx/.xlsm que eligió la persona, le pregunta las cosas al módulo PURO
// (`lib/depurador/excel-propio.ts`) y arma la salida.
//
// 🔑 LAS FOTOS NO SE SUBEN A NINGÚN LADO Y EL EXCEL TAMPOCO. Acá no hay un solo
// `fetch`: el archivo se lee de la máquina de la persona, se le pegan las fotos
// de la carpeta que eligió, y el resultado se descarga. Nada sale del navegador.
//
// 🔴 NO SE PASA POR `xlsx-js-style`. Leer con SheetJS y volver a escribir arma
// un archivo NUEVO, y este camino promete lo contrario: el archivo de Daniel
// vuelve igual salvo la columna A. Se abre el zip, se tocan tres partes y se
// cierra.

import {
  cajaDeFila,
  escribirColumnaFoto,
  hojaTieneDibujo,
  leerHoja,
  leerSharedStrings,
  medirCeldaFoto,
  resolverHojas,
  type GeometriaHoja,
  type HojaDelLibro,
  type LecturaHoja,
  type PlanCeldaFoto,
} from "@/lib/depurador/excel-propio";
import type { FotoParaExcel } from "@/lib/depurador/fotos-xlsx";

export interface AnalisisLibro {
  nombreArchivo: string;
  /** Los bytes tal como llegaron: cada descarga parte de ellos, nunca de un zip
   *  ya modificado (pegar dos veces sobre el mismo objeto duplicaría el trabajo). */
  bytes: Uint8Array;
  hojas: HojaDelLibro[];
  hoja: HojaDelLibro;
  lectura: LecturaHoja;
  geometria: GeometriaHoja;
  /** El archivo trae macros (`xl/vbaProject.bin`) y por lo tanto se conservan. */
  tieneMacro: boolean;
  /** La hoja ya tenía fotos pegadas (el macro de VBA ya corrió sobre ella). */
  yaTieneFotos: boolean;
}

/** Abre el libro y contesta todo lo que la pantalla necesita decir ANTES de que
 *  la persona elija la carpeta. No escribe nada. */
export async function analizarLibro(file: File): Promise<AnalisisLibro> {
  const JSZip = (await import("jszip")).default;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const zip = await JSZip.loadAsync(bytes);

  const wb = await zip.file("xl/workbook.xml")?.async("string");
  const rels = await zip.file("xl/_rels/workbook.xml.rels")?.async("string");
  if (!wb || !rels) throw new Error("No pude leer el archivo. ¿Seguro que es un Excel (.xlsx o .xlsm)?");

  const hojas = resolverHojas(wb, rels);
  const hoja = hojas[0];
  if (!hoja) throw new Error("El archivo no tiene ninguna hoja.");

  const sheetXml = await zip.file(hoja.ruta)?.async("string");
  if (!sheetXml) throw new Error("No pude leer la hoja del archivo.");
  const sst = leerSharedStrings(await zip.file("xl/sharedStrings.xml")?.async("string"));

  return {
    nombreArchivo: file.name,
    bytes,
    hojas,
    hoja,
    lectura: leerHoja(sheetXml, sst),
    geometria: medirCeldaFoto(sheetXml),
    tieneMacro: !!zip.file("xl/vbaProject.bin"),
    yaTieneFotos: hojaTieneDibujo(sheetXml),
  };
}

/**
 * Devuelve el libro con la columna A escrita y las fotos pegadas.
 *
 * `fotos[i].fila` ya viene en fila 0-based de la hoja REAL (la pantalla se lo
 * pasa a `prepararFotos` con `filaDe`), así que acá no se vuelve a calcular
 * ninguna posición: dos cuentas del mismo número es cómo la foto termina una
 * fila más abajo.
 */
export async function armarLibroConFotos(
  analisis: AnalisisLibro,
  plan: ReadonlyMap<number, PlanCeldaFoto>,
  fotos: readonly FotoParaExcel[],
): Promise<Uint8Array> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(analisis.bytes);

  const sheetXml = await zip.file(analisis.hoja.ruta)?.async("string");
  if (!sheetXml) throw new Error("No pude leer la hoja del archivo.");
  zip.file(analisis.hoja.ruta, escribirColumnaFoto(sheetXml, plan));

  const conColumna = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  if (fotos.length === 0) return conColumna;

  const { incrustarFotosEnXlsx } = await import("@/lib/depurador/fotos-xlsx");
  return incrustarFotosEnXlsx(conColumna, fotos, {
    hoja: analisis.hoja.ruta,
    columna: 0,
    // El archivo de siempre YA trae las fotos que le pegó el macro: se
    // reemplazan por las nuevas en vez de cortar con error.
    reemplazarDibujo: true,
  });
}

/** Medidas de la celda de la fila `filaExcel` (1-based), para encajar la foto. */
export function celdaDeFilaExcel(analisis: AnalisisLibro, filaExcel: number) {
  return cajaDeFila(analisis.geometria, filaExcel);
}
