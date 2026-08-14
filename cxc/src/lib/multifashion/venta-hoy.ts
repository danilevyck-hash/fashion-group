// ─────────────────────────────────────────────────────────────────────────────
// "HOY" — la venta del día de Multifashion (American Classics), para pantalla.
//
// Hasta hoy ese número sólo le llegaba a Daniel por Telegram a las 8pm (cron
// `acs-resumen-diario`, 01:00 UTC). Pedido textual: *"quiero ver también venta
// del día en multifashion"*, arriba del módulo, lo primero que se ve.
//
// EL MONTO NO SE VUELVE A CALCULAR ACÁ. Sale de `leerRetailRango`, la misma
// función que alimenta el mensaje de Telegram (ver `retail-dia.ts`): retail
// puro, SUM(subtotal) firmado con las NC en negativo. Si la pantalla y el
// Telegram se contradijeran, Daniel dejaría de creerle a los dos.
//
// ── LA FRESCURA NO ES DECORACIÓN ─────────────────────────────────────────────
// El sync de facturas de ACS corre cada ~2 h, así que el número NUNCA es "ahora
// mismo": es "hasta el último sync". Una pantalla que a las 11pm muestra $2.619
// a secas, cuando lo último que entró es de las 8pm, está MINTIENDO — y encima
// miente hacia abajo justo cuando el dueño quiere saber cómo cerró el día. Por
// eso el payload SIEMPRE viaja con `sync.ultimo` y la tarjeta siempre lo pinta;
// no hay un camino en el que se muestre el monto sin decir de cuándo es.
//
// ── POR QUÉ EL TITULAR COMPARA CONTRA EL MISMO DÍA DE LA SEMANA PASADA ───────
// Se calculan los dos comparativos que pidió Daniel (ayer y hace 7 días) y se
// mandan los dos, pero el que va grande es el de HACE 7 DÍAS. En una tienda de
// mostrador el día de la semana manda sobre casi todo: un sábado factura muy
// distinto a un martes, y "hoy lunes vs ayer domingo" produce una caída enorme
// que no informa NADA — es el calendario, no el negocio. Hace 7 días es el
// mismo día de la semana y encima está a una semana: misma temporada, mismos
// precios, misma promoción. Es la misma razón por la que el mensaje de Telegram
// compara el día contra −364 días y no contra el día anterior.
// "Ayer" igual se muestra, en chico y rotulado, porque para un dueño mirando la
// tienda a media tarde también es información — pero no es el titular.
//
// ⚠️ El comparativo es contra el día ENTERO de la semana pasada, mientras que
// "hoy" va hasta el último sync. Temprano en el día eso da una caída que es de
// relojería, no de ventas. Por eso la tarjeta rotula el día como EN CURSO
// mientras no haya cerrado la tienda (7pm Panamá), en vez de dejar que el
// porcentaje se lea como un desplome.
//
// ── $0 Y "TODAVÍA NO HAY VENTAS" NO SON LO MISMO ─────────────────────────────
// A las 9am un día normal la tienda todavía no facturó nada. Pintar "$0" ahí
// asusta a quien lo mira y no es lo que pasó: lo que pasó es que el día no
// arrancó. `documentos === 0` se reporta como tal y la pantalla escribe
// "Todavía no hay ventas hoy". Un $0 con documentos (todo devuelto por NC) sí
// es un cero de verdad y se muestra como cero.
// ─────────────────────────────────────────────────────────────────────────────

import { supabaseServer } from "@/lib/supabase-server";
import { variacionPct } from "@/lib/variacion";
import { leerRetailRango } from "@/lib/multifashion/retail-dia";

/** Panamá = UTC-5 fijo, todo el año (sin horario de verano). */
const PANAMA_OFFSET_MS = 5 * 60 * 60 * 1000;
const MS_DIA = 86_400_000;

/** El sync de facturas de ACS corre cada ~2 h. Pasadas 3 h sin refrescar ya se
 *  saltó una corrida: deja de ser "recién actualizado" y hay que decirlo. */
export const REZAGO_MS = 3 * 60 * 60 * 1000;

/** Hora de Panamá a la que cierra la tienda. Antes de eso el día está EN CURSO
 *  y el comparativo contra un día completo va con esa aclaración. */
export const HORA_CIERRE_TIENDA = 19;

export type EstadoFrescura = "fresco" | "rezagado" | "sin_dato";

export interface Comparativo {
  fecha: string;
  ventas: number;
  documentos: number;
  /** Ratio decimal (0.18 = +18%) o null si la base no sirve (regla única de
   *  `@/lib/variacion`: menos de $100 no produce porcentaje). */
  pct: number | null;
}

export interface VentaHoy {
  /** Día de negocio en Panamá (YYYY-MM-DD). */
  fecha: string;
  ventas: number;
  documentos: number;
  /** false = el día todavía no arrancó. NO es lo mismo que ventas === 0. */
  hayVentas: boolean;
  /** El día todavía no cerró (antes de las 7pm de Panamá). */
  enCurso: boolean;
  /** Titular: mismo día de la semana, hace 7 días. */
  semanaPasada: Comparativo;
  /** Secundario. */
  ayer: Comparativo;
  sync: {
    /** ISO del último sync exitoso que cubre `fecha`. null = no hubo ninguno. */
    ultimo: string | null;
    estado: EstadoFrescura;
    /** Minutos desde ese sync. null cuando no hay sync. */
    minutos: number | null;
  };
}

// ── Piezas puras ─────────────────────────────────────────────────────────────

/** Suma días a una fecha YYYY-MM-DD. Aritmética en UTC al mediodía: inmune a
 *  la zona horaria del proceso y a cualquier borde de medianoche. */
export function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  return new Date(d.getTime() + dias * MS_DIA).toISOString().slice(0, 10);
}

/** Los dos días contra los que se compara HOY. */
export function diasComparativos(fecha: string): { semanaPasada: string; ayer: string } {
  return { semanaPasada: sumarDias(fecha, -7), ayer: sumarDias(fecha, -1) };
}

/** Hora del reloj de Panamá (0..23) de un instante. UTC-5 fijo. */
export function horaPanama(ahora: Date): number {
  return new Date(ahora.getTime() - PANAMA_OFFSET_MS).getUTCHours();
}

/**
 * Qué tan viejo es el dato. `rezagado` no es un error: es el aviso de que
 * pasaron más de 3 h (una corrida de sync perdida) y que lo que se ve puede
 * estar quedándose corto.
 */
export function estadoFrescura(
  ultimo: string | null,
  ahora: Date,
): { estado: EstadoFrescura; minutos: number | null } {
  if (!ultimo) return { estado: "sin_dato", minutos: null };
  const ms = ahora.getTime() - new Date(ultimo).getTime();
  if (!Number.isFinite(ms)) return { estado: "sin_dato", minutos: null };
  // Un reloj adelantado en la DB no debe producir "hace -12 minutos".
  const minutos = Math.max(0, Math.round(ms / 60_000));
  return { estado: ms > REZAGO_MS ? "rezagado" : "fresco", minutos };
}

// ── Lecturas ─────────────────────────────────────────────────────────────────

/**
 * Instante del último sync de facturas de ACS que TERMINÓ BIEN y cuyo rango
 * cubre `fecha`. Es el "actualizado a las …" que ve el usuario.
 *
 * Fail-soft: si la consulta falla se devuelve null → la tarjeta dice que no
 * pudo confirmar la frescura, que es la verdad. Nunca se inventa una hora.
 */
export async function ultimoSyncFacturasAcs(fecha: string): Promise<string | null> {
  const { data, error } = await supabaseServer
    .from("switch_sync_log")
    .select("started_at, finished_at")
    .eq("empresa_key", "american_classic")
    .eq("sync_type", "facturas")
    .eq("status", "success")
    .lte("range_from", fecha)
    .gte("range_to", fecha)
    .order("finished_at", { ascending: false })
    .limit(1);
  if (error) {
    console.error(`[venta-hoy] frescura del sync: ${error.message}`);
    return null;
  }
  const fila = data?.[0] as { started_at?: string | null; finished_at?: string | null } | undefined;
  return fila?.finished_at ?? fila?.started_at ?? null;
}

interface OpcionesVentaHoy {
  /** Día de negocio a reportar (Panamá). */
  fecha: string;
  ahora: Date;
  /** Los dos días contra los que se compara (`diasComparativos`). Los calcula
   *  la RUTA y se piden SIEMPRE: desde que se levantó la ventana acotada de
   *  `gerente_acs` (13-ago-2026) no hay rol al que se le apague un comparativo. */
  semanaPasada: string;
  ayer: string;
}

function comparativo(fecha: string, r: { ventas: number; documentos: number }, hoy: number): Comparativo {
  return { fecha, ventas: r.ventas, documentos: r.documentos, pct: variacionPct(hoy, r.ventas) };
}

export async function calcularVentaHoy(op: OpcionesVentaHoy): Promise<VentaHoy> {
  const [dia, prevSemana, prevDia, ultimo] = await Promise.all([
    leerRetailRango(op.fecha, op.fecha),
    leerRetailRango(op.semanaPasada, op.semanaPasada),
    leerRetailRango(op.ayer, op.ayer),
    ultimoSyncFacturasAcs(op.fecha),
  ]);

  const { estado, minutos } = estadoFrescura(ultimo, op.ahora);

  return {
    fecha: op.fecha,
    ventas: dia.ventas,
    documentos: dia.documentos,
    hayVentas: dia.documentos > 0,
    enCurso: horaPanama(op.ahora) < HORA_CIERRE_TIENDA,
    semanaPasada: comparativo(op.semanaPasada, prevSemana, dia.ventas),
    ayer: comparativo(op.ayer, prevDia, dia.ventas),
    sync: { ultimo, estado, minutos },
  };
}
