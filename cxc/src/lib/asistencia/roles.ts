// ─────────────────────────────────────────────────────────────────────────────
// Quién puede usar Asistencia — UNA sola lista.
//
// 🩸 Estaba escrita a mano en cada ruta (`["admin", "secretaria"]` × 6 archivos)
// más otra copia en `modules.ts`. Es exactamente la forma del bug que dejó a
// Tommy sin vendedor de Switch: varias listas iguales, y agregar un rol obliga
// a acordarse de todas. Acá se agrega en un lugar.
//
// `contabilidad` entra el 6-ago-2026 por pedido de Daniel: la planilla quincenal
// la arma la contable a mano, y los minutos de tardanza, las horas extra y las
// ausencias que necesita para llenarla salen de este módulo.
//
// ⚠️ La lista de `modules.ts` es la NAVEGACIÓN (qué tarjeta se ve); la de las
// rutas es el CANDADO. Esconder la tarjeta no cierra nada —cualquiera con el
// módulo entra por URL—, así que las dos tienen que decir lo mismo y hay un
// test que lo exige.
// ─────────────────────────────────────────────────────────────────────────────

export const ASISTENCIA_ROLES = ["admin", "secretaria", "contabilidad"] as const;

export function asistenciaRoles(): string[] {
  return [...ASISTENCIA_ROLES];
}
