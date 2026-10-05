// ─────────────────────────────────────────────────────────────────────────────
// RECLAMOS «COMO LO HARÍA APPLE» (5-oct-2026). Propuesta, APAGADA.
//
// El método que Daniel aprobó en Nueva guía, CxC, Multifashion, Ventas y la
// lista de Guías: la MISMA pantalla con las reglas de docs/diseno.md, sin
// tableros de tarjetas, sin inspector y sin pantallas nuevas. Por pantalla:
//   · Portada: las cajas de totales → UN número grande con su línea gris
//     («19 pendientes · 6 de más de 120 días · 2 sin reclamar»); las tarjetas
//     por empresa → filas de dos renglones con ›; «Nuevo reclamo» en la fila
//     del buscador; lo cobrado del año, una línea gris al pie.
//   · Empresa: el monto pendiente grande con su línea gris; «Descargar Excel» y
//     «Descargar PDF» → un «Descargar ⌄»; la fila sin botones (solo «···»);
//     los días de 120 o más, en rojo.
//   · Reclamo: el total grande bajo el número; las Observaciones arriba (antes
//     «Notas:» al pie); el comprobante en gris dentro de «Recuperación»; sin
//     fotos, un enlace «+ Agregar fotos».
//   · Nuevo reclamo: la barra fija abajo con el resultado en vivo («3 líneas ·
//     $1,234.56 · Guardar reclamo»), sin asteriscos y sin el aviso rojo antes
//     de actuar.
//
// 🔴 NO CAMBIA NINGÚN NÚMERO NI NINGÚN GUARDADO: los totales salen de
// `portada.ts`, `viejos.ts` y `reclamoTaxes`; las rutas y los manejadores son
// los de siempre. Apagado = cada pantalla exactamente como estaba.
// Candados: `reclamos-clientes-apple-2026-10.test.tsx`.
// ─────────────────────────────────────────────────────────────────────────────

import { DIAS_RECLAMO_VIEJO } from "./viejos";

/** `false` = como hoy. Se prende con el «sí» de Daniel. */
export const RECLAMOS_APPLE_2026_10 = false;

/**
 * La línea gris bajo el número: «19 pendientes» y, en rojo y solo si no son
 * cero, «6 de más de 120 días» y «2 sin reclamar». Un rojo que sale siempre deja
 * de avisar.
 */
export function lineaPendientes(pendientes: number, viejos: number, sinReclamar: number): { texto: string; alertas: string[] } {
  const alertas: string[] = [];
  if (viejos > 0) alertas.push(`${viejos} de más de ${DIAS_RECLAMO_VIEJO} días`);
  if (sinReclamar > 0) alertas.push(`${sinReclamar} sin reclamar`);
  return { texto: `${pendientes} ${pendientes === 1 ? "pendiente" : "pendientes"}`, alertas };
}

/** ¿Los días van en rojo? El MISMO corte único de «viejo». Sin fecha, no. */
export function diasEnRojo(dias: number | null): boolean {
  return dias !== null && dias >= DIAS_RECLAMO_VIEJO;
}

/** ¿Se recuperó entero (al centavo)? Entonces basta una línea, sin grilla ni barra. */
export function cobradoEntero(reclamado: number, recuperado: number): boolean {
  return reclamado > 0 && Math.round(recuperado * 100) === Math.round(reclamado * 100);
}
