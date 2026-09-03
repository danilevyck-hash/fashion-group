// Clientes por los que UN vendedor no comisiona — la parte que TOCA LA BASE.
//
// Dos lectores:
//   • la pantalla de configuración (lista, agrega, quita) — por la ruta
//     /api/ventas/comisiones/exclusiones, solo admin;
//   • las dos rutas de comisiones, que le pegan a cada vendedor la lista de
//     sus clientes sin comisión para que la tabla lo DIGA. Eso es informativo:
//     quien resta es la RPC (comision_b2b_v7). Por eso esta lectura falla
//     ABIERTO —si la tabla no existe todavía o la consulta se cae, la tabla de
//     comisiones sale sin la marca, no en blanco—, mientras que agregar y
//     quitar fallan CERRADO (la ruta devuelve el error).
//
// 🔴 NUNCA DELETE. Quitar = `activa = false` + quién y cuándo. Es historial de
// decisiones sobre plata, y hay barrido que pone el build rojo si aparece un
// `.delete()` sobre esta tabla.

import { supabaseServer } from "@/lib/supabase-server";
import type { ExclusionActiva, ExclusionNueva } from "@/lib/comisiones/exclusiones";

export const TABLA_EXCLUSION = "comision_exclusion";

interface FilaExclusion {
  id: number;
  empresa_key: string;
  cliente_codigo: string;
  vendedor: string;
  creado_por: string;
  creado_en: string;
}

/** Nombre del cliente por (empresa, código), desde el directorio local de Switch. */
async function nombresDeClientes(
  filas: readonly FilaExclusion[],
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  if (filas.length === 0) return out;
  const empresas = [...new Set(filas.map((f) => f.empresa_key))];
  const codigos = [...new Set(filas.map((f) => f.cliente_codigo))];
  const { data, error } = await supabaseServer
    .from("switch_clientes")
    .select("empresa_key, codigo, nombre")
    .in("empresa_key", empresas)
    .in("codigo", codigos);
  if (error) throw new Error(`switch_clientes: ${error.message}`);
  for (const c of (data ?? []) as { empresa_key: string; codigo: string | null; nombre: string | null }[]) {
    if (c.codigo) out.set(`${c.empresa_key}|${c.codigo.trim().toUpperCase()}`, c.nombre);
  }
  return out;
}

/**
 * Las exclusiones ACTIVAS de estas empresas, con el nombre del cliente
 * resuelto. Lanza si la base falla: quien la llame decide si falla abierto.
 */
export async function leerExclusionesActivas(
  empresas: readonly string[],
): Promise<ExclusionActiva[]> {
  if (empresas.length === 0) return [];
  const { data, error } = await supabaseServer
    .from(TABLA_EXCLUSION)
    .select("id, empresa_key, cliente_codigo, vendedor, creado_por, creado_en")
    .in("empresa_key", empresas)
    .eq("activa", true)
    .order("empresa_key", { ascending: true })
    .order("vendedor", { ascending: true })
    .order("cliente_codigo", { ascending: true });
  if (error) throw new Error(`${TABLA_EXCLUSION}: ${error.message}`);
  const filas = (data ?? []) as FilaExclusion[];
  const nombres = await nombresDeClientes(filas);
  return filas.map((f) => ({
    ...f,
    cliente_nombre: nombres.get(`${f.empresa_key}|${f.cliente_codigo}`) ?? null,
  }));
}

/**
 * La misma lectura, pero FALLANDO ABIERTO: para la marca informativa de las
 * tablas de comisiones. Sin tabla, sin permiso o sin red → lista vacía.
 */
export async function leerExclusionesActivasOVacio(
  empresas: readonly string[],
): Promise<ExclusionActiva[]> {
  try {
    return await leerExclusionesActivas(empresas);
  } catch {
    return [];
  }
}

export type ResultadoAlta =
  | { ok: true; id: number }
  | { ok: false; status: 409 | 500 | 503; error: string };

/** Agrega una. 409 si ya está activa; 503 si la tabla todavía no existe. */
export async function agregarExclusion(
  valor: ExclusionNueva,
  creadoPor: string,
): Promise<ResultadoAlta> {
  const { data, error } = await supabaseServer
    .from(TABLA_EXCLUSION)
    .insert({ ...valor, creado_por: creadoPor })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") {
      return { ok: false, status: 409, error: "Ese cliente ya está en la lista para ese vendedor" };
    }
    if (error.code === "42P01" || /relation .* does not exist|PGRST205/i.test(error.message ?? "")) {
      return { ok: false, status: 503, error: "Falta correr la migración de comision_exclusion" };
    }
    return { ok: false, status: 500, error: "No se pudo guardar. Intenta de nuevo en unos segundos." };
  }
  return { ok: true, id: Number((data as { id: number }).id) };
}

export type ResultadoBaja =
  | { ok: true }
  | { ok: false; status: 404 | 500; error: string };

/** Quita una: soft delete firmado. Solo toca filas que siguen activas. */
export async function desactivarExclusion(
  id: number,
  desactivadoPor: string,
): Promise<ResultadoBaja> {
  const { data, error } = await supabaseServer
    .from(TABLA_EXCLUSION)
    .update({ activa: false, desactivado_por: desactivadoPor, desactivado_en: new Date().toISOString() })
    .eq("id", id)
    .eq("activa", true)
    .select("id");
  if (error) {
    return { ok: false, status: 500, error: "No se pudo quitar. Intenta de nuevo en unos segundos." };
  }
  if (!data || data.length === 0) {
    return { ok: false, status: 404, error: "Esa fila ya no está en la lista" };
  }
  return { ok: true };
}
