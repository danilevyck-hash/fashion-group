"use client";

// ============================================================================
// UN SOLO BOTÓN: "Registrar gasto". La puerta vive en `PuertaGasto.tsx`
// (rediseño del 22-sep-2026: tres tipos, UNA marca, tienda o «General»,
// «Se reporta», nota). El registro de antes (`RegistrarGastoModalAnterior`,
// detrás de `MARKETING_PUERTA_GASTO` en `false`) se borró el 8-oct-2026.
// ============================================================================

import PuertaGasto, { type PuertaGastoProps } from "./PuertaGasto";

export default function RegistrarGastoModal(props: PuertaGastoProps) {
  return <PuertaGasto {...props} />;
}
