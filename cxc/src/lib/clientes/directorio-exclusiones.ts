// ─────────────────────────────────────────────────────────────────────────────
// QUÉ EMPRESAS NO SE LISTAN EN EL DIRECTORIO — EL ÚNICO LUGAR.
//
// ── 🩸 POR QUÉ EXISTE (30-jul-2026) ─────────────────────────────────────────
//
// Daniel, textual: *"Ventas Vista General es lo que me interesa. no quiero ver
// sus miles de clientes en ningun lado"*, hablando de `confecciones_boston`.
//
// Boston le aporta 8.860 facturas y 394 clientes con saldo, así que sus NÚMEROS
// se quedan. Lo que sobra es su padrón: **794 clientes que no le compran a
// ninguna otra empresa del grupo** metidos en el Directorio, donde nadie los va
// a llamar ni a visitar.
//
// ── LO QUE SE QUEDA (no tocar sin releer esto) ───────────────────────────────
//
//   Ventas y Ventas › Clientes ... SE QUEDAN. Leen `clientes_empresa_12m_vw`,
//        que NO pasa por acá. Boston sigue sumando sus 808 filas.
//   Vista General ................ SE QUEDA.
//   CXC › pestaña Boston ......... SE QUEDA. Es "la parte contable" que sí quiere.
//   Búsqueda global (⌘K) ......... NO SE TOCA por ahora. Boston entra ahí por
//        `switch_estadocuenta_aging` y `switch_facturas`, o sea POR CXC: sacarlo
//        le quitaría poder buscar por nombre el saldo de un cliente de Boston.
//        Queda pendiente de decisión de Daniel — no adelantarse.
//
// ── 🔴 EL CRITERIO ES "COMPRA **SOLO** A BOSTON", NO "COMPRA A BOSTON" ───────
//
// Es la diferencia entre 794 y 805, y esos **11 son el caso que rompe**: le
// compran a Boston Y a otra empresa del grupo (Vistana, Fashion Wear…).
// Excluirlos los borraría también como clientes de ESAS empresas, que es
// exactamente lo que no se puede romper. Por eso el filtro mira el conjunto
// completo de empresas de cada cliente, no si Boston aparece.
//
// ── ⚠️ LA VENTANA: HASTA ~13,5 HORAS DE RETRASO, Y ESTÁ MEDIDA ──────────────
//
// `clientes_master` NO tiene columna `empresa`, así que la pertenencia se deriva
// de `clientes_empresa_12m_vw`, que es una vista materializada. Se refresca 4
// veces por día (UTC):
//
//   07:35  /api/cron/refresh-clientes-views
//   10:00  /api/cron/switch-reconciliacion
//   14:00  /api/cron/switch-reconciliacion
//   18:00  /api/cron/switch-reconciliacion
//
// El hueco más largo es 18:00 → 07:35 del día siguiente = **13 h 35 min**; lo
// habitual son 2 a 4 horas. QUÉ SE VE MIENTRAS TANTO: un cliente NUEVO de
// Boston, o uno que acaba de dejar de comprarle a las otras empresas, sigue
// apareciendo en el Directorio hasta el próximo refresco. No hay riesgo al
// revés (nadie desaparece de golpe): la lista solo saca, nunca agrega.
//
// Esto es a propósito y es reversible en un minuto: no toca la base ni pide
// migración. Si algún día molesta, la solución de fondo es una columna/vista
// propia de pertenencia en `clientes_master`.
// ─────────────────────────────────────────────────────────────────────────────

import { supabaseServer } from "@/lib/supabase-server";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import type { EmpresaKey } from "@/lib/empresa-mapping";

/**
 * Empresas cuyos clientes EXCLUSIVOS no se listan en el Directorio.
 *
 * "Exclusivos" es literal: un cliente sale de la lista solo si TODAS sus
 * empresas están acá. El que le compra a una de estas y además a otra del
 * grupo se queda, porque para esa otra empresa es un cliente como cualquiera.
 *
 * Mismo espíritu que `EMPRESA_SYNC_CAPABILITIES` en `switch-api/empresas.ts`:
 * una sola lista con nombre, no un `!==` suelto repartido por las consultas —
 * así fue como este repo se quemó antes, con listas que se contradecían en
 * silencio.
 */
export const EMPRESAS_FUERA_DEL_DIRECTORIO: readonly EmpresaKey[] = [
  "confecciones_boston",
] as const;

/** La vista de la que se deriva la pertenencia cliente ↔ empresa. */
const VISTA = "clientes_empresa_12m_vw";

/**
 * IDs de `clientes_master` que NO deben listarse en el Directorio: los que
 * compran ÚNICAMENTE a empresas de `EMPRESAS_FUERA_DEL_DIRECTORIO`.
 *
 * ⚠️ Se lee con `leerTodoPaginado` a propósito. La vista tiene 1.601 filas y
 * **PostgREST corta en 1.000 EN SILENCIO**: leyendo de más nomás se perdían
 * empresas enteras (vistana, fashion_wear, fashion_shoes y joystep). Si eso
 * pasara acá, clientes que SÍ le compran a otra empresa parecerían exclusivos
 * de Boston y desaparecerían del Directorio sin que nadie se entere.
 *
 * Tolerante por diseño: si la vista falla, devuelve un conjunto VACÍO y el
 * Directorio muestra de más. Mostrar un cliente que sobra es un ruido; esconder
 * clientes buenos porque una consulta falló es un módulo roto.
 */
export async function idsFueraDelDirectorio(): Promise<Set<string>> {
  const fuera = new Set<string>(EMPRESAS_FUERA_DEL_DIRECTORIO);
  try {
    const filas = await leerTodoPaginado<{ cliente_id: string | null; empresa: string }>(
      `${VISTA} (exclusiones del Directorio)`,
      (pedirCount, from, to) =>
        supabaseServer
          .from(VISTA)
          .select("cliente_id, empresa", pedirCount ? { count: "exact" } : {})
          .order("cliente_norm", { ascending: true })
          .range(from, to)
    );

    // Un cliente se excluye solo si NINGUNA de sus empresas está fuera de la
    // lista. Se acumulan las dos señales por cliente en una pasada.
    const soloExcluidas = new Map<string, boolean>();
    for (const f of filas) {
      if (!f.cliente_id) continue;               // huérfano: no está en el Directorio
      const esExcluida = fuera.has(f.empresa);
      const previo = soloExcluidas.get(f.cliente_id);
      soloExcluidas.set(f.cliente_id, previo === undefined ? esExcluida : previo && esExcluida);
    }

    const ids = new Set<string>();
    for (const [id, solo] of soloExcluidas) if (solo) ids.add(id);
    return ids;
  } catch {
    return new Set<string>();
  }
}

/** Quita de una lista de clientes los que no van en el Directorio. */
export function sinClientesFueraDelDirectorio<T extends { id: string }>(
  clientes: T[],
  excluidos: Set<string>
): T[] {
  if (excluidos.size === 0) return clientes;
  return clientes.filter((c) => !excluidos.has(c.id));
}
