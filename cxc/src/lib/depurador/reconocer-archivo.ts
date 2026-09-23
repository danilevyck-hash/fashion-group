// ─────────────────────────────────────────────────────────────────────────────
// LA CAJA DICE QUÉ ARCHIVO RECONOCIÓ, ANTES DE PROCESARLO (23-sep-2026)
//
// 🩸 El olfateo del `DepuradorDispatcher` elige entre cuatro caminos —Calvin /
// Tommy / Karl · Reebok confirmación · Reebok despacho · Facturas Tienda— y
// hasta hoy, cuando NO entendía el archivo, caía a Calvin/Tommy EN SILENCIO:
// el `catch` ponía `kind = "ckth"` y la persona veía el error recién adentro,
// después de haber esperado. Medido el 23-sep-2026 contra los 10 Excel
// guardados en el Historial (bucket `depurador-plantillas`): los 10 son la
// SALIDA de 25 columnas, no un archivo de proveedor, y los 10 caían igual al
// camino de Calvin/Tommy.
//
// 🔴 EL OLFATEO NO CAMBIA. Las mismas tres preguntas, en el mismo orden, con
// las mismas funciones (`findHeaderRow`, `findHeaderRowDespacho`,
// `detectFactura`). Lo único nuevo es que el resultado se DICE y que un archivo
// que nadie reconoce no entra a ningún camino.
//
// 🔴 QUÉ ES UN ARCHIVO DE CALVIN/TOMMY/KARL SE PREGUNTA UNA SOLA VEZ:
// `columnasQueFaltan` es la MISMA lista con la que `processRows` frena. Si la
// caja dijera «reconocido» con otra regla, diría que sí de algo que revienta
// dos segundos después.
//
// Módulo PURO: sin DOM, sin red, sin xlsx. Los detectores entran por parámetro
// para que el despachador los siga cargando bajo demanda (`import()`), que es
// lo que mantiene fuera del paquete inicial a `reebok.ts` y `tienda.ts`.
// ─────────────────────────────────────────────────────────────────────────────

import {
  columnasQueFaltan,
  companiaLabel,
  empresasReconocidas,
  marcasDelArchivo,
  pickBestSheet,
  EMPRESAS_DESTINO,
  type SheetRow,
} from "./logic";

/** Los tres flujos que existen hoy en `/productos/cargar`. */
export type Camino = "ckth" | "reebok" | "tienda";

export interface HojaCruda {
  nombre: string;
  filas: SheetRow[];
}

/** Lo que el despachador sabe preguntar por cada hoja. Se inyectan para no
 *  arrastrar `reebok.ts` ni `tienda.ts` al paquete inicial. */
export interface Detectores {
  reebokCompra(filas: SheetRow[]): boolean;
  reebokDespacho(filas: SheetRow[]): boolean;
  facturaTienda(filas: SheetRow[]): boolean;
}

export interface Reconocimiento {
  /** `null` = no lo reconozco. NO se procesa. */
  camino: Camino | null;
  /** Lo que se dibuja en la caja. Siempre en español, sin jerga. */
  texto: string;
  /** Compañías que las marcas del archivo reconocieron (solo Calvin/Tommy/Karl).
   *  0 = ninguna marca del catálogo opinó · 1 = se sabe · 2+ = se elige adentro. */
  empresas: string[];
}

/** Lo que dice la caja cuando el archivo no es de ninguno de los cuatro tipos. */
export const TEXTO_NO_RECONOZCO = "No reconozco este archivo — no se procesa";

/** Lo que dice la caja cuando sí. Se arma acá para que las cuatro entradas
 *  suenen igual. */
const reconocido = (marca: string, empresa: string): string =>
  `Reconocido: ${marca} → ${empresa}`;

/** La marca que le corresponde a una compañía destino («Calvin» → Vistana). Sale
 *  de `EMPRESAS_DESTINO`, la misma lista de siempre. */
function marcaDeEmpresa(key: string): string {
  return EMPRESAS_DESTINO.find((e) => e.key === key)?.marca ?? "";
}

/** El reconocimiento de un archivo de Calvin / Tommy / Karl, ya sabiendo que
 *  sus columnas están. */
function textoCkth(empresas: string[]): string {
  if (empresas.length === 1) {
    return reconocido(marcaDeEmpresa(empresas[0]), companiaLabel(empresas[0]));
  }
  if (empresas.length > 1) {
    const marcas = empresas.map(marcaDeEmpresa).filter(Boolean).join(" y ");
    return reconocido(marcas, `${empresas.length} compañías, eliges una adentro`);
  }
  // Las columnas están pero ninguna marca del catálogo opinó: el archivo es
  // válido y la compañía se elige adentro. No se adivina ninguna.
  return reconocido("archivo del proveedor", "la compañía se elige adentro");
}

/**
 * Qué archivo es. PURA.
 *
 * El orden es el de siempre: CSV → Facturas Tienda; después, hoja por hoja,
 * Reebok (compra o despacho) y Facturas Tienda; al final, Calvin/Tommy/Karl,
 * que ahora se COMPRUEBA en vez de darse por descontado.
 */
export function reconocerArchivo(
  nombreArchivo: string,
  hojas: readonly HojaCruda[],
  det: Detectores,
): Reconocimiento {
  // El CSV (';') solo lo come Facturas Tienda: no hace falta abrirlo.
  if (/\.csv$/i.test(nombreArchivo)) {
    return { camino: "tienda", texto: reconocido("Facturas de tienda", "Multifashion"), empresas: [] };
  }

  for (const { filas } of hojas) {
    // 🔴 Reebok entra por DOS archivos —la confirmación de compra y el
    // despacho— y los dos van al mismo flujo. Se olfatean por CONTENIDO, nunca
    // por el nombre de la hoja.
    if (det.reebokCompra(filas) || det.reebokDespacho(filas)) {
      return { camino: "reebok", texto: reconocido("Reebok", "Active Shoes"), empresas: [] };
    }
    if (det.facturaTienda(filas)) {
      return { camino: "tienda", texto: reconocido("Facturas de tienda", "Multifashion"), empresas: [] };
    }
  }

  const mejor = pickBestSheet(hojas.map(({ nombre, filas }) => ({ name: nombre, rows: filas })));
  if (mejor && mejor.length && columnasQueFaltan(mejor[0]).length === 0) {
    const empresas = empresasReconocidas(marcasDelArchivo(mejor));
    return { camino: "ckth", texto: textoCkth(empresas), empresas };
  }

  return { camino: null, texto: TEXTO_NO_RECONOZCO, empresas: [] };
}

/**
 * A qué camino se manda el archivo.
 *
 * 🔴 CON EL INTERRUPTOR APAGADO SE PORTA COMO ANTES: lo que no se reconoce cae
 * a Calvin/Tommy. Prendido, lo que no se reconoce NO se procesa.
 */
export function caminoAProcesar(rec: Reconocimiento, prendido: boolean): Camino | null {
  if (prendido) return rec.camino;
  return rec.camino ?? "ckth";
}
