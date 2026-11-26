// La base de «Pausar Switch»: leer la última pausa (con caché corto por
// proceso), el FRENO que llaman las dos puertas de red, y pausar/reanudar.
// Reglas y textos: `pausa.ts`.
//
// 🔑 La lectura FALLA ABIERTA: si la base no contesta, el sistema sigue como
// siempre (sin pausa). Sin las variables de Supabase (pruebas) ni siquiera
// pregunta: devuelve «sin pausa» sin cargar el cliente.

import {
  SwitchEnPausaError,
  pausaActiva,
  pausaEnGracia,
  type PausaSwitch,
} from "./pausa";

/** Cuánto vale la lectura en memoria. «Reanudar ahora» y «Pausar» limpian el
 *  caché de su propio proceso; los demás se enteran en ≤ 15 s. */
const CACHE_MS = 15_000;
let cache: { valor: PausaSwitch | null; leidoEn: number } | null = null;

/** Para pruebas: fija la pausa que «lee» la base (o `undefined` = vuelve a la base). */
let fijadaParaPruebas: PausaSwitch | null | undefined;
export function _fijarPausaParaPruebas(p: PausaSwitch | null | undefined): void {
  fijadaParaPruebas = p;
  cache = null;
}

export function _limpiarCachePausa(): void {
  cache = null;
}

const COLS = "id, pausado_por, desde, hasta, reanudada_en";

interface FilaPausa {
  id: number;
  pausado_por: string;
  desde: string;
  hasta: string;
  reanudada_en: string | null;
}

function aPausa(f: FilaPausa): PausaSwitch {
  return { id: f.id, pausadoPor: f.pausado_por, desde: f.desde, hasta: f.hasta, reanudadaEn: f.reanudada_en };
}

async function db() {
  const { supabaseServer } = await import("@/lib/supabase-server");
  return supabaseServer;
}

const hayBase = () => !!(process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL);

/** La pausa más reciente (activa o no). `null` = nunca hubo o la base no contestó. */
export async function leerUltimaPausa(opts: { fresca?: boolean } = {}): Promise<PausaSwitch | null> {
  if (fijadaParaPruebas !== undefined) return fijadaParaPruebas;
  if (!hayBase()) return null;
  if (!opts.fresca && cache && Date.now() - cache.leidoEn < CACHE_MS) return cache.valor;
  try {
    const { data, error } = await (await db())
      .from("switch_pausas")
      .select(COLS)
      .order("desde", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const valor = data ? aPausa(data as FilaPausa) : null;
    cache = { valor, leidoEn: Date.now() };
    return valor;
  } catch (err) {
    console.error(`[switch-pausa] no pude leer la pausa (sigo sin pausa): ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

/** La pausa si está ACTIVA ahora; si no, `null`. */
export async function leerPausaSwitch(opts: { fresca?: boolean } = {}): Promise<PausaSwitch | null> {
  const p = await leerUltimaPausa(opts);
  return pausaActiva(p) ? p : null;
}

/** Activa, o terminada hace menos de la gracia (para callar alertas de frescura). */
export async function switchEnPausaOGracia(): Promise<boolean> {
  return pausaEnGracia(await leerUltimaPausa());
}

/**
 * 🔴 EL FRENO. Lo llaman `rawCall` (client.ts) y `webFetch` (web-client.ts)
 * antes de cada petición a Switch. En pausa lanza `SwitchEnPausaError`.
 */
export async function frenoDePausaSwitch(): Promise<void> {
  const p = await leerPausaSwitch();
  if (p) throw new SwitchEnPausaError(p);
}

/** Crea una pausa nueva (cierra la que estuviera activa). */
export async function pausarSwitch(horas: number, quien: string): Promise<PausaSwitch> {
  const supa = await db();
  const ahora = new Date();
  const activa = await leerPausaSwitch({ fresca: true });
  if (activa) {
    await supa
      .from("switch_pausas")
      .update({ reanudada_en: ahora.toISOString(), reanudada_por: quien })
      .eq("id", activa.id)
      .is("reanudada_en", null);
  }
  const hasta = new Date(ahora.getTime() + horas * 3_600_000).toISOString();
  const { data, error } = await supa
    .from("switch_pausas")
    .insert({ pausado_por: quien, desde: ahora.toISOString(), hasta })
    .select(COLS)
    .single();
  if (error || !data) throw new Error(`No se pudo guardar la pausa: ${error?.message ?? "sin fila"}`);
  cache = null;
  return aPausa(data as FilaPausa);
}

/** «Reanudar ahora». Devuelve la pausa cerrada, o `null` si no había activa. */
export async function reanudarSwitch(quien: string): Promise<PausaSwitch | null> {
  const activa = await leerPausaSwitch({ fresca: true });
  if (!activa) return null;
  const { data, error } = await (await db())
    .from("switch_pausas")
    .update({ reanudada_en: new Date().toISOString(), reanudada_por: quien })
    .eq("id", activa.id)
    .is("reanudada_en", null)
    .select(COLS)
    .maybeSingle();
  if (error) throw new Error(`No se pudo reanudar: ${error.message}`);
  cache = null;
  return data ? aPausa(data as FilaPausa) : null;
}
