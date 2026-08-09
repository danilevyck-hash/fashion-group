// ─────────────────────────────────────────────────────────────────────────────
// ATAR UNA LÍNEA DE GUÍA A SU CLIENTE — la regla, sin nada de red.
//
// El cliente de una guía vive en las LÍNEAS (`guia_items`), no en el
// encabezado: una guía sale con varios destinos. Medido contra producción el
// 8-ago-2026, la guía real GT-189 lleva America Clasic, Jerusalem, City Mall
// Paso Canoa y City Mall David en el mismo viaje.
//
// ⚠️ `guia_transporte.receptor_nombre` NO es el cliente — es quien FIRMA el
// recibido (choferes: "Nicolás guillen", "Reynel", "Walter arauz"). De 109
// guías con receptor anotado, 0 coinciden con el nombre de un cliente. Está
// escrito en `src/__tests__/api/guias.test.ts` para que nadie lo "arregle".
//
// ── POR QUÉ ESTO ES UN MÓDULO PURO ──────────────────────────────────────────
//
// La única decisión que importa —"¿este código se puede guardar?"— tiene que
// poder probarse sin base de datos y ser LA MISMA en el endpoint y en el test.
// El endpoint solo aporta el conjunto de códigos vivos del grupo.
// ─────────────────────────────────────────────────────────────────────────────

import { esCodigoDeCliente } from "@/lib/clientes/mundos";

export type ResultadoAtar =
  | { ok: true; codigo: string | null }
  | { ok: false; error: string };

/**
 * ¿Se puede guardar este código en `guia_items.cliente_codigo`?
 *
 * - `null` / `""` → desatar. Siempre válido, y guarda **NULL**, nunca `""`:
 *   con `""` un `cliente_codigo IS NOT NULL` contaría líneas que no están
 *   atadas (la misma trampa que ya se evitó en Cheques).
 * - Cualquier otra cosa tiene que ser un `D-XXX` **y** existir hoy en el
 *   directorio del grupo. Las dos condiciones, no una:
 *     · el formato solo, porque `111380` se coló por un backfill de junio que
 *       filtraba `IS NOT NULL` en vez de `LIKE 'D-%'` y ató una línea a un
 *       código de Confecciones Boston;
 *     · la existencia, porque un D-XXX tecleado que no existe es un vínculo a
 *       la nada, y peor que no tener vínculo.
 */
export function validarCodigoParaAtar(
  codigo: string | null | undefined,
  codigosDelGrupo: ReadonlySet<string>
): ResultadoAtar {
  const c = (codigo ?? "").trim();
  if (!c) return { ok: true, codigo: null };
  if (!esCodigoDeCliente(c)) {
    return { ok: false, error: "Ese código no es de un cliente del grupo (D-XXX)" };
  }
  // Se compara en mayúsculas porque `esCodigoDeCliente` acepta "d-25", pero lo
  // que se GUARDA es el código tal cual está en el directorio.
  const enMayus = c.toUpperCase();
  for (const k of codigosDelGrupo) {
    if (k.trim().toUpperCase() === enMayus) return { ok: true, codigo: k.trim() };
  }
  return { ok: false, error: "Ese cliente ya no está en el directorio" };
}
