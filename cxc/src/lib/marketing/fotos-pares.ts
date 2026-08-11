// ============================================================================
// Marketing › Mobiliario — los pares foto↔producto SE LEEN DEL .sql
// ============================================================================
//
// El backfill de fotos vive en
// `supabase/migrations/20260811150000_mobiliario_fotos_a_productos.sql`, y ese
// archivo tiene la lista de pares DOS veces: una en la vista previa (PASO 1,
// que no escribe) y otra en el UPDATE (PASO 2, que sí).
//
// 🩸 POR QUÉ NO SE COPIAN A TypeScript: si la lista estuviera acá además de en
//    el SQL, la verificación contra producción estaría midiendo una lista y la
//    migración escribiría con otra. Se LEE del archivo que se va a correr —
//    mismo mecanismo que `guias/reglas-city-mall.ts`.
//
// 🩸 Y SE EXIGE QUE LAS DOS COPIAS DEL .sql SEAN IDÉNTICAS: si difirieran, la
//    vista previa estaría MINTIENDO, que es la peor forma de fallar en un
//    backfill que uno aprueba mirando la vista previa.
// ============================================================================

import { readFileSync } from "node:fs";
import { join } from "node:path";

export const ARCHIVO_MIGRACION_FOTOS =
  "supabase/migrations/20260811150000_mobiliario_fotos_a_productos.sql";

export interface ParFoto {
  /** `mk_inventario_productos.nombre` */
  productoInventario: string;
  /** `mk_mobiliario_notas_proveedor.producto` */
  productoNota: string;
}

/** Cada bloque `VALUES (…), (…)` de la migración, en orden de aparición. */
function bloquesDePares(sql: string): ParFoto[][] {
  const bloques: ParFoto[][] = [];
  // Un bloque arranca en `VALUES` y termina en el `)` que cierra el CTE, o sea
  // justo antes de un `)` seguido de salto de línea sin coma.
  const re = /VALUES\s*([\s\S]*?)\n\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) {
    const pares: ParFoto[] = [];
    const filaRe = /\(\s*'([^']*)'\s*,\s*'([^']*)'\s*\)/g;
    let f: RegExpExecArray | null;
    while ((f = filaRe.exec(m[1])) !== null) {
      pares.push({ productoInventario: f[1], productoNota: f[2] });
    }
    if (pares.length > 0) bloques.push(pares);
  }
  return bloques;
}

/**
 * Los pares del backfill, leídos del .sql.
 *
 * Revienta si la vista previa y el UPDATE no traen exactamente la misma lista,
 * en el mismo orden.
 */
export function paresDeFotos(raizRepo: string = process.cwd()): ParFoto[] {
  const sql = readFileSync(join(raizRepo, ARCHIVO_MIGRACION_FOTOS), "utf8");
  const bloques = bloquesDePares(sql);
  if (bloques.length !== 2) {
    throw new Error(
      `Se esperaban 2 listas de pares en ${ARCHIVO_MIGRACION_FOTOS} (vista previa y UPDATE), se encontraron ${bloques.length}.`,
    );
  }
  const [previa, update] = bloques;
  const comoTexto = (ps: ParFoto[]) =>
    ps.map((p) => `${p.productoInventario} → ${p.productoNota}`).join(" | ");
  if (comoTexto(previa) !== comoTexto(update)) {
    throw new Error(
      "La vista previa y el UPDATE del backfill de fotos NO tienen los mismos pares: la vista previa estaría mintiendo.\n" +
        `  vista previa: ${comoTexto(previa)}\n` +
        `  update:       ${comoTexto(update)}`,
    );
  }
  return previa;
}
