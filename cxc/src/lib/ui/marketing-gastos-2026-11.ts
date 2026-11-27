// ─────────────────────────────────────────────────────────────────────────────
// MARKETING › GASTOS (27-nov-2026). Lo que Daniel y Angela aprobaron:
//
// 1a. «Sin tienda» al registrar un gasto cobrable: hoy la tienda era
//     obligatoria («Falta: la tienda»). Con «Sin tienda» se le cobra a la marca
//     y va al ZIP / Excel en la carpeta «General», igual que al editar. El
//     servidor ya lo aceptaba (`tienda_codigo` NULL).
// 3a. «Anular» en la lista de Gastos: en el teléfono, deslizar la fila a la
//     izquierda (con «Deshacer» 5 s); en la computadora, «···» → «Anular». La
//     MISMA ruta que la ficha de la tienda (`POST …/facturas/[id]/anular`,
//     soft delete firmado; DELETE sigue en 403). Solo admin y secretaria.
// 7.  En «Cobro · <Marca>» tocar la fila de un gasto abre el MISMO «Editar
//     factura» de Gastos (impulsadora y mobiliario abren el suyo); al guardar
//     se queda en el cobro y se vuelve a leer. «Excluir» no cambia.
//
// `false` = lo de antes, cada uno por separado.
// ─────────────────────────────────────────────────────────────────────────────

export const MKT_SIN_TIENDA_AL_REGISTRAR_2026_11 = true;
export const MKT_ANULAR_EN_LA_LISTA_2026_11 = true;
export const MKT_EDITAR_DESDE_EL_COBRO_2026_11 = true;

/** El rótulo del botón y del estado elegido. La carpeta del ZIP sigue siendo «General». */
export const ROTULO_SIN_TIENDA = "Sin tienda";

/** El motivo que viaja al anular desde la lista (la ruta lo exige). */
export const MOTIVO_ANULADO_DESDE_GASTOS = "Anulado desde la lista de Gastos";

/** La acción (botón rojo al deslizar y «···»): un verbo, como «Eliminar». */
export const ACCION_ANULAR = "Anular";
