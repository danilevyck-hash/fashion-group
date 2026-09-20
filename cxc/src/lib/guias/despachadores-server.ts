// ─────────────────────────────────────────────────────────────────────────────
// GUÍAS — LA LISTA DE «DESPACHADO POR», la parte que TOCA LA BASE
// (`guias_despachadores`, migración `20261210120000`).
//
// Dos lectores:
//   · el FORMULARIO de guías (el desplegable «Despachado por»), FALLANDO
//     ABIERTO: sin tabla, sin red o con la lista vacía cae a
//     `DESPACHADORES_BASE` y el desplegable ofrece exactamente lo que ofrecía
//     antes del cambio;
//   · **Guías › Configuración**, que la lista CON CUÁNTAS GUÍAS despachó cada
//     uno, le agrega y le quita.
//
// 🔴 NUNCA DELETE. Quitar = `activo = false` + quién y cuándo (soft delete
// firmado, el mismo patrón que `guias_destino_lista` y `transportistas`). Hay
// CHECK en la tabla que exige la firma.
//
// 🔴 Esta ruta NO escribe una sola guía: lee `guia_transporte` para contar,
// nada más.
// ─────────────────────────────────────────────────────────────────────────────

import { supabaseServer } from "@/lib/supabase-server";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import {
  DESPACHADORES_BASE,
  claveDespachador,
  conCuentaDeGuias,
  contarGuiasPorDespachador,
  listaParaElDesplegable,
  yaEsUnDespachador,
  type Despachador,
  type DespachadorConfigurado,
} from "@/lib/guias/despachadores";

export const TABLA_DESPACHADORES = "guias_despachadores";

const esTablaAusente = (code: string | undefined, message: string | undefined): boolean =>
  code === "42P01" || /relation .* does not exist|PGRST205|schema cache/i.test(message ?? "");

/** Las filas ACTIVAS, las más viejas primero. Lanza si la base falla. */
async function leerFilasActivas(): Promise<Despachador[]> {
  const { data, error } = await supabaseServer
    .from(TABLA_DESPACHADORES)
    .select("id, nombre, creado_por, creado_en")
    .eq("activo", true)
    .order("id", { ascending: true });
  if (error) {
    const e = new Error(`${TABLA_DESPACHADORES}: ${error.message}`);
    (e as Error & { tablaAusente?: boolean }).tablaAusente = esTablaAusente(error.code, error.message);
    throw e;
  }
  return (data ?? []) as Despachador[];
}

/**
 * La lista para el desplegable. **FALLA ABIERTA**: sin tabla o sin red
 * devuelve `DESPACHADORES_BASE` — el formulario de guías no puede romperse por
 * una migración pendiente.
 */
export async function leerDespachadoresODefaults(): Promise<string[]> {
  try {
    const filas = await leerFilasActivas();
    return listaParaElDesplegable(filas.map((f) => f.nombre));
  } catch {
    return [...DESPACHADORES_BASE];
  }
}

/**
 * Los activos CON cuántas guías despachó cada uno — para Configuración.
 *
 * ⚠️ Las guías se leen con `leerTodoPaginado`: `db-max-rows` es 1000 y corta EN
 * SILENCIO. Hoy son poco más de 200, pero un día serán 1.001 y la cuenta se
 * quedaría corta sin que nadie se entere.
 */
export async function leerDespachadoresConGuias(): Promise<DespachadorConfigurado[]> {
  const filas = await leerFilasActivas();
  const guias = await leerTodoPaginado<{ entregado_por: string | null }>(
    "guia_transporte (cuenta por despachador)",
    (pedirCount, desde, hasta) =>
      supabaseServer
        .from("guia_transporte")
        .select("id, entregado_por", pedirCount ? { count: "exact" } : undefined)
        .eq("deleted", false)
        // Orden estable por la única columna única: sin él la paginación repite.
        .order("id", { ascending: true })
        .range(desde, hasta),
  );
  return conCuentaDeGuias(filas, contarGuiasPorDespachador(guias));
}

export type ResultadoAltaDespachador =
  | { ok: true; id: number; revivido: boolean }
  | { ok: false; status: 409 | 500 | 503; error: string };

const AVISO_MIGRACION = "Falta correr la migración de guias_despachadores (20261210120000)";

/**
 * Agrega un nombre a la lista.
 *
 * 🔴 El repetido se rechaza por la clave normalizada —la MISMA regla de los
 * destinos—, no solo por texto igual: sin eso «Julio» y «JULIO» convivirían en
 * el mismo desplegable.
 *
 * 🔴 Y si el nombre ya existe QUITADO, se REVIVE la fila en vez de crear una
 * segunda: el índice único entre activos no se pelea con nadie.
 */
export async function agregarDespachador(
  nombre: string,
  creadoPor: string,
): Promise<ResultadoAltaDespachador> {
  const { data: existentes, error: errorLectura } = await supabaseServer
    .from(TABLA_DESPACHADORES)
    .select("id, nombre, activo")
    .order("id", { ascending: true });
  if (errorLectura) {
    if (esTablaAusente(errorLectura.code, errorLectura.message)) {
      return { ok: false, status: 503, error: AVISO_MIGRACION };
    }
    return { ok: false, status: 500, error: "No se pudo guardar. Intenta de nuevo en unos segundos." };
  }
  const filas = (existentes ?? []) as Array<{ id: number; nombre: string; activo: boolean }>;

  const activos = filas.filter((f) => f.activo);
  if (yaEsUnDespachador(nombre, activos.map((f) => f.nombre))) {
    return { ok: false, status: 409, error: "Ese nombre ya está en la lista" };
  }

  const quitado = filas.find((f) => !f.activo && claveDespachador(f.nombre) === claveDespachador(nombre));
  if (quitado) {
    const { error } = await supabaseServer
      .from(TABLA_DESPACHADORES)
      .update({ activo: true, desactivado_por: null, desactivado_en: null })
      .eq("id", quitado.id);
    if (error) {
      return { ok: false, status: 500, error: "No se pudo guardar. Intenta de nuevo en unos segundos." };
    }
    return { ok: true, id: Number(quitado.id), revivido: true };
  }

  const { data, error } = await supabaseServer
    .from(TABLA_DESPACHADORES)
    .insert({ nombre, creado_por: creadoPor })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") {
      return { ok: false, status: 409, error: "Ese nombre ya está en la lista" };
    }
    if (esTablaAusente(error.code, error.message)) {
      return { ok: false, status: 503, error: AVISO_MIGRACION };
    }
    return { ok: false, status: 500, error: "No se pudo guardar. Intenta de nuevo en unos segundos." };
  }
  return { ok: true, id: Number((data as { id: number }).id), revivido: false };
}

export type ResultadoBajaDespachador =
  | { ok: true }
  | { ok: false; status: 404 | 500 | 503; error: string };

/**
 * Quita un nombre de la lista: SOFT DELETE FIRMADO. La fila se queda, y con
 * ella el nombre que muestran sus guías viejas.
 */
export async function desactivarDespachador(
  id: number,
  desactivadoPor: string,
): Promise<ResultadoBajaDespachador> {
  const { data, error } = await supabaseServer
    .from(TABLA_DESPACHADORES)
    .update({ activo: false, desactivado_por: desactivadoPor, desactivado_en: new Date().toISOString() })
    .eq("id", id)
    .eq("activo", true)
    .select("id");
  if (error) {
    if (esTablaAusente(error.code, error.message)) {
      return { ok: false, status: 503, error: AVISO_MIGRACION };
    }
    return { ok: false, status: 500, error: "No se pudo quitar. Intenta de nuevo en unos segundos." };
  }
  if (!data || data.length === 0) {
    return { ok: false, status: 404, error: "Ese nombre ya no está en la lista" };
  }
  return { ok: true };
}
