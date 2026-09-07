// ─────────────────────────────────────────────────────────────────────────────
// GUÍAS — LA LISTA GENERAL DE DESTINOS, la parte que TOCA LA BASE
// (`guias_destino_lista`, migración `20261014120000`).
//
// Dos lectores:
//   · el FORMULARIO de guías (el `<datalist>` del campo Dirección), FALLANDO
//     ABIERTO: sin tabla, sin red o con la lista vacía cae a `DESTINOS_BASE` y
//     el campo ofrece exactamente lo que ofrecía antes del cambio;
//   · **Guías › Configuración**, que la lista, le agrega y le quita.
//
// 🔴 NUNCA DELETE. Quitar = `activo = false` + quién y cuándo (soft delete
// firmado, el mismo patrón que `guias_destino_cliente`). Hay CHECK en la tabla
// que exige la firma.
// ─────────────────────────────────────────────────────────────────────────────

import { supabaseServer } from "@/lib/supabase-server";
import { DESTINOS_BASE, listaParaElCampo, yaEstaEnLaLista, type DestinoDeLista } from "@/lib/guias/destinos-lista";

export const TABLA_DESTINOS_LISTA = "guias_destino_lista";

const esTablaAusente = (code: string | undefined, message: string | undefined): boolean =>
  code === "42P01" || /relation .* does not exist|PGRST205|schema cache/i.test(message ?? "");

/** Las filas ACTIVAS, las más viejas primero. Lanza si la base falla. */
async function leerFilasActivas(): Promise<DestinoDeLista[]> {
  const { data, error } = await supabaseServer
    .from(TABLA_DESTINOS_LISTA)
    .select("id, destino, creado_por, creado_en")
    .eq("activo", true)
    .order("id", { ascending: true });
  if (error) {
    const e = new Error(`${TABLA_DESTINOS_LISTA}: ${error.message}`);
    (e as Error & { tablaAusente?: boolean }).tablaAusente = esTablaAusente(error.code, error.message);
    throw e;
  }
  return (data ?? []) as DestinoDeLista[];
}

/**
 * La lista para el campo Dirección. **FALLA ABIERTA**: sin tabla o sin red
 * devuelve `DESTINOS_BASE` — el formulario de guías no puede romperse por una
 * migración pendiente.
 */
export async function leerListaODefaults(): Promise<string[]> {
  try {
    const filas = await leerFilasActivas();
    return listaParaElCampo(filas.map((f) => f.destino));
  } catch {
    return [...DESTINOS_BASE];
  }
}

/** Las filas activas con su id — para Guías › Configuración. Lanza si falla. */
export async function leerListaConfigurada(): Promise<DestinoDeLista[]> {
  return leerFilasActivas();
}

export type ResultadoAltaLista =
  | { ok: true; id: number }
  | { ok: false; status: 409 | 500 | 503; error: string };

const AVISO_MIGRACION = "Falta correr la migración de guias_destino_lista (20261014120000)";

/**
 * Agrega un destino a la lista compartida.
 *
 * 🔴 El repetido se rechaza por `claveDestino` —la regla exacta de los
 * botones—, no solo por texto igual: sin eso «DAVID» y «David» convivirían en
 * el mismo desplegable y la lista volvería a ensuciarse sola.
 */
export async function agregarALaLista(
  destino: string,
  creadoPor: string,
): Promise<ResultadoAltaLista> {
  let activos: DestinoDeLista[];
  try {
    activos = await leerFilasActivas();
  } catch (e) {
    if ((e as Error & { tablaAusente?: boolean }).tablaAusente) {
      return { ok: false, status: 503, error: AVISO_MIGRACION };
    }
    return { ok: false, status: 500, error: "No se pudo guardar. Intenta de nuevo en unos segundos." };
  }
  if (yaEstaEnLaLista(destino, activos.map((f) => f.destino))) {
    return { ok: false, status: 409, error: "Ese destino ya está en la lista" };
  }

  const { data, error } = await supabaseServer
    .from(TABLA_DESTINOS_LISTA)
    .insert({ destino, creado_por: creadoPor })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") {
      return { ok: false, status: 409, error: "Ese destino ya está en la lista" };
    }
    if (esTablaAusente(error.code, error.message)) {
      return { ok: false, status: 503, error: AVISO_MIGRACION };
    }
    return { ok: false, status: 500, error: "No se pudo guardar. Intenta de nuevo en unos segundos." };
  }
  return { ok: true, id: Number((data as { id: number }).id) };
}

export type ResultadoBajaLista =
  | { ok: true }
  | { ok: false; status: 404 | 500; error: string };

/** Quita un destino de la lista: SOFT DELETE FIRMADO. La fila se queda. */
export async function desactivarDeLaLista(
  id: number,
  desactivadoPor: string,
): Promise<ResultadoBajaLista> {
  const { data, error } = await supabaseServer
    .from(TABLA_DESTINOS_LISTA)
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
