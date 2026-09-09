// ─────────────────────────────────────────────────────────────────────────────
// GUÍAS — LOS TRANSPORTISTAS, la parte que TOCA LA BASE (tabla `transportistas`,
// migración `20261025120000`).
//
// Dos lectores:
//   · el FORMULARIO de guías (el desplegable «Transportista»), que ya leía esta
//     tabla desde el 26-may-2026 y NO cambia de forma;
//   · **Guías › Configuración**, que la lista CON CUÁNTAS GUÍAS lleva cada uno,
//     le agrega y le quita.
//
// 🔴 NUNCA DELETE. Quitar = `activo = false` + quién y cuándo (soft delete
// firmado, el mismo patrón que `guias_destino_lista`). Hay CHECK en la tabla
// que exige la firma, y un transportista quitado **no le borra el nombre a
// ninguna guía vieja**: la guía apunta a la fila por id y la fila se queda.
//
// 🔴 Esta ruta NO toca `guia_transporte` ni `guia_items`: los LEE para contar
// guías, jamás los escribe.
// ─────────────────────────────────────────────────────────────────────────────

import { supabaseServer } from "@/lib/supabase-server";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import {
  conCuentaDeGuias,
  contarGuiasPorTransportista,
  yaEsUnTransportista,
  type Transportista,
  type TransportistaConfigurado,
} from "@/lib/guias/transportistas";

export const TABLA_TRANSPORTISTAS = "transportistas";

const esColumnaAusente = (code: string | undefined, message: string | undefined): boolean =>
  code === "42703" || code === "PGRST204" || /column .* does not exist|schema cache/i.test(message ?? "");

/** Los ACTIVOS, por nombre. La MISMA lectura que ya hacía el desplegable. */
export async function leerTransportistasActivos(): Promise<Transportista[]> {
  const { data, error } = await supabaseServer
    .from(TABLA_TRANSPORTISTAS)
    .select("id, nombre, activo")
    .eq("activo", true)
    .order("nombre", { ascending: true });
  if (error) throw new Error(`${TABLA_TRANSPORTISTAS}: ${error.message}`);
  return (data ?? []) as Transportista[];
}

/**
 * Los activos CON cuántas guías lleva cada uno — para Guías › Configuración.
 *
 * ⚠️ Las guías se leen con `leerTodoPaginado`: `db-max-rows` es 1000 y corta EN
 * SILENCIO. Hoy son 227, pero un día serán 1.001 y la cuenta se quedaría corta
 * sin que nadie se entere.
 */
export async function leerTransportistasConGuias(): Promise<TransportistaConfigurado[]> {
  const filas = await leerTransportistasActivos();
  const guias = await leerTodoPaginado<{ transportista_id: string | null }>(
    "guia_transporte (cuenta por transportista)",
    (pedirCount, desde, hasta) =>
      supabaseServer
        .from("guia_transporte")
        .select("id, transportista_id", pedirCount ? { count: "exact" } : undefined)
        .eq("deleted", false)
        // Orden estable por la única columna única: sin él la paginación repite.
        .order("id", { ascending: true })
        .range(desde, hasta),
  );
  return conCuentaDeGuias(filas, contarGuiasPorTransportista(guias));
}

export type ResultadoAltaTransportista =
  | { ok: true; id: string; revivido: boolean }
  | { ok: false; status: 409 | 500 | 503; error: string };

const AVISO_MIGRACION = "Falta correr la migración de transportistas (20261025120000)";

/**
 * Agrega un transportista.
 *
 * 🔴 El repetido se rechaza por la clave normalizada —la MISMA regla de los
 * destinos—, no solo por texto igual: sin eso «RedNblue» y «REDNBLUE»
 * convivirían en el mismo desplegable y la lista volvería a ensuciarse sola.
 *
 * 🔴 Y si el nombre ya existe QUITADO, se REVIVE la fila en vez de crear una
 * segunda: así las guías viejas que lo usaban vuelven a apuntar al mismo, y el
 * índice único entre activos no se pelea con nadie.
 */
export async function agregarTransportista(
  nombre: string,
  creadoPor: string,
): Promise<ResultadoAltaTransportista> {
  const { data: existentes, error: errorLectura } = await supabaseServer
    .from(TABLA_TRANSPORTISTAS)
    .select("id, nombre, activo")
    .order("nombre", { ascending: true });
  if (errorLectura) {
    return { ok: false, status: 500, error: "No se pudo guardar. Intenta de nuevo en unos segundos." };
  }
  const filas = (existentes ?? []) as Transportista[];

  const activos = filas.filter((f) => f.activo);
  if (yaEsUnTransportista(nombre, activos.map((f) => f.nombre))) {
    return { ok: false, status: 409, error: "Ese transportista ya está en la lista" };
  }

  // ¿Estaba quitado? Se revive la MISMA fila: nunca una segunda con el mismo
  // nombre. Se limpia la firma de la baja porque ya no está quitado.
  const quitado = filas.find(
    (f) => !f.activo && yaEsUnTransportista(nombre, [f.nombre]),
  );
  if (quitado) {
    const { error } = await supabaseServer
      .from(TABLA_TRANSPORTISTAS)
      .update({ activo: true, desactivado_por: null, desactivado_en: null })
      .eq("id", quitado.id);
    if (error) {
      if (esColumnaAusente(error.code, error.message)) {
        return { ok: false, status: 503, error: AVISO_MIGRACION };
      }
      return { ok: false, status: 500, error: "No se pudo guardar. Intenta de nuevo en unos segundos." };
    }
    return { ok: true, id: quitado.id, revivido: true };
  }

  const { data, error } = await supabaseServer
    .from(TABLA_TRANSPORTISTAS)
    .insert({ nombre, creado_por: creadoPor })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") {
      return { ok: false, status: 409, error: "Ese transportista ya está en la lista" };
    }
    if (esColumnaAusente(error.code, error.message)) {
      return { ok: false, status: 503, error: AVISO_MIGRACION };
    }
    return { ok: false, status: 500, error: "No se pudo guardar. Intenta de nuevo en unos segundos." };
  }
  return { ok: true, id: String((data as { id: string }).id), revivido: false };
}

export type ResultadoBajaTransportista =
  | { ok: true }
  | { ok: false; status: 404 | 500 | 503; error: string };

/**
 * Quita un transportista: SOFT DELETE FIRMADO. La fila se queda, y con ella el
 * nombre que muestran sus guías viejas.
 */
export async function desactivarTransportista(
  id: string,
  desactivadoPor: string,
): Promise<ResultadoBajaTransportista> {
  const { data, error } = await supabaseServer
    .from(TABLA_TRANSPORTISTAS)
    .update({ activo: false, desactivado_por: desactivadoPor, desactivado_en: new Date().toISOString() })
    .eq("id", id)
    .eq("activo", true)
    .select("id");
  if (error) {
    if (esColumnaAusente(error.code, error.message)) {
      return { ok: false, status: 503, error: AVISO_MIGRACION };
    }
    return { ok: false, status: 500, error: "No se pudo quitar. Intenta de nuevo en unos segundos." };
  }
  if (!data || data.length === 0) {
    return { ok: false, status: 404, error: "Ese transportista ya no está en la lista" };
  }
  return { ok: true };
}
