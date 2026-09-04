// ═══════════════════════════════════════════════════════════════════════════
//   EL CUADRE DE COSTO: dos fuentes de Switch tienen que decir lo mismo.
//
//   `switch_costo_diario` por fin tiene un lector. Lo que ve el Resumen se
//   compara, mes cerrado por mes cerrado, contra lo que Switch dice por ese
//   otro camino; si difieren más del umbral, suena 🔧 SISTEMA.
// ═══════════════════════════════════════════════════════════════════════════
//
// ── EL INCIDENTE QUE LO PIDIÓ (3-sep-2026) ──────────────────────────────────
// Ventas › Resumen, Active Wear, agosto 2026: costo −$44.483,03 y utilidad
// mayor que la venta. El 27-ago se anuló una nota de crédito de $74.166 con una
// NOTA DE DÉBITO de $73.752, y la fuente de costo del Resumen
// (`switch_articulo_diario`, del reporte `ventasucursal`) no trae notas de
// débito: restó la NC y nunca sumó la ND. Se había aceptado como «~0,1 % del
// costo»; en un solo mes-empresa fueron $50.041,20.
//
// Y durante TRES MESES hubo en la base otra tabla que sí tenía el número bueno
// —`switch_costo_diario`, del reporte «Total de ventas», que para Active Wear
// agosto decía $5.558,17, el mismo número del panel— y nadie la leía. Dos
// fuentes que se contradecían por $50.000 sin que nada sonara.
//
// ── QUÉ COMPARA, Y POR QUÉ SOLO LOS DÍAS COMPARABLES ────────────────────────
// Por (empresa, mes CERRADO): la suma de `switch_costo_diario` contra la suma
// de la fuente del Resumen (`switch_costo_unificado_v2`: artículo diario + ND de
// utilidad). La RPC `cuadre_costo_mensual_v1` suma SOLO los días que valen en
// las dos fuentes:
//   · NO el último día del mes. `switch_costo_diario` se escribe a las 00:30 de
//     Panamá con el reporte del mes en curso, y el día 1 el reporte ya es del
//     mes nuevo: el último día vale $0 para siempre (vistana 31-ago-2026:
//     $13.606,69 de costo real, $0 en esa tabla).
//   · Solo días con fila en `switch_costo_diario`: un día que el guard de montos
//     rechazó (Boston 14-jul-2026, $1.000 M de costo) no tiene con qué compararse.
//   · Solo días leídos DESPUÉS de que el día terminara en Panamá: una fila
//     escrita a media mañana es una foto parcial (Boston 30-jul-2026: $40 contra
//     $1.649,64, porque al día siguiente Switch mandó ese día corrupto y el
//     guard conservó la foto de las 09:01).
// Con eso, medido el 3-sep-2026 sobre 8 empresas × may–ago 2026: 32 pares, la
// diferencia máxima es 0,75 % (Boston ago, dos artículos con costo sospechoso
// que `sync-articulos` guarda en 0) y **0 disparos**. Sin el filtro de días,
// Boston jul daba 2,7 % por la foto parcial del 30-jul: una falsa alarma sobre
// un mes cuyo Resumen está bien.
//
// ── CUMPLE LA REGLA DE TRES DEL CANAL 🔧 SISTEMA ────────────────────────────
//   1. Es real — dos reportes de Switch sobre el mismo mes no dicen lo mismo, y
//      la diferencia se mide en plata.
//   2. No se arregla solo — un mes cerrado no cambia; la ND que falta no va a
//      aparecer sola.
//   3. Alguien tiene que hacer algo — mirar qué documento de ese mes falta en
//      una de las dos fuentes. El mensaje dice cuál mes, cuánto y por dónde
//      empezar.
// No estrena una cuarta regla: es la regla 2 («algo se rompió y no se arregló
// solo») mirando el DATO en vez del `status`, igual que el silencio de datos.
//
// 🔴 VA A TELEGRAM, NO A DATA HEALTH. Daniel, textual (3-sep-2026): «yo no uso
// Data Health, nunca lo veo».
//
// ── CUÁNDO SE MIRA ──────────────────────────────────────────────────────────
// En la reconciliación (10/14/18 UTC), junto con la regla 1 y el silencio de
// datos: las alertas de datos miran el mundo en el mismo instante y no cuestan
// una entrada de cron. Se miran los últimos `MESES_CERRADOS_A_MIRAR` meses
// cerrados: los suficientes para cazar una ND que entre tarde, sin arrastrar
// para siempre un mes que ya se revisó.
//
// ── ANTI-LOOP: LA CLAVE ES (EMPRESA, MES) ───────────────────────────────────
// Mismo ritmo que el silencio de datos y el guard de montos: 7 días entre avisos
// de la misma clave. Un mes que sigue descuadrado se repite una vez por semana,
// no en cada pasada, hasta que sale de la ventana o alguien lo arregla.
// ═══════════════════════════════════════════════════════════════════════════

import { mapEmpresaName } from "@/lib/empresa-mapping";
import { DIAS_ENTRE_AVISOS } from "@/lib/alertas/silencio-de-datos";

/** Diferencia relativa a partir de la cual se avisa. Daniel: «más de 2 %». */
export const UMBRAL_CUADRE = 0.02;

/**
 * Diferencia ABSOLUTA mínima para avisar, en dólares.
 *
 * El 2 % solo no alcanza: joystep junio 2026 costó $29,43 en el mes entero, y
 * ahí $1 ya es 3,4 %. Un aviso por $1 se gana que Daniel lo ignore, y entonces
 * el de $50.000 tampoco lo lee. Las dos condiciones tienen que darse.
 */
export const PISO_DIFERENCIA_USD = 100;

/** Meses cerrados que se revisan en cada pasada (el más reciente primero). */
export const MESES_CERRADOS_A_MIRAR = 3;

/** Días mínimos comparables para opinar sobre un mes. Un mes con 3 días buenos
 *  no es un mes: se calla, como todo par sin historia suficiente. */
export const MIN_DIAS_COMPARADOS = 10;

/** Desde cuándo existe `switch_costo_diario`: antes no hay con qué cuadrar. */
export const PRIMER_MES_CON_COSTO_DIARIO = "2026-05-01";

export { DIAS_ENTRE_AVISOS };

/** `tipo` en `cron_email_errors`: la clave del anti-loop, una por (empresa, mes). */
export const TIPO_CUADRE = "cuadre_costo";
export const tipoDeCuadre = (empresaKey: string, mes: string): string =>
  `${TIPO_CUADRE}:${empresaKey}:${mes}`;

/** Una fila de `cuadre_costo_mensual_v1`. */
export interface FilaCuadre {
  empresa_key: string;
  /** Primer día del mes, `YYYY-MM-DD`. */
  mes: string;
  dias_comparados: number;
  dias_sin_fila: number;
  dias_foto_parcial: number;
  costo_diario: number | string;
  costo_resumen: number | string;
}

export interface Descuadre {
  empresaKey: string;
  /** `YYYY-MM-DD` (primer día del mes). */
  mes: string;
  diasComparados: number;
  diasSinFila: number;
  diasFotoParcial: number;
  costoDiario: number;
  costoResumen: number;
  /** `costoResumen − costoDiario`, con signo. */
  diferencia: number;
  /** |diferencia| / |costoDiario|. */
  pct: number;
}

const num = (v: number | string | null | undefined): number =>
  typeof v === "number" ? v : Number(v ?? 0) || 0;

/**
 * La ventana de meses cerrados: `[desde, hasta)` en fechas `YYYY-MM-DD`.
 * `hasta` es el primer día del mes en curso (exclusivo); `desde` va
 * `MESES_CERRADOS_A_MIRAR` meses atrás, sin pasar de cuando la tabla existe.
 */
export function ventanaMesesCerrados(hoyPanama: string): { desde: string; hasta: string } {
  const [y, m] = hoyPanama.split("-").map(Number);
  const hasta = `${y}-${String(m).padStart(2, "0")}-01`;
  // Restar meses de a uno, sin Date (Panamá es UTC−5 fijo y no queremos zonas).
  let yy = y;
  let mm = m - MESES_CERRADOS_A_MIRAR;
  while (mm < 1) {
    mm += 12;
    yy -= 1;
  }
  const desdeCalc = `${yy}-${String(mm).padStart(2, "0")}-01`;
  const desde = desdeCalc < PRIMER_MES_CON_COSTO_DIARIO ? PRIMER_MES_CON_COSTO_DIARIO : desdeCalc;
  return { desde, hasta };
}

/**
 * ¿Este (empresa, mes) está descuadrado? PURA.
 *
 * Se calla —devuelve `null`— cuando:
 *   · hay menos de `MIN_DIAS_COMPARADOS` días comparables;
 *   · la diferencia no llega a `UMBRAL_CUADRE` del costo diario;
 *   · la diferencia no llega a `PISO_DIFERENCIA_USD`.
 * Las tres son «ante la duda, callar».
 */
export function evaluarCuadre(fila: FilaCuadre): Descuadre | null {
  const diasComparados = Number(fila.dias_comparados) || 0;
  if (diasComparados < MIN_DIAS_COMPARADOS) return null;

  const costoDiario = num(fila.costo_diario);
  const costoResumen = num(fila.costo_resumen);
  const diferencia = Math.round((costoResumen - costoDiario) * 100) / 100;
  const base = Math.abs(costoDiario);
  const pct = base === 0 ? (diferencia === 0 ? 0 : Infinity) : Math.abs(diferencia) / base;

  if (pct <= UMBRAL_CUADRE) return null;
  if (Math.abs(diferencia) < PISO_DIFERENCIA_USD) return null;

  return {
    empresaKey: fila.empresa_key,
    mes: fila.mes,
    diasComparados,
    diasSinFila: Number(fila.dias_sin_fila) || 0,
    diasFotoParcial: Number(fila.dias_foto_parcial) || 0,
    costoDiario,
    costoResumen,
    diferencia,
    pct,
  };
}

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** "agosto 2026" a partir de `2026-08-01`. */
export function nombreDeMes(mes: string): string {
  const [y, m] = mes.split("-").map(Number);
  return `${MESES[(m || 1) - 1]} ${y}`;
}

const usd = (n: number): string =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const pctTexto = (p: number): string =>
  Number.isFinite(p) ? `${(p * 100).toFixed(1).replace(".", ",")} %` : "más del doble";

/**
 * El mensaje que va al celular. PURO. UN mensaje por pasada con todos los pares
 * descuadrados que todavía no se avisaron.
 *
 * Sin nombres de tabla ni de reporte: qué mes, cuánto, qué significa y por
 * dónde empezar a buscar.
 */
export function mensajeCuadre(descuadres: readonly Descuadre[]): string {
  const lineas: string[] = [];
  lineas.push(
    descuadres.length === 1
      ? "El costo de un mes no cuadra entre las dos fuentes de Switch."
      : `El costo de ${descuadres.length} meses no cuadra entre las dos fuentes de Switch.`,
  );
  lineas.push("");

  for (const d of descuadres) {
    const signo = d.diferencia > 0 ? "de más" : "de menos";
    lineas.push(
      `• ${mapEmpresaName(d.empresaKey)}, ${nombreDeMes(d.mes)}: el Resumen tiene ` +
        `${usd(Math.abs(d.diferencia))} ${signo} (${pctTexto(d.pct)}) — ` +
        `${usd(d.costoResumen)} en pantalla contra ${usd(d.costoDiario)} según el total de ventas por día, ` +
        `sobre ${d.diasComparados} días comparables.`,
    );
    const fuera: string[] = [];
    if (d.diasSinFila > 0) fuera.push(`${d.diasSinFila} sin dato diario`);
    if (d.diasFotoParcial > 0) fuera.push(`${d.diasFotoParcial} con foto parcial`);
    if (fuera.length > 0) lineas.push(`  Días que no se compararon: ${fuera.join(", ")} (además del último del mes).`);
  }

  lineas.push("");
  lineas.push(
    "Qué significa: la utilidad de ese mes en Ventas › Resumen puede estar corrida por esa cifra. " +
      "Las ventas no cambian; es el costo.",
  );
  lineas.push(
    "Qué hacer: avísame para revisar qué documento de ese mes falta en una de las dos fuentes " +
      "(lo típico es una nota de débito o de crédito que entró tarde).",
  );
  lineas.push("Mientras siga así, este aviso se repite una vez por semana, no en cada pasada.");
  return lineas.join("\n");
}
