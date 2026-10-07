// ─────────────────────────────────────────────────────────────────────────────
// Marketing › EDITAR FACTURA, como ficha y no como asistente (7-oct-2026).
// Mockup «hoy vs recomendación», APAGADA hasta el «sí» de Daniel. Reglas en
// docs/diseno.md. 🔴 SOLO CAMBIA LA PANTALLA: lo que se guarda es lo mismo
// (mismo PATCH, mismo PUT de marcas, mismas columnas) salvo la pieza nueva de
// abajo, que es la MISMA que ya usa «Registrar gasto» desde el 6-oct-2026
// (`MKT_PROVEEDORES_2026_10`).
//
// Daniel miró la factura 0000000145 y encontró, de arriba a abajo:
//   1. Un «Paso 1» con un recuadro VACÍO para subir el PDF — aunque la
//      factura YA tiene uno. El título se decía dos veces (el de
//      `PasoInstruccion` y el del uploader de adentro).
//   2. Los «Paso 2 ✓» y «Paso 3 ✓» con numeración y visto: son de un
//      ASISTENTE para algo que NO existe todavía. Al editar, todo ya existe.
//   3. ITBMS (0 % / 7 %) al lado de «Compra en zona libre (15 %)», como si el
//      15 % fuera un tercer tramo de ITBMS, cuando en realidad lo REEMPLAZA.
//   4. El paso de marca era la rejilla vieja de 5 marcas con un check: no
//      ofrecía «A cargo de la empresa», que SÍ vive en «Se cobra a» desde el
//      6-oct-2026 (`BloqueDestinoDelGasto`) — pero solo en «Registrar gasto».
//   5. Un bloque de tres cosas bajo un solo título, «Tienda, nota y reporte a
//      la marca» (arreglo de nombres, publicado aparte de este interruptor).
//
// Editar NO es un asistente: no hay pasos que completar en orden porque todo
// ya tiene un valor. Esta pantalla cambia:
//   · El PDF que ya existe se dice, con un enlace para verlo; reemplazarlo es
//     una acción aparte, no el estado inicial de un campo vacío.
//   · Sin «Paso N» ni visto: los bloques se llaman por lo que son («Datos de
//     la factura»), sin número.
//   · Un solo control «Impuesto»: 0 % · 7 % · Zona libre (15 %). Antes eran
//     dos controles que parecían decir cosas distintas sobre el mismo monto.
//   · «Se cobra a» con «A cargo de la empresa», la MISMA pieza que ya usa
//     Registrar gasto — con una marca, igual que siempre.
//
// 🔴 `false` = la pantalla de hoy, intacta, byte por byte.
// ─────────────────────────────────────────────────────────────────────────────

/** 🔴 Ficha de edición estilo Apple. `false` = como el 6-oct-2026. */
export const FICHA_GASTO_2026_10 = true;

/**
 * El control único «Impuesto» solo tiene sentido reemplazando los DOS de
 * hoy (ITBMS 0/7 · casilla de zona libre) cuando el interruptor está
 * prendido; con él apagado, la pantalla sigue con los dos controles de
 * siempre, intactos.
 */
export type OpcionDeImpuesto = "0" | "7" | "zona-libre";

/** De los dos campos de hoy (itbmsOption, tieneImportacion) a la opción única. */
export function opcionDeImpuesto(
  itbmsOption: "0" | "7",
  tieneImportacion: boolean,
): OpcionDeImpuesto {
  return tieneImportacion ? "zona-libre" : itbmsOption;
}

/** De la opción única a los dos campos de hoy — lo que de verdad se guarda. */
export function camposDeImpuesto(
  opcion: OpcionDeImpuesto,
): { itbmsOption: "0" | "7"; tieneImportacion: boolean } {
  if (opcion === "zona-libre") return { itbmsOption: "0", tieneImportacion: true };
  return { itbmsOption: opcion, tieneImportacion: false };
}
