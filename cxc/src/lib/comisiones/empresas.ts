// Qué empresas aparecen en Comisiones — UNA sola vez.
//
// Estaba escrito idéntico en `ComisionesConsolidadoView` y en
// `ComisionesPorEmpresaView`, y ahora lo necesita también el endpoint
// consolidado: tres copias de la misma lista es la forma de que un día se
// contradigan (la misma lección de `EMPRESA_SYNC_CAPABILITIES`).
//
// Se DERIVA de `B2B_EMPRESA_KEYS`, nunca se escribe a mano.

import { B2B_EMPRESA_KEYS } from "@/lib/empresa-mapping";

/** Joystep tiene CXC pero NO comisiona — fuera de la matriz. */
export const EMPRESAS_COMISIONAN = B2B_EMPRESA_KEYS.filter(
  (k) => k !== "joystep",
);
