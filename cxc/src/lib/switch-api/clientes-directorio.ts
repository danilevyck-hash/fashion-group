// ═══════════════════════════════════════════════════════════════════════════
//   EL DIRECTORIO DE CLIENTES DE SWITCH — un solo escritor de `switch_clientes`.
// ═══════════════════════════════════════════════════════════════════════════
//
// `switch_clientes` es el PUENTE `(empresa_key, cliente_switch_id) → codigo` que
// usan las vistas de clientes, el selector de cliente de los catálogos y la
// pantalla de Boston. Lo escribía UN solo lugar —el sync de estado de cuenta,
// dentro de `sync-empresa.ts`— y por eso a Boston nunca le llegaba nada: su
// estado de cuenta por API está vetado (4.915 clientes, una llamada HTTP por
// cliente, 54 min medidos contra un techo de 800 s), así que su directorio quedó
// congelado el 30-jul-2026 y nadie lo notó **durante 37 días**.
//
// Este archivo saca ese camino de adentro del sync de CXC para que el cron
// semanal de Boston lo use TAL CUAL, sin una segunda implementación que se pueda
// separar en silencio. Es la misma lección de `EMPRESA_SYNC_CAPABILITIES`: dos
// listas paralelas siempre terminan contradiciéndose.
//
// 🔴 ESTE MÓDULO ESCRIBE `switch_clientes` Y NADA MÁS. No toca `clientes_master`
// ni por asomo. `clientes_master` es el directorio del GRUPO y SOLO del grupo:
// no tiene `empresa_key` —una fila por CÓDIGO— así que adentro un cliente de
// Boston es indistinguible de uno del grupo. Estuvo adentro cinco semanas y el
// ranking de Ventas publicó $2,55 millones de venta que no existió. Daniel,
// textual: *«los clientes de Boston no quiero que toquen los de Fashion
// Group… no quiero volver a pasar por el mismo error»*. Quien lo refresca es
// `sync-clientes-master.ts`, que pide por INCLUSIÓN de las 6 del grupo, y así se
// queda. Candado: `boston-clientes-no-tocan-el-grupo.test.ts`.

import { supabaseServer } from "@/lib/supabase-server";
import type { SwitchClient } from "@/lib/switch-api/client";
import type { SwitchCliente } from "@/lib/switch-api/types";

/** Lo que se le pide a `/apicliente/lista` por página. Switch capea en ~50 igual
 *  (ver `traerListaDeClientes`), pero pedir más no cuesta nada. */
export const CLIENTES_PAGE = 200;
/** Tope de páginas. Boston tiene 4.915 clientes ⇒ ~99 páginas reales; 2.000 deja
 *  margen de sobra y sigue siendo una defensa contra el loop infinito. */
export const MAX_CLIENTES_PAGES = 2000;

export interface ListaDeClientes {
  clientes: SwitchCliente[];
  /** Lo que Switch dice que hay (página 1). 0 = no lo reportó. */
  totalReportado: number;
  /** ¿Trajimos TODO? De esto depende que se pueda marcar a alguien como ausente. */
  completa: boolean;
  /** "4915/4915 (100%)" — para el log. */
  cobertura: string;
}

/**
 * Trae el directorio COMPLETO de una empresa.
 *
 * 🩸 OJO con la paginación: `/apicliente/lista` NO respeta `porPagina` (Switch
 * capea en silencio ~50 aunque pidamos 200). El sync viejo cortaba con
 * `if (page * CLIENTES_PAGE >= total) break;` y se llevaba puestos el 60%+ de
 * los clientes de vistana (50 de 135). Se corta por lo que de verdad se acumuló:
 *   a) `clientes.length >= totalReportado`, o
 *   b) una página vacía (defensa si el total viene 0 o mentiroso).
 */
export async function traerListaDeClientes(client: SwitchClient): Promise<ListaDeClientes> {
  const clientes: SwitchCliente[] = [];
  let totalReportado = 0;
  for (let page = 1; page <= MAX_CLIENTES_PAGES; page++) {
    const resp = await client.listClientes({ porPagina: CLIENTES_PAGE, paginaActual: page });
    const batch = resp.clientes ?? [];
    if (batch.length === 0) break;
    clientes.push(...batch);
    const totalPagina = Number(resp.paginacion?.total ?? 0);
    if (page === 1) totalReportado = totalPagina;
    if (totalPagina > 0 && clientes.length >= totalPagina) break;
  }
  const completa = totalReportado === 0 || clientes.length >= totalReportado;
  const cobertura =
    totalReportado > 0
      ? `${clientes.length}/${totalReportado} (${Math.round((clientes.length / totalReportado) * 100)}%)`
      : `${clientes.length} (total no reportado)`;
  return { clientes, totalReportado, completa, cobertura };
}

/**
 * MARCA de ausentes: los clientes borrados en Switch quedaban indistinguibles de
 * los vivos. Marca `activo=false` + `ausente_desde` a los que ya no vienen en la
 * lista y revive a los que reaparecen.
 *
 * 🔴 Solo se llama con la lista COMPLETA (ver `escribirDirectorioDeClientes`):
 * con paginación a medias marcaríamos como ausentes a clientes vivos.
 *
 * Tolerante: si la columna `activo` todavía no existe, solo loguea — el upsert
 * del directorio ya quedó hecho y no se ve afectado.
 */
export async function marcarClientesAusentes(
  empresaKey: string,
  presentIds: number[],
  runStamp: string,
): Promise<void> {
  const idsCsv = `(${presentIds.join(",")})`;
  const { error: offErr } = await supabaseServer
    .from("switch_clientes")
    .update({ activo: false, ausente_desde: runStamp })
    .eq("empresa_key", empresaKey)
    .eq("activo", true)
    .not("cliente_switch_id", "in", idsCsv);
  if (offErr) {
    console.error(
      `[clientes ${empresaKey}] WARNING marcarClientesAusentes (¿DDL activo pendiente?): ${offErr.message}`,
    );
    return;
  }
  const { error: onErr } = await supabaseServer
    .from("switch_clientes")
    .update({ activo: true, ausente_desde: null })
    .eq("empresa_key", empresaKey)
    .eq("activo", false)
    .in("cliente_switch_id", presentIds);
  if (onErr) {
    console.error(`[clientes ${empresaKey}] WARNING revivir clientes presentes: ${onErr.message}`);
  }
}

/**
 * Persiste el directorio en `switch_clientes`. Upsert atómico por
 * `(empresa_key, cliente_switch_id)`. **No BORRA nunca**: el directorio es
 * acumulativo — un cliente que deja de listarse conserva su mapeo histórico para
 * no romper facturas viejas que lo referencien.
 */
export async function persistClientesDirectorio(
  empresaKey: string,
  clientes: SwitchCliente[],
  runStamp: string,
): Promise<number> {
  // Dedupe within-batch por id (último gana) y descartar sin id numérico.
  const byId = new Map<number, SwitchCliente>();
  for (const c of clientes) {
    if (typeof c.id === "number") byId.set(c.id, c);
  }
  if (byId.size === 0) return 0;

  const payload = Array.from(byId.values()).map((c) => ({
    empresa_key: empresaKey,
    cliente_switch_id: c.id,
    codigo: c.codigo ?? null,
    nombre: c.nombre ?? null,
    razonsocial: c.razonsocial ?? null,
    email: c.email ?? null,
    telefono: c.telefono ?? null,
    celular: c.celular ?? null,
    identificacion: c.identificacion ?? null,
    raw_data: c,
    synced_at: runStamp,
    updated_at: runStamp,
  }));

  const { error } = await supabaseServer
    .from("switch_clientes")
    .upsert(payload, { onConflict: "empresa_key,cliente_switch_id", ignoreDuplicates: false });
  if (error) throw new Error(`UPSERT switch_clientes falló: ${error.message}`);
  return payload.length;
}

export interface EscrituraDeDirectorio {
  /** Filas upserted. */
  escritos: number;
  /** ¿Se corrió la marca de ausentes? */
  marcoAusentes: boolean;
}

/**
 * Escribe el directorio y, SOLO si la lista vino completa, marca ausentes.
 *
 * 🔴 Es la guarda que hace que una corrida a medias no borre nada: si Switch
 * contesta vacío o incompleto, se upsertea lo que llegó y **no se marca a nadie
 * como ausente**. Una lista vacía no escribe ni marca.
 */
export async function escribirDirectorioDeClientes(
  empresaKey: string,
  lista: ListaDeClientes,
  runStamp: string,
): Promise<EscrituraDeDirectorio> {
  const escritos = await persistClientesDirectorio(empresaKey, lista.clientes, runStamp);
  const presentIds = lista.clientes
    .filter((c) => typeof c.id === "number")
    .map((c) => c.id as number);
  if (!lista.completa || presentIds.length === 0) {
    return { escritos, marcoAusentes: false };
  }
  await marcarClientesAusentes(empresaKey, presentIds, runStamp);
  return { escritos, marcoAusentes: true };
}
