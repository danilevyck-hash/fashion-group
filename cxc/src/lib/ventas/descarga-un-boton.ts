// ─────────────────────────────────────────────────────────────────────────────
// 🔴 «DESCARGAR» ES UN SOLO BOTÓN — la «6a» (25-sep-2026).
//
// 🩸 QUÉ REEMPLAZA: había un botón de descarga en cada pestaña, con el mismo
// rótulo pero distinto archivo, y en DOS de las tres se llevaba un renglón
// entero él solo (166 × 44 px, el 46 % del ancho útil, a y=373 en Clientes y a
// y=307 en Productos). Medido en `activity_logs`: **3 usos en 7 días**, y los
// tres fueron el 20-sep-2026 entre las 08:35 y las 08:36 —uno por pestaña, en
// 90 segundos—: la huella de querer UN archivo.
//
// Ahora es UN botón, detrás del «···», y al tocarlo la hoja pregunta: **esta
// pestaña**, o **las tres en un solo Excel, una hoja por pestaña**.
//
// 🔑 CADA PESTAÑA SIGUE SIENDO DUEÑA DE SU ARCHIVO. Este módulo no arma
// ninguna columna: guarda lo que cada vista REGISTRA —su descarga de siempre y
// la hoja que aporta al libro— y el botón llama a eso. Una pestaña que todavía
// no se abrió no tiene registro, y entonces el libro la arma con lo que el
// servidor ya mandó (Resumen y Clientes) o pidiendo lo suyo (Productos): así el
// archivo de las tres nunca sale con una hoja de menos por no haber entrado.
// ─────────────────────────────────────────────────────────────────────────────

import type { WorkSheet } from "xlsx-js-style";
import type { PestanaDescarga } from "./descarga";

export type { PestanaDescarga };

/** Lo que una pestaña le ofrece al botón de descargar. */
export interface RegistroDeDescarga {
  /** Baja SOLO esta pestaña, con lo que está en pantalla y su propio nombre. */
  estaPestana: () => Promise<void> | void;
  /** La hoja que esta pestaña aporta al libro de las tres. `null` = no tiene nada. */
  hoja: () => Promise<WorkSheet | null>;
  /** `true` mientras no haya nada que bajar (la vista está cargando o vacía). */
  apagada?: boolean;
}

/** Lo que dice la hoja que pregunta qué bajar. */
export const TITULO_HOJA_DESCARGA = "Descargar";
export const OPCION_ESTA_PESTANA = "Esta pestaña en Excel";
export const OPCION_LAS_TRES = "Las tres pestañas en un solo Excel";
export const DETALLE_LAS_TRES = "Resumen · Clientes · Productos, una hoja cada una";

/** El rótulo de las tres pestañas, para el subtítulo de la primera opción. */
export const NOMBRE_DE_LA_PESTANA: Record<PestanaDescarga, string> = {
  resumen: "Resumen",
  clientes: "Clientes",
  productos: "Productos",
};

/** «Resumen · año 2026». */
export function detalleDeEstaPestana(pestana: PestanaDescarga, periodo: string): string {
  return `${NOMBRE_DE_LA_PESTANA[pestana]} · ${periodo}`;
}
