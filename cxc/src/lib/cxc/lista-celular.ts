// ─────────────────────────────────────────────────────────────────────────────
// LA LISTA DEL CELULAR — módulo PURO. Acá no hay consultas, ni `new Date()`, ni
// una sola suma que la computadora no haga con la MISMA regla.
//
// Lo que vive acá es cómo se LEE la cartera con el pulgar: con qué orden abre,
// qué dice el segundo renglón de cada fila, de qué color va la rayita, y cómo
// se resume la cartera por empresa. Los tramos salen de `cxc-aging` y el orden
// de `cxc-orden`: no se inventa un cuarto vocabulario ni un segundo comparador.
//
// 🔴 EL MONTO SE ESCRIBE EXACTO. La pantalla vieja usaba `formatCompactCurrency`
// en la fila del cliente y eso escondía $20.794,51 en la suma de las 100
// tarjetas (medido el 24-sep-2026). Los CHIPS de tramo sí siguen compactos: ahí
// el número es una orientación, no la plata que se va a cobrar.
// ─────────────────────────────────────────────────────────────────────────────

import { AGING, type AgingKey } from "@/lib/cxc-aging";
import {
  ordenParaRiskFilter,
  type ClienteOrdenable,
  type Orden,
  type RiskFilter,
} from "@/lib/cxc-orden";
import { avisaSinPagar } from "./sin-pagar";

// ─────────────────────────────────────────────────────────────────────────────
// 1 · El monto que se lee
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `$650,276` — el monto EXACTO, sin centavos.
 *
 * Los centavos no cambian a quién se llama y se llevan 40 px del renglón; el
 * millar sí: «$1K» por $1.407,92 es un 29 % de error. Un saldo a favor sale con
 * el signo adelante (`-$1,208`), como en toda la casa.
 */
export function montoExacto(n: number): string {
  const v = Math.round(n ?? 0);
  const signo = v < 0 ? "-" : "";
  return `${signo}$${Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2 · El segundo renglón: «lo que urge»
// ─────────────────────────────────────────────────────────────────────────────

/** El texto largo de los días sin pagar: en la fila hay sitio para la palabra. */
export function textoSinPagarLargo(dias: number | null): string {
  if (dias === null) return "nunca ha pagado";
  if (dias === 0) return "pagó hoy";
  return `no paga hace ${dias} ${dias === 1 ? "día" : "días"}`;
}

/**
 * UNA sola cosa por fila: la más urgente de las que se saben.
 *
 * El orden de prioridad es el del cobro, no el del dato:
 *   1. plata de más de 120 días — es lo que se va a reclamar;
 *   2. el que hace rato no paga (la misma regla del aviso, `avisaSinPagar`);
 *   3. plata de 91 a 120 días;
 *   4. cuándo pagó, si hace poco;
 *   5. «al día».
 *
 * 🔴 Nunca dice «vencido»: `dias` es la EDAD del documento, no mora. Los rangos
 * son los de `cxc-aging` escritos en palabras, los mismos del papel.
 */
export function loQueUrge(c: ClienteOrdenable, dias: number | null): string {
  if (c.total < 0) return "tiene saldo a favor";
  if (c.overdue > 0) return `${montoExacto(c.overdue)} con más de 120 días`;
  if (avisaSinPagar(dias)) return textoSinPagarLargo(dias);
  if (c.watch > 0) return `${montoExacto(c.watch)} con 91 a 120 días`;
  if (dias !== null && dias > 0) return textoSinPagarLargo(dias);
  return "al día";
}

/** ¿Este renglón pide atención? (para pintarlo en rojo, no para filtrar). */
export function urgeEnRojo(c: ClienteOrdenable, dias: number | null): boolean {
  return c.total >= 0 && (c.overdue > 0 || avisaSinPagar(dias));
}

// ─────────────────────────────────────────────────────────────────────────────
// 3 · La rayita de color: el tramo DOMINANTE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Dónde está la MAYOR parte de la plata de este cliente. No es «el peor tramo
 * con algo adentro»: un cliente con $497.000 al día y $46.000 viejos se lee
 * verde, porque eso es lo que es.
 *
 * Empate → gana el tramo más viejo (es lo que hay que mirar). Saldo a favor o
 * cero → `null`, y la fila va sin color.
 */
export function tramoDominante(c: ClienteOrdenable): AgingKey | null {
  if (c.total <= 0) return null;
  const { current, watch, overdue } = c;
  const mayor = Math.max(current, watch, overdue);
  if (mayor <= 0) return null;
  if (overdue === mayor) return "overdue";
  if (watch === mayor) return "watch";
  return "current";
}

// ─────────────────────────────────────────────────────────────────────────────
// 4 · Con qué orden abre, y qué hace un chip
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 🔴 EN EL CELULAR LA LISTA ABRE POR PLATA: el que más debe, arriba (Daniel,
 * 24-sep-2026). Y al tocar un chip de tramo, por la plata DE ESE TRAMO.
 *
 * Las dos cosas son exactamente `ordenParaRiskFilter`, la regla del 27-jul-2026
 * que ya rige las píldoras de la computadora: acá no nace un segundo
 * comparador, solo se deja de aplicar el override de apertura.
 *
 * ⚠️ LA COMPUTADORA NO CAMBIA: su tabla sigue abriendo por «más viejo sin
 * pagar» (`ORDEN_AL_ABRIR`), con su candado `cxc-abre-por-mas-viejo`.
 */
export function ordenDelCelular(risk: RiskFilter): Orden {
  return ordenParaRiskFilter(risk);
}

/** El número grande: el total, o el del tramo tocado. */
export function totalDeLaPortada(
  totals: { total: number; current: number; watch: number; overdue: number },
  risk: RiskFilter,
): number {
  if (risk === "current") return totals.current;
  if (risk === "watch") return totals.watch;
  if (risk === "overdue") return totals.overdue;
  return totals.total;
}

/** «más de 120 días» · «91 a 120 días» · «hasta 90 días» — en palabras. */
export function rangoEnPalabras(k: AgingKey): string {
  return k === "overdue" ? "más de 120 días" : k === "watch" ? "91 a 120 días" : "hasta 90 días";
}

/** El rótulo corto del chip («0–90» · «91–120» · «más de 120»). */
export function chipCorto(k: AgingKey): string {
  return k === "overdue" ? "más de 120" : AGING[k].colLabel.replace("-", "–");
}

/**
 * La línea bajo el número grande. Dice cuántos clientes se están mirando y de
 * dónde salen — nunca un total sin decir qué suma.
 */
export function subtituloDeLaPortada(opts: {
  cuantos: number;
  risk: RiskFilter;
  empresas: number;
  unaEmpresa: string | null;
}): string {
  const { cuantos, risk, empresas, unaEmpresa } = opts;
  const clientes = `${cuantos} ${cuantos === 1 ? "cliente" : "clientes"}`;
  if (risk !== "all") return `${clientes} con ${rangoEnPalabras(risk)}`;
  if (unaEmpresa) return `${clientes} en ${unaEmpresa} · el que más debe, arriba`;
  return `${clientes} en las ${empresas} empresas · el que más debe, arriba`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 5 · «Por empresa» — la cartera abierta por empresa
// ─────────────────────────────────────────────────────────────────────────────

/** Lo mínimo que hace falta de un cliente para abrir la cartera por empresa. */
export interface ClienteConEmpresas {
  nombre_normalized: string;
  companies: Record<
    string,
    | {
        nombre?: string | null;
        total: number;
        d0_30: number;
        d31_60: number;
        d61_90: number;
        d91_120: number;
        d121_180: number;
        d181_270: number;
        d271_365: number;
        mas_365: number;
        ultimoPagoFecha?: string | null;
        ultimoPagoMonto?: number | null;
        ultimaCompraFecha?: string | null;
        ultimaCompraMonto?: number | null;
      }
    | undefined
  >;
}

export interface FilaEmpresa {
  key: string;
  nombre: string;
  total: number;
  current: number;
  watch: number;
  overdue: number;
  clientes: number;
  /** El pago más reciente que entró en ESA empresa, de los clientes con saldo. */
  ultimoPago: { fecha: string; monto: number; cliente: string } | null;
  /** La última factura de ESA empresa, de los clientes con saldo. */
  ultimaCompra: { fecha: string; monto: number } | null;
}

/**
 * Una fila por empresa, ordenadas por lo que se les debe.
 *
 * 🔴 NO SE RECALCULA NADA: los tramos se suman EXACTAMENTE como los suma la
 * pantalla de escritorio al elegir una empresa en el filtro (0-90 = d0_30 +
 * d31_60 + d61_90; 91-120 = d91_120; más de 120 = los cuatro de arriba). Este
 * módulo solo agrupa lo que ya llegó.
 *
 * ⚠️ El «pagó X · vendió Y» sale del MISMO dato que ya dibuja cada empresa
 * dentro de un cliente (`switch_ultimo_pago_cliente_v2` y
 * `switch_ultima_compra_cliente_v1`), o sea de los clientes que HOY tienen
 * saldo. No es el último recibo de toda la empresa: es el último de su cartera
 * viva, que es de lo que habla esta pantalla.
 *
 * 🔴 Boston no entra ni puede entrar: la lista de empresas la manda quien
 * llama, y en el CXC del grupo son las 6 de `B2B_COMPANIES`.
 */
export function carteraPorEmpresa(
  clientes: ClienteConEmpresas[],
  empresas: { key: string; name: string }[],
): FilaEmpresa[] {
  const filas: FilaEmpresa[] = empresas.map((e) => ({
    key: e.key,
    nombre: e.name,
    total: 0,
    current: 0,
    watch: 0,
    overdue: 0,
    clientes: 0,
    ultimoPago: null,
    ultimaCompra: null,
  }));
  const porKey = new Map(filas.map((f) => [f.key, f]));

  for (const c of clientes) {
    for (const [key, d] of Object.entries(c.companies ?? {})) {
      const fila = porKey.get(key);
      if (!fila || !d || d.total === 0) continue;
      fila.total += d.total;
      fila.current += d.d0_30 + d.d31_60 + d.d61_90;
      fila.watch += d.d91_120;
      fila.overdue += d.d121_180 + d.d181_270 + d.d271_365 + d.mas_365;
      fila.clientes += 1;
      const fechaPago = (d.ultimoPagoFecha ?? "").slice(0, 10);
      if (fechaPago && (!fila.ultimoPago || fechaPago > fila.ultimoPago.fecha)) {
        fila.ultimoPago = {
          fecha: fechaPago,
          monto: Number(d.ultimoPagoMonto) || 0,
          cliente: (d.nombre || c.nombre_normalized || "").trim(),
        };
      }
      const fechaCompra = (d.ultimaCompraFecha ?? "").slice(0, 10);
      if (fechaCompra && (!fila.ultimaCompra || fechaCompra > fila.ultimaCompra.fecha)) {
        fila.ultimaCompra = { fecha: fechaCompra, monto: Number(d.ultimaCompraMonto) || 0 };
      }
    }
  }

  for (const f of filas) {
    f.total = redondear(f.total);
    f.current = redondear(f.current);
    f.watch = redondear(f.watch);
    f.overdue = redondear(f.overdue);
  }

  return filas.filter((f) => f.clientes > 0).sort((a, b) => b.total - a.total);
}

/** Centavos, no coma flotante: 0,1 + 0,2 no puede aparecer en una pantalla. */
function redondear(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─────────────────────────────────────────────────────────────────────────────
// 6 · «ayer» · «hace 7 d»
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cuánto hace, en palabras cortas. Las dos fechas son `YYYY-MM-DD` y «hoy» lo
 * pone quien llama con `hoyPanama()`: acá no se consulta el reloj.
 */
export function haceCuanto(fecha: string | null | undefined, hoy: string): string | null {
  if (!fecha) return null;
  const a = Date.parse(`${fecha.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${hoy.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  const dias = Math.max(0, Math.round((b - a) / 86_400_000));
  if (dias === 0) return "hoy";
  if (dias === 1) return "ayer";
  return `hace ${dias} d`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 7 · El último pago del cliente, sin una consulta nueva
// ─────────────────────────────────────────────────────────────────────────────

/**
 * El DÍA en que este cliente pagó por última vez y cuánto entró ESE DÍA en
 * todas sus empresas.
 *
 * 🔴 Sale del dato que la pantalla YA tiene: `switch_ultimo_pago_cliente_v2`
 * llega por empresa (`ultimoPagoFecha`/`ultimoPagoMonto`) desde el 13-ago-2026.
 * Los clientes grandes le pagan a varias empresas el MISMO día —el 20-ago-2026,
 * D-25 pagó $234.189,21 repartidos en cuatro—, así que se suma por fecha, igual
 * que `pagos-por-fecha.ts`. Acá no se pide nada a la red.
 *
 * ⚠️ Es el último pago de las empresas donde HOY tiene saldo; el bloque
 * «Últimos pagos» completo sigue saliendo de `/api/cxc/ultimos-pagos`.
 */
export function ultimoPagoDelCliente(
  c: ClienteConEmpresas,
): { fecha: string; monto: number } | null {
  let fecha = "";
  for (const d of Object.values(c.companies ?? {})) {
    const f = (d?.ultimoPagoFecha ?? "").slice(0, 10);
    if (f && f > fecha) fecha = f;
  }
  if (!fecha) return null;
  let monto = 0;
  for (const d of Object.values(c.companies ?? {})) {
    if ((d?.ultimoPagoFecha ?? "").slice(0, 10) === fecha) monto += Number(d?.ultimoPagoMonto) || 0;
  }
  return { fecha, monto: redondear(monto) };
}

// ─────────────────────────────────────────────────────────────────────────────
// 8 · La página de UN cliente: sus empresas, en renglones
// ─────────────────────────────────────────────────────────────────────────────

export interface RenglonEmpresaCliente {
  key: string;
  nombre: string;
  total: number;
  current: number;
  watch: number;
  overdue: number;
  /** Cuántos documentos con saldo tiene ahí, y cuántos días lleva el más viejo. */
  documentos: number;
  masViejo: number | null;
  ultimoPago: { fecha: string; monto: number } | null;
}

/**
 * Las empresas donde este cliente debe, ordenadas por lo que debe.
 *
 * 🔴 LOS TRAMOS SALEN DEL AGING, NO DE LOS DOCUMENTOS. La edad de un documento
 * y el tramo del estado de cuenta se calculan en Switch de dos formas: contarlos
 * acá daría un segundo juego de tramos para la misma plata. Del estado de cuenta
 * se toma SOLO cuántos documentos son y cuál es el más viejo, que es lo que el
 * aging no dice.
 */
export function empresasDelCliente(
  c: ClienteConEmpresas,
  nombrePorKey: Record<string, string>,
  docsPorKey: Record<string, { documentos: number; masViejo: number | null }>,
): RenglonEmpresaCliente[] {
  const filas: RenglonEmpresaCliente[] = [];
  for (const [key, d] of Object.entries(c.companies ?? {})) {
    if (!d || d.total === 0) continue;
    const docs = docsPorKey[key];
    const fecha = (d.ultimoPagoFecha ?? "").slice(0, 10);
    filas.push({
      key,
      nombre: nombrePorKey[key] ?? key,
      total: redondear(d.total),
      current: redondear(d.d0_30 + d.d31_60 + d.d61_90),
      watch: redondear(d.d91_120),
      overdue: redondear(d.d121_180 + d.d181_270 + d.d271_365 + d.mas_365),
      documentos: docs?.documentos ?? 0,
      masViejo: docs?.masViejo ?? null,
      ultimoPago: fecha ? { fecha, monto: Number(d.ultimoPagoMonto) || 0 } : null,
    });
  }
  return filas.sort((a, b) => b.total - a.total);
}
