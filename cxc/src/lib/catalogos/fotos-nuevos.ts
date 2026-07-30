// ─────────────────────────────────────────────────────────────────────────────
// Aviso "entraron productos NUEVOS sin foto" — ejecución (el criterio puro está
// en `fotos-faltantes.ts` → `planAvisoNuevos`, con la justificación completa).
//
// 🩸 POR QUÉ EXISTE ESTO (medido contra producción, 28/29-jul-2026). Daniel:
//    "meti productos nuevos al sistema, y no me llega, almenos no instantaneo,
//     q hay productos nuevos para subir fotos".
//
// El aviso YA EXISTÍA, pero estaba atado al EVENTO de una corrida del cron: el
// motor de sync empujaba el código a `nuevosSinFoto` en el mismo `if` que hacía
// el INSERT, y solo los 3 routes de cron leían ese resultado para mandar el
// Telegram. Los 60 productos de Reebok que Daniel metió entraron en la corrida
// `2026-07-28T17:23:23 by=manual` — el botón "Actualizar ahora" —, y
// `/api/admin/sync-now` NUNCA mandaba ese mensaje. Las 6 corridas del cron de
// esos días (12:10 y 17:00 UTC) registraron `records_inserted = 0`: para cuando
// llegó el cron las filas YA existían, así que cayeron por la rama "producto
// conocido" y el aviso se volvió imposible de recuperar. O sea: el único camino
// por el que entraron los productos era justo el que no avisaba, y el aviso se
// perdía para siempre, no se atrasaba.
//
// EL ARREGLO ES CAMBIAR LA PREGUNTA: en vez de "¿esta corrida insertó algo?"
// (evento, se pierde), se pregunta "¿hay productos sin foto más nuevos que la
// última vez que avisé?" (estado, no se pierde). Así:
//   · da igual el camino de entrada — cron, "Actualizar ahora", reconciliación
//     o backfill: el aviso sale igual;
//   · NO repite — lo ya avisado queda debajo de la marca de agua, así que los
//     61 de siempre no vuelven a sonar todos los días (los cubre el resumen
//     semanal de los lunes);
//   · se recupera solo — si Telegram falla, la marca de agua NO avanza y el
//     aviso se reintenta en la corrida siguiente.
//
// MARCA DE AGUA: una fila de `cron_heartbeats` por marca
// (`catalogos-fotos-nuevos:<marca>`). No hace falta DDL — es la misma tabla que
// ya guarda "cuándo fue la última vez que esto salió bien", que es exactamente
// el dato. Los nombres están en `HEARTBEATS_NO_CRON` (cron-telemetry) para que
// ni el watchdog de Telegram ni health-crons los vigilen como si fueran crons:
// nadie los programa, así que estar "stale" es su estado normal.
//
// CANAL: 📊 NEGOCIO (`enviarNegocio`). Es información de la empresa —"hay
// trabajo de fotos por hacer"—, no una falla del sistema, y por diseño ese canal
// no lleva perilla de silenciar.
//
// Best-effort de punta a punta: NADA de acá puede tumbar un sync de catálogo.
// ─────────────────────────────────────────────────────────────────────────────

import { MARCAS_CONFIG, type MarcaKey } from "@/lib/catalogo/marcas";
import { supabaseServer } from "@/lib/supabase-server";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import { enviarNegocio } from "@/lib/alertas/canal";
import {
  buildNuevosSinFotoMsg,
  planAvisoNuevos,
  type FilaSinFoto,
} from "@/lib/catalogos/fotos-faltantes";

/** Nombre de la fila de `cron_heartbeats` que guarda la marca de agua. */
export function watermarkNuevosSinFoto(marca: MarcaKey): string {
  return `catalogos-fotos-nuevos:${marca}`;
}

/** Las 3 marcas, para que `HEARTBEATS_NO_CRON` no tenga que repetir strings. */
export const WATERMARKS_NUEVOS_SIN_FOTO: readonly string[] = (
  ["reebok", "joybees", "tommy"] as const
).map(watermarkNuevosSinFoto);

/** Etiqueta corta de la marca en el mensaje (igual que el resumen semanal). */
function labelDe(marca: MarcaKey): string {
  const l = MARCAS_CONFIG[marca].label;
  return l === "Tommy Hilfiger" ? "Tommy" : l;
}

export interface AvisoNuevosResult {
  /** Códigos anunciados en esta pasada (vacío = no se mandó nada). */
  codigos: string[];
  /** true = primera vez para esta marca: se plantó la marca de agua sin avisar. */
  sembrado: boolean;
  /** Por qué no se hizo nada (null = pasada normal). */
  omitido: string | null;
  /** Marca de agua que había ANTES de esta pasada (null = no existía). */
  watermarkAnterior?: string | null;
  /** El mensaje que se mandó (o el que se mandaría en dry-run). */
  mensaje?: string | null;
}

const VACIO = (omitido: string | null): AvisoNuevosResult => ({ codigos: [], sembrado: false, omitido });

async function leerWatermark(nombre: string): Promise<{ iso: string | null; ok: boolean }> {
  const { data, error } = await supabaseServer
    .from("cron_heartbeats")
    .select("last_success_at")
    .eq("cron_name", nombre)
    .maybeSingle();
  if (error) return { iso: null, ok: false };
  return { iso: (data?.last_success_at as string | null) ?? null, ok: true };
}

async function guardarWatermark(nombre: string, iso: string): Promise<void> {
  const { error } = await supabaseServer
    .from("cron_heartbeats")
    .upsert({ cron_name: nombre, last_success_at: iso }, { onConflict: "cron_name" });
  if (error) console.error(`[fotos-nuevos] no se pudo guardar la marca de agua ${nombre}: ${error.message}`);
}

/**
 * Avisa por Telegram (canal NEGOCIO) de los productos que ENTRARON nuevos sin
 * foto desde la última vez, y NADA si no entró ninguno.
 *
 * Se llama al final de CUALQUIER camino que sincronice el catálogo de la marca.
 * Nunca lanza: un fallo acá no puede tumbar el sync que ya terminó bien.
 *
 * `dryRun` recorre EXACTAMENTE el mismo camino de lectura y devuelve el mensaje
 * que saldría, sin mandar nada a Telegram ni mover la marca de agua — así se
 * puede revisar contra producción sin spamear el chat
 * (`npx tsx scripts/_dryrun-fotos-nuevos.ts`). Es el mismo código, no una
 * segunda implementación que pueda mentir.
 */
export async function avisarNuevosSinFoto(
  marca: MarcaKey,
  opts: { dryRun?: boolean } = {},
): Promise<AvisoNuevosResult> {
  const dryRun = !!opts.dryRun;
  try {
    const cfg = MARCAS_CONFIG[marca];
    const nombre = watermarkNuevosSinFoto(marca);

    // Marca de agua ILEGIBLE ≠ "nunca se avisó": si el select falla y lo
    // tratáramos como null, sembraríamos de nuevo y perderíamos el aviso en
    // silencio. Ante la duda no se hace nada y la corrida siguiente reintenta.
    const wm = await leerWatermark(nombre);
    if (!wm.ok) return VACIO("no se pudo leer la marca de agua");

    const db = await cfg.products.writeDb();
    // PAGINADO OBLIGATORIO: `db-max-rows` = 1000 y PostgREST corta EN SILENCIO.
    // Hoy tommy_products tiene 490 filas y no llega al tope, pero un aviso que
    // se vuelve ciego a partir del producto 1.001 —sin error, sin señal— es
    // exactamente el bug que este proyecto ya pagó en el sync de recibos.
    // Orden por `sku`: es único en las 3 tablas (es la llave con la que el motor
    // matchea) y acá el orden de presentación no importa — los códigos se
    // ordenan A-Z después, en `planAvisoNuevos`.
    //
    // `oculto_manual` puede no existir todavía (DDL pendiente): mismo fallback
    // pre-migración que usa el motor de sync.
    const COLS = "sku, image_url, active, created_at";
    const leer = (cols: string) =>
      leerTodoPaginado<FilaSinFoto>(`${cfg.productsTable} (aviso fotos nuevas)`, (pedirCount, desde, hasta) =>
        db
          .from(cfg.productsTable)
          .select(cols, pedirCount ? { count: "exact" } : {})
          .order("sku", { ascending: true })
          .range(desde, hasta),
      );
    let filas: FilaSinFoto[];
    try {
      filas = await leer(`${COLS}, oculto_manual`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes("oculto_manual")) return VACIO(`leer ${cfg.productsTable}: ${msg}`);
      try {
        filas = await leer(COLS);
      } catch (err2) {
        return VACIO(`leer ${cfg.productsTable}: ${err2 instanceof Error ? err2.message : String(err2)}`);
      }
    }
    // Guard: tabla vacía = query rara o marca sin activar. No se siembra ni se
    // avisa con cero filas — sembrar con la tabla vacía escondería el atraso
    // real la próxima vez.
    if (filas.length === 0) return VACIO("la tabla no devolvió filas");

    const plan = planAvisoNuevos(filas, wm.iso, new Date().toISOString());
    const base = { watermarkAnterior: wm.iso, mensaje: null as string | null };

    if (plan.sembrar) {
      if (!dryRun) await guardarWatermark(nombre, plan.watermark);
      return { ...base, codigos: [], sembrado: true, omitido: null };
    }
    if (plan.codigos.length === 0) {
      if (!dryRun) await guardarWatermark(nombre, plan.watermark);
      return { ...base, codigos: [], sembrado: false, omitido: null };
    }

    const msg = buildNuevosSinFotoMsg(labelDe(marca), plan.codigos);
    if (dryRun) return { ...base, codigos: plan.codigos, sembrado: false, omitido: null, mensaje: msg };

    const enviado = msg ? await enviarNegocio(msg) : false;
    // La marca de agua avanza SOLO si el mensaje salió: si Telegram falla, el
    // aviso se reintenta en la corrida siguiente en vez de perderse.
    if (!enviado) return { ...VACIO("Telegram no aceptó el mensaje"), watermarkAnterior: wm.iso };

    await guardarWatermark(nombre, plan.watermark);
    return { ...base, codigos: plan.codigos, sembrado: false, omitido: null, mensaje: msg };
  } catch (err) {
    return VACIO(err instanceof Error ? err.message : String(err));
  }
}
