// ─────────────────────────────────────────────────────────────────────────────
// DESCARGAR SIN ENTRAR AL DETALLE — la flechita de la celda. (módulo PURO)
//
// 🩸 CINCO TOQUES PARA BAJAR UN REPORTE (8-sep-2026). Para llevarse el detalle
// de un vendedor en una empresa había que: tocar la celda → esperar a que
// cargue → bajar hasta el detalle → «Descargar el detalle» → cerrar. Y otra vez
// para cada una de las seis empresas: un cierre de mes de una persona costaba
// treinta toques y seis idas y vueltas por la misma pantalla.
//
// Ahora, pegada al número y en gris, va una **flechita ↓** que abre un menú de
// dos líneas: «Descargar en PDF» y «Descargar en Excel». Dos toques.
//
// 🔴 LA FLECHITA NO REEMPLAZA NADA. Tocar el número sigue abriendo el detalle
// exactamente como hoy: la flecha AGREGA un camino corto, no cambia el que ya
// existía. Quien quiere mirar antes de bajar, mira.
//
// 🔴 SOLO SE DIBUJA DONDE HAY ALGO QUE BAJAR. Una celda en guion (`—`) no la
// lleva: es la regla 6 de la casa —un control que no ofrece nada no se dibuja—
// y la decisión de «¿esta celda tiene algo?» NO se vuelve a escribir acá, sale
// de `celdaVacia` (`lib/comisiones/matriz-celda`), que es la misma que decide
// si la celda dice `—`. Dos funciones para la misma pregunta es cómo se llega a
// una flecha sobre un guion.
//
// 🔴 TRES ALCANCES, CADA UNO DONDE CORRESPONDE:
//   · la flecha de una CELDA .......... esa empresa;
//   · la flecha de la columna TOTAL ... todas las empresas de esa persona, en
//     UN solo archivo;
//   · los botones de ARRIBA ........... el mes entero, las 6 empresas.
//
// ⚠️ CON «TODO EL AÑO» NO HAY FLECHA. La celda tampoco abre detalle (ya era
// así): el reporte por vendedor es de UN mes — `comision_b2b_detalle` recibe
// year + mes—, así que una flecha ahí prometería un archivo que no existe.
// ─────────────────────────────────────────────────────────────────────────────

import { celdaVacia } from "./matriz-celda";
import { MESES_LARGOS, esTodoElAnio, rotuloDescargarPeriodo } from "./periodo";

/** Las dos líneas del menú de la flechita. */
export const ROTULO_DESCARGAR_PDF = "Descargar en PDF";
export const ROTULO_DESCARGAR_EXCEL = "Descargar en Excel";

/** Lo que dice el menú cuando el alcance son todas las empresas de la persona. */
export const ROTULO_TODAS_LAS_EMPRESAS = "Todas las empresas";

/** Lo que se lee al tocar la flecha (lector de pantalla y `title`). */
export const ROTULO_FLECHA = "Descargar";

/**
 * ¿Esta celda lleva flechita?
 *
 * Es EXACTAMENTE lo contrario de dibujar el guion: si la celda no tiene nada
 * que decir, tampoco tiene nada que descargar. La pregunta se le hace a
 * `celdaVacia`, nunca se responde acá.
 */
export function hayQueDescargar(valor: number | undefined, descuento = 0): boolean {
  return !celdaVacia(valor, descuento);
}

/**
 * Las empresas de esa persona que tienen algo que bajar — el alcance de la
 * flecha de la columna «Total».
 *
 * Conserva el orden de las columnas de la matriz: el archivo sale con las hojas
 * en el mismo orden en que se ven en pantalla.
 */
export function empresasConComision(
  porEmpresa: Record<string, number | undefined> | undefined,
  descuentoPorEmpresa: Record<string, number | undefined> | undefined,
  empresas: readonly string[],
): string[] {
  return empresas.filter((k) =>
    hayQueDescargar(porEmpresa?.[k], descuentoPorEmpresa?.[k] ?? 0),
  );
}

/**
 * ¿La flecha del Total se dibuja? Solo si hay al menos una empresa con algo.
 *
 * Una fila entera en guiones no llega a la matriz (la vista solo dibuja a quien
 * tuvo actividad), pero la regla se escribe igual: el día que llegue, la flecha
 * no aparece.
 */
export function hayQueDescargarTotal(
  porEmpresa: Record<string, number | undefined> | undefined,
  descuentoPorEmpresa: Record<string, number | undefined> | undefined,
  empresas: readonly string[],
): boolean {
  return empresasConComision(porEmpresa, descuentoPorEmpresa, empresas).length > 0;
}

/**
 * ¿Este período ofrece descarga por vendedor? Con «Todo el año», no: el reporte
 * por vendedor es de un mes. Misma condición que abrir el detalle.
 */
export function conDescargaPorVendedor(mes: number): boolean {
  return !esTodoElAnio(mes);
}

/**
 * El encabezado del menú: `Reynaldo Espinosa · Fashion Shoes · Agosto`.
 *
 * Con `empresaNombre` en `null` el alcance son todas: `… · Todas las empresas ·
 * Agosto`. El AÑO no va — lo dice el selector de período, que está a la vista
 * (pantallas sin palabras de más).
 */
export function tituloDescarga(
  vendedorEnPantalla: string,
  empresaNombre: string | null,
  mes: number,
): string {
  return [vendedorEnPantalla, empresaNombre ?? ROTULO_TODAS_LAS_EMPRESAS, MESES_LARGOS[mes - 1]]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Los DOS botones de arriba: el período en los dos formatos.
 *
 * 🔄 9-SEP-2026 — «DESCARGAR EL AÑO» TAMBIÉN LLEVA PDF. Acá decía que el año se
 * quedaba en Excel «porque el reporte por vendedor es de un mes». Era mezclar
 * dos papeles distintos: el del vendedor sí es de un mes (y por eso la flechita
 * de la celda sigue sin aparecer con «Todo el año»), pero el de arriba es LA
 * MATRIZ, que existe igual para el año. Daniel: *«Los paso a PDF también, para
 * que todo el módulo se comporte igual»*.
 *
 * 🔴 EL «EL MES» / «EL AÑO» SIGUE SALIENDO DE UN SOLO LUGAR: los dos rótulos le
 * pegan « en PDF» o « en Excel» al que ya existía (`rotuloDescargarPeriodo`).
 * Escribir de nuevo esas dos palabras acá es cómo se llega a que un botón diga
 * «el mes» y el de al lado «este mes».
 */
export function rotuloDescargarPdf(mes: number): string {
  return `${rotuloDescargarPeriodo(mes)} en PDF`;
}

export function rotuloDescargarExcel(mes: number): string {
  return `${rotuloDescargarPeriodo(mes)} en Excel`;
}
