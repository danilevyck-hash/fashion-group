// ─────────────────────────────────────────────────────────────────────────────
// Despachos › Pedidos › «Facturados» — QUITAR a mano una factura que ya se fue
// sin guía (27-nov-2026, Daniel aprobó sin mockup). Sin motivo.
//
// - Teléfono: deslizar a la izquierda muestra «Quitar» en rojo; deslizar hasta
//   el final la quita de una (el MISMO `SwipeableRow` de `GESTOS_IPHONE_2026_11`).
// - Computadora: «···» → «Quitar» en la fila.
// - «Deshacer» 5 s: nada llega al servidor hasta que pasa el plazo.
// - NO borra la factura ni toca `switch_facturas`: anota en
//   `guias_facturas_quitadas` quién y cuándo. «Devolver» la regresa con soft
//   delete firmado (`deleted` + `devuelta_por/_en`), nunca con DELETE.
// - La identidad es la de Facturados: empresa + secuencial de Switch + fecha
//   (el secuencial se repite entre eras).
// - Solo admin y secretaria, decidido en el SERVIDOR (403 al resto).
//
// `false` = lo de antes (sin «Quitar» ni «Ver quitadas»).
// ─────────────────────────────────────────────────────────────────────────────

export const FACTURADOS_QUITAR_2026_11 = true;

/** Quién puede quitar y devolver (admin siempre pasa por `requireRole`). */
export const ROLES_QUITAR_FACTURADOS: readonly string[] = ["admin", "secretaria"];

export function puedeQuitarFacturados(role: string | null | undefined): boolean {
  return FACTURADOS_QUITAR_2026_11 && !!role && ROLES_QUITAR_FACTURADOS.includes(role);
}

/** La identidad de una factura de Facturados: empresa | secuencial | día. */
export function claveQuitada(f: { empresa_key: string; secuencial: string; fecha: string }): string {
  return `${f.empresa_key}|${f.secuencial.trim()}|${f.fecha.slice(0, 10)}`;
}

/** Separa lo que se muestra de lo quitado (las quitadas no reaparecen al releer). */
export function separarQuitadas<F extends { empresa_key: string; secuencial: string; fecha: string }>(
  filas: readonly F[],
  quitadas: ReadonlySet<string>,
): { visibles: F[]; quitadas: F[] } {
  const visibles: F[] = [];
  const fuera: F[] = [];
  for (const f of filas) (quitadas.has(claveQuitada(f)) ? fuera : visibles).push(f);
  return { visibles, quitadas: fuera };
}
