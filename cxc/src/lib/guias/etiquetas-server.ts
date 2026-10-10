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
import { yaSalioEn } from "@/lib/guias/atajos-facturas";
import { leerIndiceYaSalio } from "@/lib/guias/ya-salio-server";
import { ETIQUETAS_2026_10 } from "@/lib/guias/guias-2026-10";
import {
  guiaQueSeLlevo,
  rotuloGuia,
  type EtiquetaFila,
  type EtiquetaNueva,
} from "@/lib/guias/etiquetas";
import {
  ETIQUETAS_POR_ENVIO,
  envioDe,
  renglonDelEnvio,
  type EnvioNuevo,
  type RenglonParaAtar,
} from "@/lib/guias/etiquetas-por-envio";

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
  /** NULL = traslado sin empresa (migración 20261227120000). */
  empresa_key: string | null;
  switch_factura_id: number | null;
  secuencial: string;
  fecha_factura: string;
  cliente_codigo: string;
  cliente_nombre: string;
  destino: string;
  cajas: number;
  creado_en: string;
  guia_item_id: string | null;
  // 🔴 1-oct-2026 (migración `20261224120000`). Sin ella no llegan.
  envio_id?: string | null;
  orden_en_envio?: number | null;
  nota?: string | null;
}

const COLUMNAS =
  "id, empresa_key, switch_factura_id, secuencial, fecha_factura, cliente_codigo, " +
  "cliente_nombre, destino, cajas, creado_en, guia_item_id";

/** Lo que hace falta para saber qué renglón lleva cuántos bultos etiquetados. */
const COLUMNAS_ATADAS = "id, guia_item_id, cajas";

/** Las de siempre MÁS las del envío (1-oct-2026). */
const COLUMNAS_ENVIO = COLUMNAS + ", envio_id, orden_en_envio, nota";

export const AVISO_MIGRACION_TRASLADO =
  "Falta correr la migración de traslados sin factura (20261226120000 y 20261227120000)";

/** Una fila cruda, ya con su estado derivado. `envio_id ?? id`: falla ABIERTA. */
function aEtiqueta(f: FilaCruda, guiaNumero: number | null): EtiquetaFila {
  return {
    id: Number(f.id),
    // Traslado sin empresa (2-oct-2026): `""` en vez de NULL, para que nada aguas abajo cambie de tipo.
    empresa_key: f.empresa_key ?? "",
    empresa: f.empresa_key ? mapEmpresaName(f.empresa_key) : "",
    // `null` = traslado sin factura (2-oct-2026): nunca se vuelve 0.
    switch_factura_id: f.switch_factura_id == null ? null : Number(f.switch_factura_id),
    secuencial: String(f.secuencial),
    fecha_factura: String(f.fecha_factura ?? "").slice(0, 10),
    cliente_codigo: String(f.cliente_codigo),
    cliente_nombre: String(f.cliente_nombre),
    destino: String(f.destino),
    cajas: Number(f.cajas),
    creado_en: String(f.creado_en),
    guia_numero: guiaNumero,
    envio_id: f.envio_id ? String(f.envio_id) : String(f.id),
    orden_en_envio: Number(f.orden_en_envio ?? 1) || 1,
    nota: f.nota ? String(f.nota) : null,
  };
}

/**
 * 🔴 EL ESTADO SE DERIVA EN TRES LECTURAS, NUNCA DE UNA COLUMNA: etiquetas →
 * los renglones a los que apuntan → las guías de esos renglones. Se hace con
 * consultas sueltas y no con `embed` de PostgREST a propósito: el embed
 * anidado depende de que las claves foráneas estén como PostgREST espera, y si
 * un día no lo están el estado se apagaría EN SILENCIO (todas «Pendiente»).
 */
export async function leerEtiquetas(): Promise<EtiquetaFila[]> {
  const leer = (columnas: string) =>
    leerTodoPaginado<FilaCruda>(
      `${TABLA_ETIQUETAS} (lista)`,
      (pedirCount, desde, hasta) =>
        supabaseServer
          .from(TABLA_ETIQUETAS)
          .select(columnas, pedirCount ? { count: "exact" } : {})
          .eq("deleted", false)
          .order("id", { ascending: true })
          .range(desde, hasta),
    );
  const filas = await leer(COLUMNAS_ENVIO)
    .catch((e: unknown) => {
      const err = e as { code?: string; message?: string };
      throw errorDeTabla(err?.code, err?.message ?? String(e));
    });

  const numeroPorRenglon = await guiasDeLosRenglones(
    filas.map((f) => f.guia_item_id).filter((v): v is string => typeof v === "string"),
  );

  return filas
    .map((f) => aEtiqueta(f, f.guia_item_id ? (numeroPorRenglon.get(f.guia_item_id) ?? null) : null))
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
  const leer = (columnas: string) => supabaseServer
    .from(TABLA_ETIQUETAS)
    .select(columnas)
    .eq("id", id)
    .eq("deleted", false)
    .maybeSingle();
  const { data, error } = await leer(COLUMNAS_ENVIO);
  if (error) throw errorDeTabla(error.code, error.message);
  if (!data) return null;
  const f = data as unknown as FilaCruda;
  const numeros = await guiasDeLosRenglones(f.guia_item_id ? [f.guia_item_id] : []);
  return aEtiqueta(f, f.guia_item_id ? (numeros.get(f.guia_item_id) ?? null) : null);
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
      error: `Esa factura ya está etiquetada (${yaEsta.cajas} ${yaEsta.cajas === 1 ? "bulto" : "bultos"})`,
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

  // Nace pendiente: todavía no hay renglón que se la haya llevado.
  return { ok: true, etiqueta: aEtiqueta(data as unknown as FilaCruda, null) };
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
export async function corregirCajas(
  id: number,
  cajas: number,
  porEnvio: boolean = ETIQUETAS_POR_ENVIO,
): Promise<ResultadoCambio> {
  // 🔴 LO IMPRESO NO SE CAMBIA (1-oct-2026). Daniel: el envío se imprime al
  // final y queda CERRADO; si hay un error se anula el envío entero y se hace
  // de nuevo. Corregir los bultos de una factura dejaría todo el papel del envío
  // diciendo un «de N» que ya no es — así que el servidor ni lo intenta.
  if (porEnvio) {
    return {
      ok: false,
      status: 409,
      error: "Lo impreso no se cambia: anula el envío y hazlo de nuevo",
    };
  }
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
export async function borrarEtiqueta(
  id: number,
  borradoPor: string,
  porEnvio: boolean = ETIQUETAS_POR_ENVIO,
): Promise<ResultadoCambio> {
  let actual: EtiquetaFila | null;
  try {
    actual = await leerEtiqueta(id);
  } catch (e) {
    if ((e as ErrorConTabla).tablaAusente) return { ok: false, status: 503, error: AVISO_MIGRACION };
    return { ok: false, status: 500, error: errorGuardar() };
  }
  if (!actual) return { ok: false, status: 404, error: "Esa etiqueta ya no está" };
  // 🔴 1-oct-2026: borrar UNA factura de un envío dejaría el resto del papel con
  // un «de N» que ya no es. Con envíos, borrar es ANULAR EL ENVÍO ENTERO.
  if (porEnvio) {
    const r = await anularEnvio(envioDe(actual), borradoPor);
    return r.ok ? { ok: true, etiqueta: actual } : r;
  }
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
 * `guias_etiquetas`. 🔴 Desde el 1-oct-2026 se ata POR ENVÍO: cada envío va al
 * renglón que lleva sus facturas (`renglonDelEnvio`), con igualdad exacta,
 * jamás por parecido. Una etiqueta que ya salió en otra guía se salta en silencio: no se
 * mueve de guía sola.
 */
export async function importarEtiquetas(
  guiaId: string,
  ids: readonly number[],
): Promise<ResultadoImportar> {
  if (ids.length === 0) return { ok: true, atadas: 0 };

  const { data: renglones, error: rErr } = await supabaseServer
    .from("guia_items")
    .select("id, cliente_codigo, empresa, direccion, facturas")
    .eq("guia_id", guiaId)
    .eq("deleted", false);
  if (rErr) return { ok: false, status: 500, error: "No se pudo enlazar con la guía" };
  if (!renglones || renglones.length === 0) {
    return { ok: false, status: 404, error: "Esa guía no tiene renglones" };
  }
  const nuevos = renglones as RenglonParaAtar[];

  let etiquetas: EtiquetaFila[];
  try {
    etiquetas = await leerEtiquetas();
  } catch (e) {
    if ((e as ErrorConTabla).tablaAusente) return { ok: false, status: 503, error: AVISO_MIGRACION };
    return { ok: false, status: 500, error: "No se pudo enlazar con la guía" };
  }

  // 🔴 1-oct-2026: SE ATA POR ENVÍO. Las pedidas, pendientes, juntas por su
  // envío; cada envío va al renglón que lleva SUS facturas (`renglonDelEnvio`).
  // 🩸 Antes cada etiqueta buscaba «el renglón de su cliente + empresa +
  // destino», y dos envíos iguales en dos renglones terminaban los dos en el
  // primero. Una etiqueta que ya salió en una guía no se mueve de guía sola.
  const pedidas = new Set(ids.map((n) => Number(n)));
  const porEnvio = new Map<string, EtiquetaFila[]>();
  for (const e of etiquetas) {
    if (!pedidas.has(e.id) || e.guia_numero !== null) continue;
    porEnvio.set(envioDe(e), [...(porEnvio.get(envioDe(e)) ?? []), e]);
  }
  const usados = new Set<string>();
  let atadas = 0;
  for (const filas of porEnvio.values()) {
    const primera = filas[0];
    const renglon = renglonDelEnvio(
      {
        cliente_codigo: primera.cliente_codigo,
        empresa: primera.empresa,
        direccion: primera.destino,
        secuenciales: filas.map((f) => f.secuencial),
      },
      nuevos,
      usados,
    );
    if (!renglon) continue;
    usados.add(renglon.id);
    for (const e of filas) {
      const { error } = await supabaseServer
        .from(TABLA_ETIQUETAS)
        .update({ guia_item_id: renglon.id })
        .eq("id", e.id)
        .eq("deleted", false)
        .is("guia_item_id", null);
      if (!error) atadas++;
    }
  }
  return { ok: true, atadas };
}


function errorGuardar(): string {
  return "No se pudo guardar. Intenta de nuevo en unos segundos.";
}

// ─── EL ENVÍO (1-oct-2026) ───────────────────────────────────────────────────

export type ResultadoEnvio =
  | { ok: true; etiquetas: EtiquetaFila[] }
  | { ok: false; status: 409; error: string; yaEtiquetadas: EtiquetaFila[] }
  | { ok: false; status: 500 | 503; error: string };

function textoYaEtiquetadas(ya: readonly EtiquetaFila[]): string {
  const nums = ya.map((e) => e.secuencial).join(", ");
  return ya.length === 1
    ? `La factura ${nums} ya está etiquetada: no se guardó nada`
    : `Las facturas ${nums} ya están etiquetadas: no se guardó nada`;
}

/**
 * 🔴 UN ENVÍO, UN SOLO INSERT: todas sus facturas entran en UNA sentencia, así
 * que entran todas o ninguna. Antes se pregunta cuáles ya tienen etiqueta viva
 * para contestar un 409 que DIGA cuáles; el índice único parcial atrapa la
 * carrera de dos toques (23505 → el mismo 409).
 *
 * ⚠️ Sin la migración `20261224120000` no hay dónde anotar el envío: un envío
 * de varias facturas o con nota contesta 503 y lo dice. Uno de UNA factura sin
 * nota se guarda como siempre (falla ABIERTA).
 */
export async function crearEnvio(
  envio: EnvioNuevo,
  creadoPor: string,
  sinLasYaDespachadas: boolean = ETIQUETAS_2026_10,
): Promise<ResultadoEnvio> {
  // 🔴 1-oct-2026: UNA FACTURA QUE YA SALIÓ EN UNA GUÍA NO SE ETIQUETA, y lo
  // decide el SERVIDOR (409), no solo la lista. 🩸 Se etiquetaron la 3097 y la
  // 3096, que ya iban en una guía hecha a mano. La regla es la MISMA del chip
  // «Ya salió en GT-xxx» (`yaSalioEn` sobre `leerIndiceYaSalio`). Falla
  // ABIERTA: si el índice no se puede leer, se etiqueta como antes.
  if (sinLasYaDespachadas) {
    let indice: Map<string, number> | null = null;
    try {
      indice = await leerIndiceYaSalio();
    } catch {
      indice = null;
    }
    if (indice) {
      const empresa = mapEmpresaName(envio.empresa_key);
      for (const f of envio.facturas) {
        if (f.switch_factura_id == null) continue; // traslado: no hay factura que haya salido
        const gt = yaSalioEn(indice, empresa, f.secuencial);
        if (gt !== null) {
          return {
            ok: false,
            status: 409,
            error: `La factura ${f.secuencial} ya salió en ${rotuloGuia(gt)}: no se guardó nada`,
            yaEtiquetadas: [],
          };
        }
      }
    }
  }
  let vivas: EtiquetaFila[];
  try {
    vivas = await leerEtiquetas();
  } catch (e) {
    if ((e as ErrorConTabla).tablaAusente) return { ok: false, status: 503, error: AVISO_MIGRACION };
    return { ok: false, status: 500, error: errorGuardar() };
  }
  // Un traslado (`null`) no choca con nada: cada uno es un envío propio.
  const pedidas = new Set(envio.facturas.map((f) => f.switch_factura_id).filter((v): v is number => v != null));
  const ya = vivas.filter((e) => e.empresa_key === envio.empresa_key && e.switch_factura_id != null && pedidas.has(e.switch_factura_id));
  if (ya.length > 0) return { ok: false, status: 409, error: textoYaEtiquetadas(ya), yaEtiquetadas: ya };

  const envioId = crypto.randomUUID();
  const base = {
    empresa_key: envio.empresa_key || null, // traslado sin empresa → NULL

    cliente_codigo: envio.cliente_codigo,
    cliente_nombre: envio.cliente_nombre,
    destino: envio.destino,
    creado_por: creadoPor,
  };
  const filas = envio.facturas.map((f, i) => ({
    ...base,
    switch_factura_id: f.switch_factura_id,
    secuencial: f.secuencial,
    fecha_factura: f.fecha_factura,
    cajas: f.cajas,
    envio_id: envioId,
    orden_en_envio: i + 1,
    nota: f.nota,
  }));

  const { data, error } = await supabaseServer.from(TABLA_ETIQUETAS).insert(filas).select(COLUMNAS_ENVIO);
  if (error) {
    // 🔴 Sin la migración `20261226120000` la columna sigue NOT NULL: el traslado
    // no se guarda y se DICE (falla abierta: lo demás funciona igual).
    if (error.code === "23502" && envio.facturas.some((f) => f.switch_factura_id == null)) {
      return { ok: false, status: 503, error: AVISO_MIGRACION_TRASLADO };
    }
    if (error.code === "23505") {
      const otras = (await leerEtiquetas().catch(() => [] as EtiquetaFila[])).filter(
        (e) => e.empresa_key === envio.empresa_key && e.switch_factura_id != null && pedidas.has(e.switch_factura_id),
      );
      return {
        ok: false,
        status: 409,
        error: otras.length > 0 ? textoYaEtiquetadas(otras) : "Una de esas facturas ya está etiquetada",
        yaEtiquetadas: otras,
      };
    }
    if (esTablaAusente(error.code, error.message)) return { ok: false, status: 503, error: AVISO_MIGRACION };
    return { ok: false, status: 500, error: errorGuardar() };
  }
  const creadas = ((data ?? []) as unknown as FilaCruda[]).map((f) => aEtiqueta(f, null));
  return { ok: true, etiquetas: creadas };
}

/**
 * 🔴 ANULAR UN ENVÍO: borrado FIRMADO de TODAS sus filas en UNA sentencia, y
 * solo si ninguna salió en una guía (409 que dice en cuál). Después, esas
 * facturas se pueden volver a etiquetar.
 */
export async function anularEnvio(envioId: string, borradoPor: string): Promise<ResultadoCambio> {
  let filas: EtiquetaFila[];
  try {
    filas = (await leerEtiquetas()).filter((e) => envioDe(e) === envioId);
  } catch (e) {
    if ((e as ErrorConTabla).tablaAusente) return { ok: false, status: 503, error: AVISO_MIGRACION };
    return { ok: false, status: 500, error: errorGuardar() };
  }
  if (filas.length === 0) return { ok: false, status: 404, error: "Ese envío ya no está" };
  const enGuia = filas.find((e) => e.guia_numero !== null);
  if (enGuia) {
    return {
      ok: false,
      status: 409,
      error: `Ya salió en ${rotuloGuia(enGuia.guia_numero as number)}: el envío no se anula`,
    };
  }
  const { data, error } = await supabaseServer
    .from(TABLA_ETIQUETAS)
    .update({ deleted: true, borrado_por: borradoPor, borrado_en: new Date().toISOString() })
    .in("id", filas.map((e) => e.id))
    .eq("deleted", false)
    .select("id");
  if (error) return { ok: false, status: 500, error: "No se pudo anular. Intenta de nuevo en unos segundos." };
  if (!data || data.length === 0) return { ok: false, status: 404, error: "Ese envío ya no está" };
  return { ok: true, etiqueta: filas[0] };
}

// ─── La guía: qué renglones son envíos etiquetados ───────────────────────────

/**
 * Renglón → total de bultos de las etiquetas VIVAS atadas a él. Es lo que dice
 * que un renglón es un envío etiquetado (bultos bloqueados) y cuántos bultos
 * lleva. 🔴 Falla ABIERTA: sin tabla o sin red devuelve vacío y la guía se
 * comporta como siempre (todo editable).
 */
export async function totalesPorRenglon(renglonIds: readonly string[]): Promise<Map<string, number>> {
  const salida = new Map<string, number>();
  const ids = [...new Set(renglonIds.filter((v) => typeof v === "string" && v))];
  if (ids.length === 0) return salida;
  try {
    const { data, error } = await supabaseServer
      .from(TABLA_ETIQUETAS)
      .select(COLUMNAS_ATADAS)
      .in("guia_item_id", ids)
      .eq("deleted", false);
    if (error || !Array.isArray(data)) return salida;
    for (const f of data as Array<{ guia_item_id: string | null; cajas: number | null }>) {
      if (!f.guia_item_id) continue;
      salida.set(f.guia_item_id, (salida.get(f.guia_item_id) ?? 0) + (Number(f.cajas) || 0));
    }
  } catch {
    /* falla abierta */
  }
  return salida;
}

/**
 * 🔴 Marca los renglones que son envíos etiquetados (`con_etiquetas`) para que
 * la pantalla los muestre con candado. Solo con el interruptor prendido.
 */
export async function marcarRenglonesConEtiquetas<T extends { id?: string | null }>(
  items: T[],
  porEnvio: boolean = ETIQUETAS_POR_ENVIO,
): Promise<Array<T & { con_etiquetas?: boolean }>> {
  if (!porEnvio || items.length === 0) return items;
  const totales = await totalesPorRenglon(items.map((i) => String(i.id ?? "")));
  return items.map((i) => (i.id && totales.has(i.id) ? { ...i, con_etiquetas: true } : i));
}

/**
 * 🔴 EL ARREGLO DEL PUT (1-oct-2026). Antes de borrar los renglones viejos de
 * una guía, sus etiquetas se mudan a los renglones NUEVOS (`renglonDelEnvio`, por envío):
 * así el `ON DELETE SET NULL` ya no las encuentra y no se desatan en silencio.
 * Con el interruptor prendido, devuelve además el total de etiquetas de cada
 * renglón nuevo: la ruta se lo pone como bultos (lo impreso manda).
 *
 * ⚠️ Falla ABIERTA: si la tabla no existe o la base no contesta, la guía se
 * guarda igual y las etiquetas vuelven a «Pendiente», como pasaba antes.
 */
export async function reatarEtiquetas(
  viejos: readonly RenglonParaAtar[],
  nuevos: readonly RenglonParaAtar[],
  porEnvio: boolean = ETIQUETAS_POR_ENVIO,
): Promise<{ reatadas: number; bultosPorRenglon: Map<string, number> }> {
  let reatadas = 0;
  // Los bultos que el PUT le pone a cada renglón nuevo que quedó con etiquetas.
  // ⚠️ Esta capa NO escribe `guia_items`: lo escribe la ruta de la guía.
  const bultosPorRenglon = new Map<string, number>();
  if (viejos.length === 0 || nuevos.length === 0) return { reatadas, bultosPorRenglon };
  try {
    // 🔴 1-oct-2026: con el envío y la factura de cada etiqueta, para atar POR
    // ENVÍO.
    const { data, error } = await supabaseServer
      .from(TABLA_ETIQUETAS)
      .select(COLUMNAS_ATADAS + ", secuencial, envio_id")
      .in("guia_item_id", viejos.map((v) => v.id))
      .eq("deleted", false);
    if (error || !Array.isArray(data) || data.length === 0) return { reatadas, bultosPorRenglon };
    const atadas = data as unknown as Array<{
      id: number;
      guia_item_id: string;
      cajas: number;
      secuencial?: string | null;
      envio_id?: string | null;
    }>;

    // Renglón nuevo → las etiquetas que le tocan. Cada ENVÍO de cada renglón
    // viejo busca el renglón nuevo que lleva SUS facturas (`renglonDelEnvio`).
    const destino = new Map<string, { ids: number[]; total: number }>();
    const usados = new Set<string>();
    for (const v of viejos) {
      const suyas = atadas.filter((a) => a.guia_item_id === v.id);
      const porEnvio = new Map<string, typeof suyas>();
      for (const a of suyas) {
        const k = a.envio_id ? String(a.envio_id) : String(a.id);
        porEnvio.set(k, [...(porEnvio.get(k) ?? []), a]);
      }
      for (const delEnvio of porEnvio.values()) {
        const nuevo = renglonDelEnvio(
          { ...v, secuenciales: delEnvio.map((a) => String(a.secuencial ?? "")) },
          nuevos,
          usados,
        );
        if (!nuevo) continue; // el renglón se quitó de la guía: vuelve a «Pendiente»
        usados.add(nuevo.id);
        const previo = destino.get(nuevo.id) ?? { ids: [], total: 0 };
        destino.set(nuevo.id, {
          ids: [...previo.ids, ...delEnvio.map((a) => Number(a.id))],
          total: previo.total + delEnvio.reduce((s, a) => s + (Number(a.cajas) || 0), 0),
        });
      }
    }
    for (const [renglonId, { ids, total }] of destino) {
      const { error: e1 } = await supabaseServer
        .from(TABLA_ETIQUETAS)
        .update({ guia_item_id: renglonId })
        .in("id", ids)
        .eq("deleted", false);
      if (e1) continue;
      reatadas += ids.length;
      if (porEnvio) bultosPorRenglon.set(renglonId, total);
    }
  } catch {
    /* falla abierta: la guía se guarda igual */
  }
  return { reatadas, bultosPorRenglon };
}
