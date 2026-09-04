/**
 * LAS ANOTACIONES DEL CXC — la ÚNICA puerta a `cxc_favorites`,
 * `cxc_client_overrides` y `cxc_contact_log`.
 *
 * ─── POR QUÉ UNA PUERTA ÚNICA ───────────────────────────────────────────────
 * La regla que hay que sostener es *"ningún camino escribe sin cartera"*. Con
 * las consultas repartidas en cinco routes, esa regla la sostiene que nadie se
 * olvide — y el route número seis que alguien escriba mañana nacería sin
 * cartera, o sea metiendo la nota de una cartera en la otra. Es el MISMO modo
 * de fallo que el #522 tuvo que arreglar en la MV del aging: dos copias del
 * mismo criterio, una se actualizó y la otra no.
 *
 * Acá el criterio vive UNA vez, y `cxc-anotaciones-cartera.test.ts` hace un
 * BARRIDO por `src/` que pone el build ROJO si cualquier otro archivo toca esas
 * tres tablas. Un camino nuevo nace vigilado.
 *
 * ─── HISTORIA: LA DEGRADACIÓN QUE HUBO, Y POR QUÉ YA NO ────────────────────
 * La columna `cartera` la agregó un DDL que corrió Daniel A MANO
 * (20260813120000_cxc_anotaciones_por_cartera.sql), y mientras no existiera cada
 * consulta se reintentaba SIN la columna: el grupo leía/escribía como antes
 * (las 151 filas que había eran todas suyas) y Boston fallaba con un mensaje
 * claro (`CarteraNoDisponibleError`) para no escribir en el namespace
 * compartido.
 *
 * Tolerancia retirada el 3-sep-2026: la columna existe en las tres tablas
 * (verificado en producción). Hoy TODA consulta lleva la cartera y un error
 * —cualquiera— se propaga con su `code` intacto. Reintentar sin la columna, con
 * la columna puesta, sería la puerta para que un permiso o un timeout metieran
 * una nota del grupo sin cartera o leyeran la de Boston sin filtro: lo que
 * Daniel prohibió. `cartera.ts` (puro) conserva el detector y el error por si
 * otra tanda los necesita; acá ya no se usan.
 */
import { supabaseServer } from "@/lib/supabase-server";
import type { Cartera } from "./cartera";

export const TABLAS_ANOTACIONES = ["cxc_favorites", "cxc_client_overrides", "cxc_contact_log"] as const;

interface ErrorPg {
  code?: string;
  message?: string;
}

/**
 * Error de escritura con el `code` de Postgres INTACTO.
 *
 * 🩸 No es un detalle: `respuestaErrorEscritura` (campos-obligatorios) decide
 * qué le dice a la persona mirando el código (`23502`, `PGRST204`, …). Un
 * `new Error(msg)` pelado lo perdería y todo caería en "Error interno", que es
 * justo lo que ese módulo existe para evitar.
 */
export class ErrorAnotacion extends Error {
  constructor(
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "ErrorAnotacion";
  }
}

function comoError(err: ErrorPg | null, fallback: string): ErrorAnotacion {
  return new ErrorAnotacion(err?.message ?? fallback, err?.code);
}

/** Lo que devuelve un builder de PostgREST (thenable, no promesa). */
type Resultado<T> = { data: T | null; error: ErrorPg | null };

// ─────────────────────────────────────────────────────────────────────────────
// FAVORITOS (la estrella ⭐, por usuario)
// ─────────────────────────────────────────────────────────────────────────────

/** Nombres marcados como favoritos por `userId` EN ESA CARTERA. */
export async function leerFavoritos(cartera: Cartera, userId: string): Promise<string[]> {
  const { data, error }: Resultado<{ nombre_normalized: string }[]> = await supabaseServer
    .from("cxc_favorites")
    .select("nombre_normalized")
    .eq("user_id", userId)
    .eq("cartera", cartera);
  if (error) throw comoError(error, "Error al leer favoritos");
  return (data ?? []).map((r) => r.nombre_normalized);
}

/** Pone o quita la estrella. Devuelve qué pasó, para el mensaje de la pantalla. */
export async function alternarFavorito(
  cartera: Cartera,
  userId: string,
  nombre: string,
): Promise<"added" | "removed"> {
  const { data: existente, error: errLeer }: Resultado<{ id: string }[]> = await supabaseServer
    .from("cxc_favorites")
    .select("id")
    .eq("user_id", userId)
    .eq("nombre_normalized", nombre)
    .eq("cartera", cartera)
    .limit(1);
  if (errLeer) throw comoError(errLeer, "Error al leer favoritos");

  const fila = existente?.[0];
  if (fila) {
    const { error } = await supabaseServer.from("cxc_favorites").delete().eq("id", fila.id);
    if (error) throw comoError(error, "Error al quitar favorito");
    return "removed";
  }

  const { error } = await supabaseServer
    .from("cxc_favorites")
    .insert({ user_id: userId, nombre_normalized: nombre, cartera });
  if (error) throw comoError(error, "Error al guardar favorito");
  return "added";
}

// ─────────────────────────────────────────────────────────────────────────────
// DATOS DE CONTACTO (`cxc_client_overrides`)
// ─────────────────────────────────────────────────────────────────────────────

export interface OverrideCliente {
  nombre_normalized: string;
  correo?: string | null;
  telefono?: string | null;
  celular?: string | null;
  contacto?: string | null;
  resultado_contacto?: string | null;
  proximo_seguimiento?: string | null;
  updated_at?: string;
}

/** Todos los datos de contacto de esa cartera. */
export async function leerOverrides(cartera: Cartera): Promise<Record<string, unknown>[]> {
  const { data, error }: Resultado<Record<string, unknown>[]> = await supabaseServer
    .from("cxc_client_overrides")
    .select("*")
    .eq("cartera", cartera);
  if (error) throw comoError(error, "Error al leer contactos");
  return data ?? [];
}

/**
 * El correo guardado a mano para ese cliente EN ESA CARTERA, o `null`.
 *
 * Es una SUGERENCIA (el destinatario que propone el modal de estado de cuenta),
 * así que nunca lanza: "no lo pude leer" y "no hay ninguno cargado" llevan al
 * mismo lugar — caer al correo del directorio. Lo que sí está prohibido es
 * devolver el de la OTRA cartera: la consulta SIEMPRE filtra por `cartera`.
 */
export async function leerCorreoDeOverride(cartera: Cartera, nombre: string): Promise<string | null> {
  try {
    const { data, error }: Resultado<{ correo: string | null }[]> = await supabaseServer
      .from("cxc_client_overrides")
      .select("correo")
      .eq("nombre_normalized", nombre)
      .eq("cartera", cartera)
      .limit(1);
    if (error) return null;
    return data?.[0]?.correo?.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Guarda (o pisa) los datos de contacto de un cliente EN ESA CARTERA.
 *
 * 🔴 El `onConflict` tiene que llevar la cartera adentro. Con el UNIQUE viejo
 * —solo `nombre_normalized`— las dos carteras nunca podrían tener su propia
 * ficha: la segunda pisaría a la primera en silencio.
 */
export async function guardarOverride(
  cartera: Cartera,
  fila: OverrideCliente,
): Promise<Record<string, unknown> | null> {
  const base = { ...fila, updated_at: fila.updated_at ?? new Date().toISOString() };
  const { data, error }: Resultado<Record<string, unknown>[]> = await supabaseServer
    .from("cxc_client_overrides")
    .upsert({ ...base, cartera }, { onConflict: "cartera,nombre_normalized" })
    .select();
  if (error) throw comoError(error, "Error al guardar contacto");
  return data?.[0] ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// BITÁCORA DE CONTACTOS (`cxc_contact_log`)
// ─────────────────────────────────────────────────────────────────────────────

/** Los últimos `limite` contactos anotados EN ESA CARTERA, del más nuevo al más viejo. */
export async function leerContactLog(cartera: Cartera, limite = 2000): Promise<Record<string, unknown>[]> {
  const { data, error }: Resultado<Record<string, unknown>[]> = await supabaseServer
    .from("cxc_contact_log")
    .select("*")
    .eq("cartera", cartera)
    .order("contacted_at", { ascending: false })
    .limit(limite);
  if (error) throw comoError(error, "Error al leer contactos");
  return data ?? [];
}

/** Anota un contacto de cobro EN ESA CARTERA. */
export async function registrarContacto(cartera: Cartera, nombre: string, method: string): Promise<void> {
  const { error } = await supabaseServer
    .from("cxc_contact_log")
    .insert({ nombre_normalized: nombre, method, cartera });
  if (error) throw comoError(error, "Error al registrar contacto");
}
