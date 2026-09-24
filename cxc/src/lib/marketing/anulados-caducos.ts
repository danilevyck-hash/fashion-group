// ============================================================================
// Marketing — LOS ANULADOS SE BORRAN DE VERDAD A LOS 90 DÍAS (23-sep-2026).
// Lado servidor del cron `cleanup-marketing-anulados`.
//
// Daniel: *«se elimina y listo… con seguro de que escriban ELIMINAR»*. Al
// anular, el gasto ya desapareció de todas las pantallas; la fila queda con
// `anulado_en` (recuperable solo por la base) y este cron la borra cuando
// pasó el plazo (`DIAS_PARA_BORRAR_ANULADOS`, `periodo-manda.ts`).
//
// Qué borra, en este orden, por LISTA DE IDS y nunca con un UPDATE/DELETE
// abierto:
//   1. los archivos de sus adjuntos en el bucket `marketing` (PDF, fotos);
//   2. sus sellos en `mk_periodo_documentos` (no cascadean: es polimórfica);
//   3. las facturas — `mk_adjuntos` y `mk_factura_marcas` cascadean solas.
// Los muebles (`mk_entregas_muebles`) no tienen `anulado_en`: se eliminan
// directo desde la ficha, devolviendo el stock, como siempre. Si algún día la
// columna existiera, entrarían por el mismo camino; sin ella, se dice y sigue.
//
// 🔴 CON EL INTERRUPTOR APAGADO NO BORRA NADA («como antes»). 🔴 Acotado a
// 500 por corrida. 🔴 `hoyPanama()` para el «hoy». Sin Telegram inmediato:
// rastro en `cron_email_errors` y el vigía de heartbeats si sigue caído.
// ============================================================================

import { supabaseServer } from "@/lib/supabase-server";
import { hoyPanama } from "@/lib/fecha-panama";
import { esColumnaAusente } from "./columnas-opcionales";
import { corteDeAnulados } from "./periodo-manda";
import { esPathStorage } from "./storage";
import { MARKETING_TIENDAS_Y_MARCAS } from "./tiendas-y-marcas";

const BUCKET = "marketing";
/** Cuántas filas como mucho por corrida: el cron corre todos los días. */
export const TOPE_POR_CORRIDA = 500;

export interface LimpiezaAnulados {
  ok: boolean;
  detail: string;
  /** Facturas (y pagos de impulsadora) borradas. */
  facturas: number;
  /** Archivos quitados del bucket. */
  archivos: number;
  /** Muebles borrados (hoy siempre 0: la tabla no tiene `anulado_en`). */
  entregas: number;
  cutoff: string;
}

type Fila = Record<string, unknown>;

async function borrarSellos(tipo: "factura" | "entrega", ids: string[]): Promise<string | null> {
  if (ids.length === 0) return null;
  const { error } = await supabaseServer
    .from("mk_periodo_documentos")
    .delete()
    .eq("tipo", tipo)
    .in("documento_id", ids);
  return error ? error.message : null;
}

/** Los anulados de una tabla que ya pasaron el corte. `null` = la columna no existe. */
async function idsCaducos(tabla: "mk_facturas" | "mk_entregas_muebles", cutoff: string) {
  const { data, error } = await supabaseServer
    .from(tabla)
    .select("id")
    .not("anulado_en", "is", null)
    .lt("anulado_en", cutoff)
    .order("anulado_en", { ascending: true })
    .limit(TOPE_POR_CORRIDA);
  if (error) {
    if (esColumnaAusente(error)) return { ids: null as string[] | null, error: null };
    return { ids: null, error: error.message };
  }
  return { ids: ((data ?? []) as Fila[]).map((f) => String(f.id)), error: null };
}

export async function runLimpiezaAnuladosMarketing(now: Date = new Date()): Promise<LimpiezaAnulados> {
  const cutoff = corteDeAnulados(hoyPanama(now));
  const vacio = (ok: boolean, detail: string): LimpiezaAnulados => ({
    ok,
    detail,
    facturas: 0,
    archivos: 0,
    entregas: 0,
    cutoff,
  });
  if (!MARKETING_TIENDAS_Y_MARCAS) return vacio(true, "interruptor apagado — nada que borrar");

  // ── 1. Las facturas (y los pagos de impulsadora) ───────────────────────────
  const fact = await idsCaducos("mk_facturas", cutoff);
  if (fact.error) return vacio(false, fact.error);
  const idsFactura = fact.ids ?? [];

  let archivos = 0;
  if (idsFactura.length > 0) {
    const { data: adjuntos, error: adjErr } = await supabaseServer
      .from("mk_adjuntos")
      .select("id, url")
      .in("factura_id", idsFactura);
    if (adjErr) return vacio(false, `adjuntos: ${adjErr.message}`);
    const paths = ((adjuntos ?? []) as Fila[])
      .map((a) => String(a.url ?? "").trim())
      .filter((u) => u.length > 0 && esPathStorage(u));
    if (paths.length > 0) {
      const { error: remErr } = await supabaseServer.storage.from(BUCKET).remove(paths);
      if (remErr) return vacio(false, `storage: ${remErr.message}`);
      archivos = paths.length;
    }
    const selloErr = await borrarSellos("factura", idsFactura);
    if (selloErr) return { ...vacio(false, `sellos: ${selloErr}`), archivos };
    const { error: delErr } = await supabaseServer.from("mk_facturas").delete().in("id", idsFactura);
    if (delErr) return { ...vacio(false, `facturas: ${delErr.message}`), archivos };
  }

  // ── 2. Los muebles, solo si la tabla tiene `anulado_en` (hoy no) ───────────
  let entregas = 0;
  let notaEntregas = "";
  const ent = await idsCaducos("mk_entregas_muebles", cutoff);
  if (ent.error) return { ...vacio(false, `entregas: ${ent.error}`), facturas: idsFactura.length, archivos };
  if (ent.ids === null) {
    notaEntregas = " · muebles: sin columna anulado_en (se eliminan directo desde la ficha)";
  } else if (ent.ids.length > 0) {
    const selloErr = await borrarSellos("entrega", ent.ids);
    if (selloErr) return { ...vacio(false, `sellos de entregas: ${selloErr}`), facturas: idsFactura.length, archivos };
    const { error: delErr } = await supabaseServer.from("mk_entregas_muebles").delete().in("id", ent.ids);
    if (delErr) return { ...vacio(false, `entregas: ${delErr.message}`), facturas: idsFactura.length, archivos };
    entregas = ent.ids.length;
  }

  const detail =
    idsFactura.length === 0 && entregas === 0
      ? `sin anulados de más de 90 días${notaEntregas}`
      : `${idsFactura.length} factura(s) y ${entregas} mueble(s) anulados hace más de 90 días, borrados con ${archivos} archivo(s)${notaEntregas}`;
  return { ok: true, detail, facturas: idsFactura.length, archivos, entregas, cutoff };
}
