// ─────────────────────────────────────────────────────────────────────────────
// GUÍAS › CONFIGURACIÓN — la parte que TOCA LA BASE (`guias_destino_cliente`).
//
// Dos lectores:
//   · la pantalla Guías › Configuración (lista, agrega, edita, quita) — por
//     /api/guias/destinos-config, admin y secretaria, FALLANDO CERRADO (un
//     error de base se dice, nunca un «ok» a medias);
//   · el formulario de guías, vía /api/guias/frecuencias →
//     `leerDefinidosOVacio()`, FALLANDO ABIERTO: con la tabla ausente (la
//     migración 20260918120000 todavía sin correr, PGRST205) devuelve `{}` y
//     el orden de precedencia cae a la constante `DESTINOS_DEFINIDOS` — la
//     pantalla de guías NO se rompe y los botones siguen saliendo del código.
//
// 🔴 NUNCA DELETE. Quitar = `activo = false` + quién y cuándo (soft delete
// firmado, el patrón de comision_exclusion). Es historial de decisiones sobre
// a dónde va la mercancía; hay CHECK en la tabla que exige la firma.
// ─────────────────────────────────────────────────────────────────────────────

import { supabaseServer } from "@/lib/supabase-server";
import type { DefinidosPorCliente, DestinoDefinido } from "@/lib/guias/destinos-clientes";
import type { DestinoConfigurado, DestinoNuevo } from "@/lib/guias/destinos-config";
import { leerClientesDelGrupo } from "@/lib/clientes/directorio-cache";

export const TABLA_DESTINOS = "guias_destino_cliente";

interface FilaDestino {
  id: number;
  cliente_codigo: string;
  destino: string;
  tiendas: string[] | null;
  orden: number;
  el_de_siempre: boolean | null;
  creado_por: string;
  creado_en: string;
}

const esTablaAusente = (code: string | undefined, message: string | undefined): boolean =>
  code === "42P01" || /relation .* does not exist|PGRST205|schema cache/i.test(message ?? "");

/**
 * Las filas ACTIVAS, ordenadas por cliente y por `orden`. Lanza si la base
 * falla: quien la llame decide si falla abierto.
 */
async function leerFilasActivas(): Promise<FilaDestino[]> {
  const { data, error } = await supabaseServer
    .from(TABLA_DESTINOS)
    .select("id, cliente_codigo, destino, tiendas, orden, el_de_siempre, creado_por, creado_en")
    .eq("activo", true)
    .order("cliente_codigo", { ascending: true })
    .order("orden", { ascending: true })
    .order("id", { ascending: true });
  if (error) {
    const e = new Error(`${TABLA_DESTINOS}: ${error.message}`);
    (e as Error & { tablaAusente?: boolean }).tablaAusente = esTablaAusente(error.code, error.message);
    throw e;
  }
  return (data ?? []) as FilaDestino[];
}

/**
 * código → destinos definidos, para el orden de precedencia del formulario
 * (`destinosDefinidosPara`). FALLA ABIERTO: sin tabla o sin red devuelve `{}`
 * y los botones caen a la constante — el formulario de guías no puede
 * romperse por una migración pendiente.
 */
export async function leerDefinidosOVacio(): Promise<DefinidosPorCliente> {
  try {
    const filas = await leerFilasActivas();
    const out: Record<string, DestinoDefinido[]> = {};
    for (const f of filas) {
      const lista = out[f.cliente_codigo] ?? (out[f.cliente_codigo] = []);
      lista.push({ destino: f.destino, tiendas: f.tiendas ?? [], elDeSiempre: f.el_de_siempre === true });
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Las filas activas con el nombre del cliente resuelto por la puerta única del
 * directorio — para la pantalla de configuración. Lanza si la base falla.
 */
export async function leerDestinosConfigurados(): Promise<DestinoConfigurado[]> {
  const filas = await leerFilasActivas();
  const nombrePorCodigo = new Map<string, string>();
  for (const c of await leerClientesDelGrupo()) {
    if (c.codigo && c.nombre) nombrePorCodigo.set(c.codigo.trim().toUpperCase(), c.nombre);
  }
  return filas.map((f) => ({
    id: f.id,
    cliente_codigo: f.cliente_codigo,
    cliente_nombre: nombrePorCodigo.get(f.cliente_codigo) ?? null,
    destino: f.destino,
    tiendas: f.tiendas ?? [],
    orden: f.orden,
    el_de_siempre: f.el_de_siempre === true,
    creado_por: f.creado_por,
    creado_en: f.creado_en,
  }));
}

export type ResultadoAltaDestino =
  | { ok: true; id: number }
  | { ok: false; status: 409 | 500 | 503; error: string };

const AVISO_MIGRACION = "Falta correr la migración de guias_destino_cliente (20260918120000)";

/** Define un destino. 409 si ya está activo para ese cliente; 503 sin tabla. */
export async function agregarDestino(
  valor: DestinoNuevo,
  creadoPor: string,
): Promise<ResultadoAltaDestino> {
  // El botón nuevo sale al final: orden = cuántos activos ya tiene el cliente + 1.
  const { count, error: errCount } = await supabaseServer
    .from(TABLA_DESTINOS)
    .select("id", { count: "exact", head: true })
    .eq("cliente_codigo", valor.cliente_codigo)
    .eq("activo", true);
  if (errCount && esTablaAusente(errCount.code, errCount.message)) {
    return { ok: false, status: 503, error: AVISO_MIGRACION };
  }

  const { data, error } = await supabaseServer
    .from(TABLA_DESTINOS)
    .insert({
      cliente_codigo: valor.cliente_codigo,
      destino: valor.destino,
      tiendas: valor.tiendas,
      orden: (count ?? 0) + 1,
      creado_por: creadoPor,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") {
      return { ok: false, status: 409, error: "Ese destino ya está definido para ese cliente" };
    }
    if (esTablaAusente(error.code, error.message)) {
      return { ok: false, status: 503, error: AVISO_MIGRACION };
    }
    return { ok: false, status: 500, error: "No se pudo guardar. Intenta de nuevo en unos segundos." };
  }
  return { ok: true, id: Number((data as { id: number }).id) };
}

export type ResultadoCambioDestino =
  | { ok: true }
  | { ok: false; status: 404 | 409 | 500; error: string };

/**
 * Edita el texto de un destino que ya existe (lo que pidió Daniel: corregir
 * «Calle 19» → «Calle 19 Central, al lado de la joyería Super Oro» sin
 * desplegar) y/o sus tiendas. Solo toca filas que siguen activas.
 */
export async function editarDestino(
  id: number,
  cambios: { destino?: string; tiendas?: string[] },
): Promise<ResultadoCambioDestino> {
  const { data, error } = await supabaseServer
    .from(TABLA_DESTINOS)
    .update(cambios)
    .eq("id", id)
    .eq("activo", true)
    .select("id");
  if (error) {
    if (error.code === "23505") {
      return { ok: false, status: 409, error: "Ese destino ya está definido para ese cliente" };
    }
    return { ok: false, status: 500, error: "No se pudo guardar. Intenta de nuevo en unos segundos." };
  }
  if (!data || data.length === 0) {
    return { ok: false, status: 404, error: "Ese destino ya no está en la lista" };
  }
  return { ok: true };
}

/**
 * 🔴 Marca (o desmarca) «el de siempre» de UNA fila activa (4-sep-2026,
 * Daniel: *«sí correcto, con entrega Sport Corner como default, que elija si
 * quiere el otro sino»*). A lo sumo UNO por cliente: al marcar, primero se
 * APAGAN los demás destinos activos de ese cliente y después se enciende éste
 * — en ese orden, porque el índice parcial único de la tabla rechazaría dos
 * encendidos a la vez.
 */
export async function marcarElDeSiempre(
  id: number,
  valor: boolean,
): Promise<ResultadoCambioDestino> {
  const { data: fila, error: errFila } = await supabaseServer
    .from(TABLA_DESTINOS)
    .select("id, cliente_codigo")
    .eq("id", id)
    .eq("activo", true)
    .single();
  if (errFila || !fila) {
    return { ok: false, status: 404, error: "Ese destino ya no está en la lista" };
  }

  if (valor) {
    const { error: errLimpiar } = await supabaseServer
      .from(TABLA_DESTINOS)
      .update({ el_de_siempre: false })
      .eq("cliente_codigo", (fila as { cliente_codigo: string }).cliente_codigo)
      .eq("activo", true);
    if (errLimpiar) {
      return { ok: false, status: 500, error: "No se pudo guardar. Intenta de nuevo en unos segundos." };
    }
  }

  const { data, error } = await supabaseServer
    .from(TABLA_DESTINOS)
    .update({ el_de_siempre: valor })
    .eq("id", id)
    .eq("activo", true)
    .select("id");
  if (error) {
    return { ok: false, status: 500, error: "No se pudo guardar. Intenta de nuevo en unos segundos." };
  }
  if (!data || data.length === 0) {
    return { ok: false, status: 404, error: "Ese destino ya no está en la lista" };
  }
  return { ok: true };
}

export type ResultadoBajaDestino =
  | { ok: true }
  | { ok: false; status: 404 | 500; error: string };

/** Quita un destino: SOFT DELETE FIRMADO. La fila se queda como historial. */
export async function desactivarDestino(
  id: number,
  desactivadoPor: string,
): Promise<ResultadoBajaDestino> {
  const { data, error } = await supabaseServer
    .from(TABLA_DESTINOS)
    .update({ activo: false, desactivado_por: desactivadoPor, desactivado_en: new Date().toISOString() })
    .eq("id", id)
    .eq("activo", true)
    .select("id");
  if (error) {
    return { ok: false, status: 500, error: "No se pudo quitar. Intenta de nuevo en unos segundos." };
  }
  if (!data || data.length === 0) {
    return { ok: false, status: 404, error: "Ese destino ya no está en la lista" };
  }
  return { ok: true };
}
