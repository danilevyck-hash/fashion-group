// ============================================================================
// Marketing › Mobiliario — NOTAS DEL PROVEEDOR (I/O)
// ============================================================================
// Server-side. Usa supabaseServer (service role). Las reglas y la validación
// viven en ./notas-proveedor.ts (puro) — acá solo hay base y Storage.
//
// 🔴 Esta tabla NO participa de ningún cálculo del módulo. Ver el encabezado
//    de ./notas-proveedor.ts. No agregar acá un `sumarNotas()`.
//
// 🟡 TOLERANTE A DDL PENDIENTE (patrón del repo, ver `variantes-server.ts` /
//    `asistencia/config-server.ts`). La migración
//    `20260808120000_mk_mobiliario_notas_proveedor.sql` la corre Daniel A MANO,
//    y la pantalla tiene que funcionar ANTES de eso: mientras la tabla no
//    exista, `listNotasProveedor()` devuelve la lista vacía con
//    `ddlPendiente: true` y la pantalla lo dice con todas las letras en vez de
//    reventar. Las escrituras SÍ fallan (con un mensaje que nombra el archivo
//    de la migración): guardar en una tabla que no existe no se puede
//    degradar, y decir "guardado" sin guardar sería peor que el error.
// ============================================================================

import { supabaseServer } from "@/lib/supabase-server";
import { firmarPath } from "./storage";
import {
  ordenarNotas,
  siguienteOrden,
  type NotaProveedorInput,
  type NotaProveedorRenglon,
} from "./notas-proveedor";

const TABLA = "mk_mobiliario_notas_proveedor";
const COLUMNAS = "id, producto, precio, nota, foto_paths, orden, created_at";

/** Nombre del archivo de migración, para poder decirlo en pantalla. */
export const MIGRACION_NOTAS =
  "20260808120000_mk_mobiliario_notas_proveedor.sql";

/**
 * "La tabla todavía no existe" — 42P01 es `undefined_table` de Postgres y
 * PGRST205 es el equivalente de PostgREST cuando no está en su schema cache.
 * Cualquier otro error es un error de verdad y se propaga.
 */
function esTablaAusente(error: { code?: string | null } | null): boolean {
  const code = error?.code ?? "";
  return code === "42P01" || code === "PGRST205";
}

export interface NotasProveedorResultado {
  notas: NotaProveedorRenglon[];
  /** true = falta correr la migración. La pantalla lo explica. */
  ddlPendiente: boolean;
}

function mapRow(row: Record<string, unknown>): NotaProveedorRenglon {
  const precioRaw = row.precio;
  const precio =
    precioRaw === null || precioRaw === undefined ? null : Number(precioRaw);
  const paths = Array.isArray(row.foto_paths)
    ? (row.foto_paths as unknown[]).map((p) => String(p)).filter((p) => p !== "")
    : [];
  const nota = row.nota ? String(row.nota) : null;
  return {
    id: String(row.id),
    producto: String(row.producto ?? ""),
    precio: precio !== null && Number.isFinite(precio) ? precio : null,
    nota,
    fotoPaths: paths,
    fotoUrls: [],
    orden: Number(row.orden ?? 0),
  };
}

/**
 * Firma las fotos para que el <img> las pueda mostrar (el bucket `marketing`
 * es privado). Una foto que no se puede firmar se cae de la lista en vez de
 * tumbar la nota entera: el dato que importa es producto + precio.
 */
async function firmarFotos(
  notas: NotaProveedorRenglon[],
): Promise<NotaProveedorRenglon[]> {
  return Promise.all(
    notas.map(async (n) => {
      if (n.fotoPaths.length === 0) return n;
      const urls: string[] = [];
      for (const path of n.fotoPaths) {
        try {
          urls.push(await firmarPath(path));
        } catch (err) {
          console.warn(
            `notas-proveedor: no se pudo firmar ${path}`,
            err instanceof Error ? err.message : err,
          );
        }
      }
      return { ...n, fotoUrls: urls };
    }),
  );
}

/** Lee la nota completa. Degrada limpio si falta la migración. */
export async function listNotasProveedor(): Promise<NotasProveedorResultado> {
  const { data, error } = await supabaseServer
    .from(TABLA)
    .select(COLUMNAS)
    .order("orden", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    if (esTablaAusente(error)) return { notas: [], ddlPendiente: true };
    throw new Error(error.message);
  }

  const notas = ordenarNotas(
    (data ?? []).map((r) => mapRow(r as Record<string, unknown>)),
  );
  return { notas: await firmarFotos(notas), ddlPendiente: false };
}

function errorDeEscritura(error: {
  code?: string | null;
  message: string;
}): Error {
  if (esTablaAusente(error)) {
    return new Error(
      `Todavía no se puede guardar: falta correr la migración ${MIGRACION_NOTAS} en Supabase.`,
    );
  }
  return new Error(error.message);
}

/** Agrega un renglón al final de la lista. */
export async function createNotaProveedor(
  input: NotaProveedorInput,
): Promise<NotaProveedorRenglon> {
  const { notas, ddlPendiente } = await listNotasProveedor();
  if (ddlPendiente) {
    throw new Error(
      `Todavía no se puede guardar: falta correr la migración ${MIGRACION_NOTAS} en Supabase.`,
    );
  }

  const { data, error } = await supabaseServer
    .from(TABLA)
    .insert({
      producto: input.producto,
      precio: input.precio,
      nota: input.nota,
      foto_paths: input.fotoPaths,
      orden: siguienteOrden(notas),
    })
    .select(COLUMNAS)
    .single();

  if (error || !data) {
    throw errorDeEscritura(error ?? { message: "No se pudo guardar" });
  }
  const [firmada] = await firmarFotos([mapRow(data as Record<string, unknown>)]);
  return firmada;
}

/** Edita un renglón (producto, precio, aclaración y/o fotos). */
export async function updateNotaProveedor(
  id: string,
  input: NotaProveedorInput,
): Promise<NotaProveedorRenglon> {
  const { data, error } = await supabaseServer
    .from(TABLA)
    .update({
      producto: input.producto,
      precio: input.precio,
      nota: input.nota,
      foto_paths: input.fotoPaths,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select(COLUMNAS)
    .single();

  if (error || !data) {
    throw errorDeEscritura(error ?? { message: "No se encontró el renglón" });
  }
  const [firmada] = await firmarFotos([mapRow(data as Record<string, unknown>)]);
  return firmada;
}

/**
 * Borra un renglón. La FOTO de Storage se deja donde está: es un archivo
 * chico y borrarlo es irreversible — mismo criterio que el resto del repo
 * (una foto que no se puede recuperar cuesta más que unos KB de más).
 */
export async function deleteNotaProveedor(id: string): Promise<void> {
  const { error } = await supabaseServer.from(TABLA).delete().eq("id", id);
  if (error) throw errorDeEscritura(error);
}
