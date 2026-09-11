// ─────────────────────────────────────────────────────────────────────────────
// QUÉ SE PUEDE HACER CON UN GASTO, SEGÚN SI EL PERÍODO ESTÁ ABIERTO
// (11-sep-2026).  Módulo PURO.
//
// 🩸 LAS FOTOS DEL RECIBO NO SE PODÍAN VER EN UN PERÍODO CERRADO. El menú «···»
// que las abre se dibujaba SOLO con el período abierto, así que el único
// archivo de comprobantes del módulo quedaba inalcanzable apenas se cerraba el
// ciclo — hoy 2 de los 3 períodos están cerrados. Y `ZonaFotos soloVer={!isOpen}`
// era código muerto: esa condición nunca podía ser `true`, porque sin el menú
// no había forma de abrir la zona.
//
// 🔴 CERRADO ES CERRADO: en un período cerrado el menú lleva UNA sola cosa,
// «Foto del recibo», y la zona se abre en SOLO LECTURA. Editar y eliminar
// siguen cerrados en la pantalla **y en el servidor** (`PATCH` y `DELETE` de
// `/api/caja/gastos/[id]` piden el período abierto), que es donde vive el
// freno de verdad.
// ─────────────────────────────────────────────────────────────────────────────

export type AccionDeGasto = "editar" | "foto" | "eliminar";

/** Lo que ofrece el «···» de un gasto. Cerrado: solo mirar la foto. */
export function accionesDelGasto(periodoAbierto: boolean): AccionDeGasto[] {
  return periodoAbierto ? ["editar", "foto", "eliminar"] : ["foto"];
}

/** ¿La zona de fotos se abre en solo lectura? (la misma pregunta, un solo lugar) */
export function fotosSoloVer(periodoAbierto: boolean): boolean {
  return !periodoAbierto;
}
