// ─────────────────────────────────────────────────────────────────────────────
// «DESPACHADO POR» — Y POR QUÉ `__other__` NO ES UN NOMBRE (25-ago-2026)
//
// 🩸 EL DEFECTO: el desplegable de "Despachado por" tiene una opción `Otro…`
// cuyo `value` es el centinela `__other__`. Al elegirla aparece un campo para
// escribir el nombre y recién ahí se reemplaza — pero si nadie escribe nada,
// la guía se guarda con el centinela y **así sale IMPRESO en el papel que firma
// el transportista**: `DESPACHADO POR: __other__`. La validación solo miraba
// que el campo no estuviera vacío, así que nada lo frenaba ni lo avisaba.
//
// ✅ Medido contra producción el 25-ago-2026 sobre las **212 guías vivas**:
// `Julio ×178 · Rodrigo ×31 · vacío ×3` — **CERO con `__other__`**. O sea que
// era un defecto LATENTE: la puerta estaba abierta y nadie había pasado. Por
// eso no hay nada que corregir hacia atrás.
//
// 🔴 SE TAPA POR LOS DOS LADOS, y hacen falta los dos:
//   1. **el formulario no deja guardarlo** (`validarGuia` lo trata como
//      "sin elegir", así que el botón se apaga y dice qué falta);
//   2. **el papel no lo imprime NUNCA** (`nombreDespachadoPor`), que es la red
//      para cualquier fila que ya estuviera guardada así — y para el día que
//      alguien escriba una tercera pantalla que guarde este campo.
//
// Vive en `lib/` y no junto al formulario porque los DOS papeles lo necesitan
// (`PrintDocument.tsx` y `pdf-guia.ts`), y `lib/` no puede importar de `app/`.
// ─────────────────────────────────────────────────────────────────────────────

/** El `value` de la opción «Otro…» del desplegable. No es el nombre de nadie. */
export const ENTREGADO_POR_OTRO = "__other__";

/** ¿Hay una persona de verdad en "Despachado por"? El centinela no cuenta. */
export function entregadoPorElegido(valor: string | null | undefined): boolean {
  const v = (valor ?? "").trim();
  return v !== "" && v !== ENTREGADO_POR_OTRO;
}

/**
 * Lo que se IMPRIME en "Despachado por". Con el centinela devuelve "" —
 * exactamente lo mismo que un campo vacío, que es lo único honesto: el papel
 * queda con la línea en blanco para escribirla a mano, en vez de afirmar que
 * despachó alguien llamado `__other__`.
 */
export function nombreDespachadoPor(valor: string | null | undefined): string {
  return entregadoPorElegido(valor) ? String(valor).trim() : "";
}
