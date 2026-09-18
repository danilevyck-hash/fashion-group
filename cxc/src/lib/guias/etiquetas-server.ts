// ─────────────────────────────────────────────────────────────────────────────
// GUÍAS › ETIQUETAS — la parte que TOCA LA BASE (`guias_etiquetas`, migración
// `20261207120000`).
//
// 🔴 FALLA ABIERTA MIENTRAS LA MIGRACIÓN NO CORRA. Sin la tabla, la pestaña se
// dibuja igual y dice que falta correr la migración; el formulario de Nueva
// guía no cambia ni un campo y nada más se rompe. Quien lee distingue «la tabla
// no existe» de «la base falló» con `esTablaAusente`, como
// `destinos-lista-server.ts`.
//
// 🔴 EL SERVIDOR ES QUIEN DECIDE, NO EL BOTÓN:
//   · etiquetar una factura que ya tiene etiquetas vivas → **409**, siempre,
//     aunque la pantalla haya ofrecido el botón;
//   · corregir o borrar una etiqueta que ya salió en una guía → **409**;
//   · el índice único parcial de la base es la red de abajo, no la regla.
//
// 🔴 SOFT DELETE FIRMADO, NUNCA DELETE.
//
// 🔴 ESTA CAPA NO ESCRIBE NI UNA FILA DE `guia_items` NI DE `guia_transporte`:
// la guía se sigue creando exactamente igual que hoy. Lo único que cruza es la
// LECTURA del renglón (para derivar el estado) y el `guia_item_id` que se anota
// de este lado al importar.
// ─────────────────────────────────────────────────────────────────────────────

import { supabaseServer } from "@/lib/supabase-server";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import { mapEmpresaName } from "@/lib/empresa-mapping";
import {
  guiaQueSeLlevo,
  rotuloGuia,
  type EtiquetaFila,
  type EtiquetaNueva,
} from "@/lib/guias/etiquetas";

export const TABLA_ETIQUETAS = "guias_etiquetas";

export const AVISO_MIGRACION =
  "Falta correr la migración de guias_etiquetas (20261207120000)";

/** El error que lleva la marca de «la tabla todavía no existe». */
export type ErrorConTabla = Error & { tablaAusente?: boolean };

export function esTablaAusente(code: string | undefined, message: string | undefined): boolean {
  return code === "42P01" || /relation .* does not exist|PGRST205|schema cache/i.test(message ?? "");
}

function errorDeTabla(code: string | undefined, message: string | undefined): ErrorConTabla {
  const e = new Error(`${TABLA_ETIQUETAS}: ${message ?? "error"}`) as ErrorConTabla;
  e.tablaAusente = esTablaAusente(code, message);
  return e;
}

interface FilaCruda {
  id: number;
  empresa_key: string;
  switch_factura_id: number;
  secuencial: string;
  fecha_factura: string;
  cliente_codigo: string;
  cliente_nombre: string;
  destino: string;
  cajas: number;
  creado_en: string;
  guia_item_id: string | null;
}

const COLUMNAS =
  "id, empresa_key, switch_factura_id, secuencial, fecha_factura, cliente_codigo, " +
  "cliente_nombre, destino, cajas, creado_en, guia_item_id";

/**
 * 🔴 EL ESTADO SE DERIVA EN TRES LECTURAS, NUNCA DE UNA COLUMNA: etiquetas →
 * los renglones a los que apuntan → las guías de esos renglones. Se hace con
 * consultas sueltas y no con `embed` de PostgREST a propósito: el embed
 * anidado depende de que las claves foráneas estén como PostgREST espera, y si
 * un día no lo están el estado se apagaría EN SILENCIO (todas «Pendiente»).
 */
export async function leerEtiquetas(): Promise<EtiquetaFila[]> {
  const filas = await leerTodoPaginado<FilaCruda>(
    `${TABLA_ETIQUETAS} (lista)`,
    (pedirCount, desde, hasta) =>
      supabaseServer
        .from(TABLA_ETIQUETAS)
        .select(COLUMNAS, pedirCount ? { count: "exact" } : {})
        .eq("deleted", false)
        .order("id", { ascending: true })
        .range(desde, hasta),
  ).catch((e: unknown) => {
    const err = e as { code?: string; message?: string };
    throw errorDeTabla(err?.code, err?.message ?? String(e));
  });

  const numeroPorRenglon = await guiasDeLosRenglones(
    filas.map((f) => f.guia_item_id).filter((v): v is string => typeof v === "string"),
  );

  return filas
    .map((f) => ({
      id: Number(f.id),
      empresa_key: f.empresa_key,
      empresa: mapEmpresaName(f.empresa_key),
      switch_factura_id: Number(f.switch_factura_id),
      secuencial: String(f.secuencial),
      fecha_factura: String(f.fecha_factura ?? "").slice(0, 10),
      cliente_codigo: String(f.cliente_codigo),
      cliente_nombre: String(f.cliente_nombre),
      destino: String(f.destino),
      cajas: Number(f.cajas),
      creado_en: String(f.creado_en),
      guia_numero: f.guia_item_id ? (numeroPorRenglon.get(f.guia_item_id) ?? null) : null,
    }))
    // Lo más reciente arriba: la lista abre por lo que todavía no salió.
    .sort((a, b) => (a.creado_en < b.creado_en ? 1 : a.creado_en > b.creado_en ? -1 : b.id - a.id));
}

/**
 * Renglón → N° de guía VIVA, o nada. 🔴 Los DOS `deleted` se miran (el del
 * renglón y el de la guía): un renglón borrado NO ata, y una guía borrada
 * tampoco. La regla vive en `guiaQueSeLlevo`, el módulo puro.
 */
async function guiasDeLosRenglones(ids: readonly string[]): Promise<Map<string, number>> {
  const salida = new Map<string, number>();
  if (ids.length === 0) return salida;

  const unicos = [...new Set(ids)];
  const { data: renglones, error: rErr } = await supabaseServer
    .from("guia_items")
    .select("id, guia_id, deleted")
    .in("id", unicos);
  if (rErr || !renglones) return salida;

  const guiaIds = [
    ...new Set(
      (renglones as Array<{ guia_id: string | null }>)
        .map((r) => r.guia_id)
        .filter((v): v is string => typeof v === "string"),
    ),
  ];
  const porGuia = new Map<string, { numero: number | null; deleted: boolean | null }>();
  if (guiaIds.length > 0) {
    const { data: guias } = await supabaseServer
      .from("guia_transporte")
      .select("id, numero, deleted")
      .in("id", guiaIds);
    for (const g of (guias ?? []) as Array<{ id: string; numero: number | null; deleted: boolean | null }>) {
      porGuia.set(g.id, { numero: g.numero, deleted: g.deleted });
    }
  }

  for (const r of renglones as Array<{ id: string; guia_id: string | null; deleted: boolean | null }>) {
    const numero = guiaQueSeLlevo({
      deleted: r.deleted,
      guia: r.guia_id ? (porGuia.get(r.guia_id) ?? null) : null,
    });
    if (numero !== null) salida.set(r.id, numero);
  }
  return salida;
}

/** Una etiqueta sola, ya con su estado derivado. `null` = no existe o está borrada. */
export async function leerEtiqueta(id: number): Promise<EtiquetaFila | null> {
  const { data, error } = await supabaseServer
    .from(TABLA_ETIQUETAS)
    .select(COLUMNAS)
    .eq("id", id)
    .eq("deleted", false)
    .maybeSingle();
  if (error) throw errorDeTabla(error.code, error.message);
  if (!data) return null;
  const f = data as unknown as FilaCruda;
  const numeros = await guiasDeLosRenglones(f.guia_item_id ? [f.guia_item_id] : []);
  return {
    id: Number(f.id),
    empresa_key: f.empresa_key,
    empresa: mapEmpresaName(f.empresa_key),
    switch_factura_id: Number(f.switch_factura_id),
    secuencial: String(f.secuencial),
    fecha_factura: String(f.fecha_factura ?? "").slice(0, 10),
    cliente_codigo: String(f.cliente_codigo),
    cliente_nombre: String(f.cliente_nombre),
    destino: String(f.destino),
    cajas: Number(f.cajas),
    creado_en: String(f.creado_en),
    guia_numero: f.guia_item_id ? (numeros.get(f.guia_item_id) ?? null) : null,
  };
}

export type ResultadoAlta =
  | { ok: true; etiqueta: EtiquetaFila }
  // El 409 devuelve la etiqueta que YA existe cuando se la puede leer, para que
  // la pantalla ofrezca «Reimprimir» y «Corregir bultos» en vez de un error seco.
  | { ok: false; status: 409; error: string; yaEtiquetada?: EtiquetaFila }
  | { ok: false; status: 500 | 503; error: string };

/**
 * 🔴 EL ANTI-DUPLICADO LO DECIDE EL SERVIDOR (409), no el botón. Se pregunta
 * primero —para poder DEVOLVER la etiqueta que ya existe y que la pantalla
 * ofrezca «Reimprimir» y «Corregir bultos»— y el índice único parcial de la
 * base atrapa la carrera de dos toques al mismo tiempo (23505 → el mismo 409).
 */
export async function crearEtiqueta(
  datos: EtiquetaNueva,
  creadoPor: string,
): Promise<ResultadoAlta> {
  let yaEsta: EtiquetaFila | null = null;
  try {
    yaEsta = await buscarViva(datos.empresa_key, datos.switch_factura_id);
  } catch (e) {
    if ((e as ErrorConTabla).tablaAusente) {
      return { ok: false, status: 503, error: AVISO_MIGRACION };
    }
    return { ok: false, status: 500, error: errorGuardar() };
  }
  if (yaEsta) {
    return {
      ok: false,
      status: 409,
      error: `Esa factura ya está etiquetada (${yaEsta.cajas} ${yaEsta.cajas === 1 ? "caja" : "cajas"})`,
      yaEtiquetada: yaEsta,
    };
  }

  const { data, error } = await supabaseServer
    .from(TABLA_ETIQUETAS)
    .insert({ ...datos, creado_por: creadoPor })
    .select(COLUMNAS)
    .single();

  if (error) {
    if (error.code === "23505") {
      const otra = await buscarViva(datos.empresa_key, datos.switch_factura_id).catch(() => null);
      if (otra) {
        return {
          ok: false,
          status: 409,
          error: "Esa factura ya está etiquetada",
          yaEtiquetada: otra,
        };
      }
      return { ok: false, status: 409, error: "Esa factura ya está etiquetada" };
    }
    if (esTablaAusente(error.code, error.message)) {
      return { ok: false, status: 503, error: AVISO_MIGRACION };
    }
    return { ok: false, status: 500, error: errorGuardar() };
  }

  const f = data as unknown as FilaCruda;
  return {
    ok: true,
    etiqueta: {
      id: Number(f.id),
      empresa_key: f.empresa_key,
      empresa: mapEmpresaName(f.empresa_key),
      switch_factura_id: Number(f.switch_factura_id),
      secuencial: String(f.secuencial),
      fecha_factura: String(f.fecha_factura ?? "").slice(0, 10),
      cliente_codigo: String(f.cliente_codigo),
      cliente_nombre: String(f.cliente_nombre),
      destino: String(f.destino),
      cajas: Number(f.cajas),
      creado_en: String(f.creado_en),
      // Nace pendiente: todavía no hay renglón que se la haya llevado.
      guia_numero: null,
    },
  };
}

async function buscarViva(empresaKey: string, switchFacturaId: number): Promise<EtiquetaFila | null> {
  const { data, error } = await supabaseServer
    .from(TABLA_ETIQUETAS)
    .select("id")
    .eq("empresa_key", empresaKey)
    .eq("switch_factura_id", switchFacturaId)
    .eq("deleted", false)
    .limit(1);
  if (error) throw errorDeTabla(error.code, error.message);
  const fila = (data ?? [])[0] as { id: number } | undefined;
  if (!fila) return null;
  return leerEtiqueta(Number(fila.id));
}

export type ResultadoCambio =
  | { ok: true; etiqueta: EtiquetaFila }
  | { ok: false; status: 404 | 409 | 500 | 503; error: string };

/**
 * 🔴 CORREGIR BULTOS SOLO MIENTRAS ESTÁ PENDIENTE. Importada = 409, y lo dice
 * el SERVIDOR: la pantalla apaga el botón por la MISMA regla (`puedeCorregirse`),
 * pero no es la pantalla la que manda.
 */
export async function corregirCajas(id: number, cajas: number): Promise<ResultadoCambio> {
  let actual: EtiquetaFila | null;
  try {
    actual = await leerEtiqueta(id);
  } catch (e) {
    if ((e as ErrorConTabla).tablaAusente) return { ok: false, status: 503, error: AVISO_MIGRACION };
    return { ok: false, status: 500, error: errorGuardar() };
  }
  if (!actual) return { ok: false, status: 404, error: "Esa etiqueta ya no está" };
  if (actual.guia_numero !== null) {
    return {
      ok: false,
      status: 409,
      error: `Ya salió en ${rotuloGuia(actual.guia_numero)}: los bultos no se corrigen`,
    };
  }

  const { error } = await supabaseServer
    .from(TABLA_ETIQUETAS)
    .update({ cajas })
    .eq("id", id)
    .eq("deleted", false);
  if (error) return { ok: false, status: 500, error: errorGuardar() };
  return { ok: true, etiqueta: { ...actual, cajas } };
}

/**
 * 🔴 BORRAR ES SOFT DELETE FIRMADO, y solo mientras está pendiente. Nunca un
 * DELETE: la fila se queda con quién la borró y cuándo, y por el índice parcial
 * esa misma factura se puede volver a etiquetar.
 */
export async function borrarEtiqueta(id: number, borradoPor: string): Promise<ResultadoCambio> {
  let actual: EtiquetaFila | null;
  try {
    actual = await leerEtiqueta(id);
  } catch (e) {
    if ((e as ErrorConTabla).tablaAusente) return { ok: false, status: 503, error: AVISO_MIGRACION };
    return { ok: false, status: 500, error: errorGuardar() };
  }
  if (!actual) return { ok: false, status: 404, error: "Esa etiqueta ya no está" };
  if (actual.guia_numero !== null) {
    return {
      ok: false,
      status: 409,
      error: `Ya salió en ${rotuloGuia(actual.guia_numero)}: no se puede borrar`,
    };
  }

  const { data, error } = await supabaseServer
    .from(TABLA_ETIQUETAS)
    .update({ deleted: true, borrado_por: borradoPor, borrado_en: new Date().toISOString() })
    .eq("id", id)
    .eq("deleted", false)
    .select("id");
  if (error) return { ok: false, status: 500, error: "No se pudo borrar. Intenta de nuevo en unos segundos." };
  if (!data || data.length === 0) return { ok: false, status: 404, error: "Esa etiqueta ya no está" };
  return { ok: true, etiqueta: actual };
}

export type ResultadoImportar =
  | { ok: true; atadas: number }
  | { ok: false; status: 400 | 404 | 500 | 503; error: string };

/**
 * 🔴 ATAR LAS ETIQUETAS A LOS RENGLONES DE LA GUÍA RECIÉN CREADA.
 *
 * Se llama DESPUÉS de que `/api/guias` creó la guía, y por eso la guía se sigue
 * creando exactamente igual que hoy: este paso escribe solo del lado de
 * `guias_etiquetas`. El renglón se busca por (`cliente_codigo`, `empresa`) —el
 * mismo par por el que se agruparon— con igualdad normalizada, jamás por
 * parecido. Una etiqueta que ya salió en otra guía se salta en silencio: no se
 * mueve de guía sola.
 */
export async function importarEtiquetas(
  guiaId: string,
  ids: readonly number[],
): Promise<ResultadoImportar> {
  if (ids.length === 0) return { ok: true, atadas: 0 };

  const { data: renglones, error: rErr } = await supabaseServer
    .from("guia_items")
    .select("id, cliente_codigo, empresa")
    .eq("guia_id", guiaId)
    .eq("deleted", false);
  if (rErr) return { ok: false, status: 500, error: "No se pudo enlazar con la guía" };
  if (!renglones || renglones.length === 0) {
    return { ok: false, status: 404, error: "Esa guía no tiene renglones" };
  }

  const porPar = new Map<string, string>();
  for (const r of renglones as Array<{ id: string; cliente_codigo: string | null; empresa: string | null }>) {
    porPar.set(parDeRenglon(r.cliente_codigo, r.empresa), r.id);
  }

  let etiquetas: EtiquetaFila[];
  try {
    etiquetas = await leerEtiquetas();
  } catch (e) {
    if ((e as ErrorConTabla).tablaAusente) return { ok: false, status: 503, error: AVISO_MIGRACION };
    return { ok: false, status: 500, error: "No se pudo enlazar con la guía" };
  }

  const pedidas = new Set(ids.map((n) => Number(n)));
  let atadas = 0;
  for (const e of etiquetas) {
    if (!pedidas.has(e.id)) continue;
    // Ya salió en una guía: no se mueve de guía sola.
    if (e.guia_numero !== null) continue;
    const renglonId = porPar.get(parDeRenglon(e.cliente_codigo, e.empresa));
    if (!renglonId) continue;
    const { error } = await supabaseServer
      .from(TABLA_ETIQUETAS)
      .update({ guia_item_id: renglonId })
      .eq("id", e.id)
      .eq("deleted", false)
      .is("guia_item_id", null);
    if (!error) atadas++;
  }
  return { ok: true, atadas };
}

/** (cliente, empresa) normalizado: bordes y mayúsculas. Exacto, nunca por parecido. */
function parDeRenglon(codigo: string | null | undefined, empresa: string | null | undefined): string {
  return `${String(codigo ?? "").trim().toUpperCase()}|${String(empresa ?? "").trim().toLowerCase()}`;
}

function errorGuardar(): string {
  return "No se pudo guardar. Intenta de nuevo en unos segundos.";
}
