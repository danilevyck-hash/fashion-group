// ============================================================================
// Marketing — EDITAR UN GASTO CONSERVA (y deja cambiar) SU TIENDA, SU
// «se reporta» Y SU NOTA. Módulo PURO: sin React, sin Supabase, sin fetch.
//
// 🩸 EL DEFECTO (pieza A, 22-sep-2026). `updateFactura` y `updateEntrega` ya
// aceptaban las tres columnas del rediseño, pero ninguna PANTALLA de edición
// las preguntaba y la ruta de entregas ni siquiera las dejaba pasar: se
// armaba `{ items, marcas, notas }` a mano. Resultado: se podía poner la
// tienda al crear el gasto y nunca más corregirla.
//
// 🔴 LO QUE NO VIAJA, NO SE PISA. Una clave ausente se queda `undefined` y
// `columnasDelGasto` (puerta-gasto.ts) no la escribe: la pantalla de antes
// —que no manda nada— deja la fila EXACTAMENTE como está. Nunca se manda un
// `null` «por las dudas»: un `null` BORRA la tienda.
//
// 🔴 Todo cuelga de `MARKETING_PUERTA_GASTO`. Apagado, las pantallas de
// edición son las de antes y las rutas no reciben nada nuevo.
// ============================================================================

import { seReportaDe } from "./gasto";
import type { DatosDelGasto } from "./puerta-gasto";

/** La fila guardada, tal como vuelve de la base (factura o entrega). */
export interface FilaConDatosDelGasto {
  tienda_codigo?: string | null;
  se_reporta?: boolean | null;
  nota?: string | null;
}

/**
 * Los tres campos del gasto como los enseña el formulario de EDICIÓN, con el
 * valor que la fila tiene hoy.
 *
 *   · `esDeTienda` se DERIVA de que haya código: un gasto guardado en
 *     «General» abre en «General», no en una tienda vacía.
 *   · `seReporta` usa `seReportaDe`: solo un `false` explícito apaga, así una
 *     fila vieja (columna ausente, `undefined`) abre PRENDIDA como el DEFAULT
 *     de la base.
 *   · `marcaId` no se toca acá: la marca del gasto la sigue manejando el
 *     formulario de siempre (una por gasto, `exigirUnaMarca`).
 */
export function datosDeLaFila(
  fila: FilaConDatosDelGasto | null | undefined,
  base: Partial<DatosDelGasto> = {},
): DatosDelGasto {
  const codigo = String(fila?.tienda_codigo ?? "").trim().toUpperCase();
  const nota = String(fila?.nota ?? "").trim();
  return {
    marcaId: "",
    esDeTienda: codigo.length > 0,
    tiendaCodigo: codigo,
    tiendaNombre: "",
    seReporta: seReportaDe(fila?.se_reporta),
    nota,
    ...base,
  };
}

/**
 * Lo que la pantalla de edición manda en el cuerpo. Las TRES siempre juntas:
 * al editar, la persona ve los tres campos, así que los tres son una decisión
 * suya —incluido dejar la tienda vacía («General»)—.
 */
export function cuerpoDeLaEdicion(d: DatosDelGasto): {
  tiendaCodigo: string | null;
  seReporta: boolean;
  nota: string | null;
} {
  const tienda = d.esDeTienda ? d.tiendaCodigo.trim().toUpperCase() : "";
  const nota = d.nota.replace(/\s+/g, " ").trim();
  return {
    tiendaCodigo: tienda.length > 0 ? tienda : null,
    seReporta: d.seReporta !== false,
    nota: nota.length > 0 ? nota : null,
  };
}

/** Las tres, ya con el tipo que esperan `updateFactura` y `updateEntrega`. */
export interface DelGastoEnElCuerpo {
  seReporta?: boolean;
  tiendaCodigo?: string | null;
  nota?: string | null;
}

/**
 * 🔴 SOLO LO QUE VINO. Del cuerpo de una petición se sacan las tres claves
 * del rediseño **únicamente si están presentes**; lo que no vino queda
 * `undefined` y no se escribe. Lo usan las rutas de EDICIÓN que arman su
 * payload a mano (entregas) en vez de reenviar el cuerpo entero.
 *
 * ⚠️ `tiendaCodigo: null` SÍ es una decisión: significa «General». Por eso se
 * mira la PRESENCIA de la clave (`in`) y nunca si el valor es nulo.
 */
export function columnasQueVinieron(body: unknown): DelGastoEnElCuerpo {
  const out: DelGastoEnElCuerpo = {};
  if (!body || typeof body !== "object") return out;
  const b = body as Record<string, unknown>;
  if ("seReporta" in b) out.seReporta = seReportaDe(b.seReporta);
  if ("tiendaCodigo" in b) {
    const t = String(b.tiendaCodigo ?? "").trim().toUpperCase();
    out.tiendaCodigo = t.length > 0 ? t : null;
  }
  if ("nota" in b) {
    const n = String(b.nota ?? "").replace(/\s+/g, " ").trim();
    out.nota = n.length > 0 ? n : null;
  }
  return out;
}

/** ¿El cuerpo trae alguna de las tres? (Si no, la fila no se toca.) */
export function traeAlgoDelGasto(cols: DelGastoEnElCuerpo): boolean {
  return Object.keys(cols).length > 0;
}
