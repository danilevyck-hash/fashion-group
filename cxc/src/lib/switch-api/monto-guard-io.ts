// ═══════════════════════════════════════════════════════════════════════════
//   GUARD DE MONTOS IMPOSIBLES — el lado que toca la base y Telegram.
//   La matemática (umbrales, simetría, anti-envenenamiento, anti-loop) vive en
//   `monto-guard.ts`, que es PURO. Acá solo está el I/O, una vez, compartido.
// ═══════════════════════════════════════════════════════════════════════════
//
// ── EL AVISO NO ES UNA CUARTA REGLA SUELTA ───────────────────────────────────
// El 30-jul-2026 Daniel cerró la lista de alertas de 🔧 SISTEMA en TRES (dato
// viejo >24 h, dos fallos seguidos, base sin memoria). "Switch mandó un monto
// imposible" **no agrega una cuarta**: es la MISMA alerta que ya existía desde
// el 27-jul para el costo diario (`avisarCostoDiarioImposible`), generalizada a
// todas las tablas de plata. Antes había una regla por una tabla; ahora hay una
// regla para las ocho. El conteo de reglas BAJA, no sube.
//
// Y cumple la regla de tres del canal, sin la cual no saldría:
//   1. Es real — el número está medido y viene de la fuente, no de un tecleo.
//   2. No se arregla solo — el dato está mal EN Switch: mañana llega igual.
//   3. Alguien tiene que hacer algo — corregirlo en Switch.
//
// ── Y NO PUEDE VOLVERSE LA ALERTA QUE SUENA PARA SIEMPRE ─────────────────────
// Ese es el modo de fallo con el que este repo ya se quemó dos veces (umbral de
// swap, heartbeat de cron retirado). Dos frenos:
//   • **Un mensaje por corrida**, no uno por fila: si 40 documentos de una
//     empresa vienen corruptos, sale UN aviso con los 5 primeros.
//   • **Anti-loop de 7 días por fila**: los reportes de Switch traen la misma
//     ventana todos los días, así que una fila mala reaparece en cada corrida.
//     Solo se avisa por lo que no se avisó en la ventana reciente.

import { enviarSistema } from "@/lib/alertas/canal";
import { mapEmpresaName } from "@/lib/empresa-mapping";
import {
  GUARDS,
  umbralMonto,
  clavesPorAvisar,
  campoSkip,
  fmtMonto,
  techoHistoria,
  MONTO_DIAS_ENTRE_AVISOS,
  type FamiliaMonto,
  type FilaRechazada,
} from "./monto-guard";

/**
 * Supabase se carga PEREZOSO, no al importar el módulo.
 *
 * `supabase-server` crea el cliente en el import y revienta sin las env vars.
 * Con un import de arriba, cualquier archivo que toque el guard —incluidos los
 * arneses de test del catálogo, que inyectan su propia base— arrastraría esa
 * dependencia sin usarla. El guard tiene que poder vivir en un módulo que no
 * habla con la base.
 */
async function db() {
  const { supabaseServer } = await import("@/lib/supabase-server");
  return supabaseServer;
}

/** Lo que cada sync guarda en `switch_sync_log.skip_details`. */
export interface MontoSkipDetail {
  facturaId: null;
  secuencial: string;
  campo: string;
  valorCrudo: unknown;
}

/**
 * Umbral calibrado contra el histórico REAL de la tabla.
 *
 * Una sola consulta por dirección (máximo y mínimo), filtrando en el servidor
 * las filas envenenadas (|monto| ≥ techo) para que una cifra absurda ya guardada
 * no pueda levantar el umbral por encima de sí misma.
 *
 * **Fail-open**: cualquier fallo devuelve el piso, que es el comportamiento más
 * permisivo posible. Nunca se vuelve MÁS agresivo por no poder leer.
 *
 * Costo medido (30-jul-2026): ~180 ms por dirección, dominado por la ida y
 * vuelta HTTP — una vez por corrida de sync, no por fila.
 */
export async function calibrarUmbral(
  familia: FamiliaMonto,
  empresaKey?: string,
  tablaOverride?: string,
): Promise<number> {
  const def = GUARDS[familia];
  const tabla = tablaOverride ?? def.tabla;
  const techo = techoHistoria(familia);
  const historia: number[] = [];

  // Fail-open TOTAL: cualquier cosa que salga mal —error de PostgREST, la base
  // caída, un cliente que no responde— devuelve el piso. Nunca se vuelve más
  // agresivo por no poder leer, porque el falso positivo es el fallo caro.
  try {
    const supabase = await db();
    for (const orden of ["desc", "asc"] as const) {
      let q = supabase.from(tabla).select(def.anclaje);
      if (def.porEmpresa && empresaKey) q = q.eq("empresa_key", empresaKey);
      // El filtro del anti-envenenamiento va en el servidor: pedir el máximo sin
      // él devolvería justamente la fila absurda.
      q = orden === "desc" ? q.lt(def.anclaje, techo) : q.gt(def.anclaje, -techo);
      const { data, error } = await q.order(def.anclaje, { ascending: orden === "asc" }).limit(1);
      if (error || !data) {
        console.warn(
          `[monto-guard ${familia}${empresaKey ? ` ${empresaKey}` : ""}] no pude leer el histórico para calibrar (${error?.message ?? "vacío"}); uso el piso`,
        );
        return def.piso;
      }
      for (const fila of data as unknown as Array<Record<string, unknown>>) {
        historia.push(Number(fila[def.anclaje]));
      }
    }
  } catch (e) {
    console.warn(
      `[monto-guard ${familia}${empresaKey ? ` ${empresaKey}` : ""}] falló la calibración (${String(e)}); uso el piso`,
    );
    return def.piso;
  }
  return umbralMonto(familia, historia);
}

/** Los descartes, listos para `switch_sync_log.skip_details`. */
export function detallesDeRechazo<T>(
  familia: FamiliaMonto,
  rechazadas: readonly FilaRechazada<T>[],
  umbral: number,
): MontoSkipDetail[] {
  return rechazadas.map((r) => ({
    facturaId: null,
    secuencial: r.clave,
    campo: campoSkip(familia),
    valorCrudo: { umbral, columnas: r.columnas },
  }));
}

/**
 * Claves que YA se avisaron en la ventana reciente, leídas de las corridas
 * anteriores del mismo par (empresa, sync_type). Fail-open: si no se puede
 * leer, se avisa — perder un aviso es peor que repetirlo.
 */
async function clavesYaAvisadas(
  familia: FamiliaMonto,
  empresaKey: string,
  syncType: string,
  logIdActual: string | null,
): Promise<string[]> {
  const desde = new Date(Date.now() - MONTO_DIAS_ENTRE_AVISOS * 86_400_000).toISOString();
  const claves: string[] = [];
  try {
    const supabase = await db();
    const { data, error } = await supabase
      .from("switch_sync_log")
      .select("id,skip_details")
      .eq("empresa_key", empresaKey)
      .eq("sync_type", syncType)
      .gte("started_at", desde);
    if (error || !data) return [];
    const campo = campoSkip(familia);
    for (const fila of data as unknown as Array<{ id: string; skip_details: unknown }>) {
      if (logIdActual && fila.id === logIdActual) continue; // la corrida en curso no cuenta
      if (!Array.isArray(fila.skip_details)) continue;
      for (const d of fila.skip_details as Array<{ campo?: unknown; secuencial?: unknown }>) {
        if (d?.campo === campo && typeof d.secuencial === "string") claves.push(d.secuencial);
      }
    }
  } catch {
    return []; // fail-open: perder un aviso es peor que repetirlo
  }
  return claves;
}

const MAX_EN_MENSAJE = 5;

/**
 * UN aviso por corrida al canal 🔧 SISTEMA. Nunca puede tumbar el sync: el
 * llamador lo envuelve en try/catch y sigue en `success` aunque Telegram falle.
 */
/**
 * Empresas que NO avisan por Telegram cuando el guard rechaza una cifra.
 *
 * 🩸 confecciones_boston (5-ago-2026). Daniel: *"en telegram no quiero noti de
 * boston de ese estilo"*. Su documento `155-000000129` trae
 * **$266.541.352,00** —contra un tope de $2.000.000— y el dato está mal EN
 * SWITCH, no acá. Daniel decidió no corregirlo, así que el aviso iba a repetirse
 * cada semana para siempre sin que nadie hiciera nada: exactamente la
 * alerta-que-suena-para-siempre que la lista de 3 reglas vino a eliminar.
 *
 * ⚠️ LO QUE **NO** CAMBIA: el guard sigue rechazando la fila igual. La cifra
 * imposible NO entra a la base, el margen y las comisiones siguen protegidos, y
 * el rechazo sigue quedando en `switch_sync_log.skip_details` para poder
 * auditarlo. Lo único que se apaga es el mensaje.
 *
 * Las demás empresas SÍ avisan: si mañana aparece una cifra imposible en
 * Vistana o Fashion Wear, eso sí es noticia.
 */
const SIN_AVISO_DE_MONTOS = new Set(["confecciones_boston"]);

export async function avisarMontosImposibles<T>(opts: {
  familia: FamiliaMonto;
  empresaKey: string;
  syncType: string;
  rechazadas: readonly FilaRechazada<T>[];
  umbral: number;
  logId: string | null;
}): Promise<void> {
  const { familia, empresaKey, syncType, rechazadas, umbral, logId } = opts;
  if (rechazadas.length === 0) return;
  if (SIN_AVISO_DE_MONTOS.has(empresaKey)) return;

  const nuevas = new Set(
    clavesPorAvisar(
      rechazadas.map((r) => r.clave),
      await clavesYaAvisadas(familia, empresaKey, syncType, logId),
    ),
  );
  if (nuevas.size === 0) return; // ya se avisó por estas filas: no se repite

  const aMostrar = rechazadas.filter((r) => nuevas.has(r.clave)).slice(0, MAX_EN_MENSAJE);
  const detalle = aMostrar
    .map((r) => `• ${r.clave}: ${r.columnas.map((c) => fmtMonto(c.valor)).join(" / ")}`)
    .join("\n");
  const extra = nuevas.size > MAX_EN_MENSAJE ? `\n…y ${nuevas.size - MAX_EN_MENSAJE} más.` : "";

  await enviarSistema(
    `Switch mandó un monto imposible — ${mapEmpresaName(empresaKey)}\n${detalle}${extra}\n\n` +
      `Qué pasó: al sincronizar ${GUARDS[familia].que}, Switch devolvió una cifra que ninguna ` +
      `operación real alcanza (el tope para esta empresa es ${fmtMonto(umbral)}).\n` +
      `Qué significa: eso NO se guardó, así que las ventas, el margen y las comisiones quedaron ` +
      `limpios. Todo lo demás de esa sincronización entró normal.\n` +
      `Qué hacer: revisar ese dato en Switch — hay algo mal cargado. Mientras siga mal, este ` +
      `aviso se repite una vez por semana, no todos los días.`,
  );
}
