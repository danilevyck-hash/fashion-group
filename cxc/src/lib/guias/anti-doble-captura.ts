// ─────────────────────────────────────────────────────────────────────────────
// NUEVA GUÍA › LA MISMA FACTURA NO SE CAPTURA DOS VECES (18-sep-2026)
// (módulo PURO: sin React, sin fetch, sin reloj)
//
// Daniel, textual: *«factura importada desde Etiquetas sale marcada/bloqueada
// en el selector de siempre, y viceversa»*.
//
// 🩸 EL HUECO DE LA FASE 1: en `/guias/nueva` hay DOS paneles que llenan los
// MISMOS renglones — «Facturas del cliente» (el selector de siempre) y
// «Facturas etiquetadas pendientes» — y ninguno sabía del otro. La factura
// etiquetada con 14 cajas se podía tocar por los dos lados, y lo que se
// descuadraba eran los BULTOS: el selector marca la factura pero NO suma las
// cajas de la etiqueta, así que el renglón salía con la factura puesta y los
// bultos en cero, o con la factura repetida entre dos renglones del mismo par.
//
// 🔴 LA REGLA, EN UNA LÍNEA: **una factura CON etiqueta viva se marca SOLO en
// «Facturas etiquetadas pendientes»; una factura SIN etiqueta, solo en el
// selector de siempre.** Nunca por los dos lados.
//
// 🔴 ESTO BLOQUEA. Y ES A PROPÓSITO DISTINTO DEL AVISO «Ya salió en GT-XXX»:
//   · «Ya salió en GT-XXX» (`atajos-facturas.ts`) habla de OTRA guía, YA
//     firmada, de otro día. El sistema puede afirmar «ya salió» pero no lo
//     contrario —hay facturas sin guía que son mostrador o retiro en bodega—,
//     y a veces una factura vuelve a salir de verdad. Por eso AVISA y la
//     casilla se puede marcar igual: Daniel, *«el ya salió no me molesta»*.
//   · Esto es LA MISMA GUÍA QUE SE ESTÁ ARMANDO AHORA, en esta pantalla, con
//     la cuenta de bultos abierta. No hay ninguna lectura del negocio en que
//     la misma factura entre dos veces al mismo despacho: es un error de
//     dedo, y dejarlo pasar manda al camión con los bultos mal contados. Por
//     eso FRENA, y dice en la fila por qué.
//
// 🔴 QUÉ ESTÁ MARCADO SIGUE DERIVÁNDOSE DE LOS RENGLONES. Lo único que se
// guarda aparte es QUIÉN lo marcó (el conjunto `mias` del panel de etiquetas),
// porque el renglón no guarda de dónde salió cada número. Marcada = está en el
// renglón **y** la marcó este panel: borrar la fila a mano la desmarca sola,
// exactamente como en la Fase 1.
// ─────────────────────────────────────────────────────────────────────────────

import {
  estaImportada,
  etiquetaDeLaFactura,
  etiquetaMarcada,
  type EtiquetaFila,
} from "@/lib/guias/etiquetas";
import {
  facturaMarcada,
  type ClienteElegido,
  type FacturaDelCliente,
  type RenglonDeGuia,
} from "@/lib/guias/atajos-facturas";

/** «14 cajas» / «1 caja» — una sola forma de decirlo en las dos pantallas. */
export function textoCajas(n: number): string {
  return `${n} ${n === 1 ? "caja" : "cajas"}`;
}

/**
 * ¿Esta factura del selector tiene una etiqueta VIVA y PENDIENTE?
 *
 * ⚠️ Una etiqueta que YA salió en otra guía no bloquea nada: ése es el terreno
 * del aviso «Ya salió en GT-XXX», que avisa y no frena. Acá solo cuentan las
 * pendientes, que son las que todavía tienen que entrar a una guía.
 *
 * El pareo es por `empresa_key` + `switch_factura_id` —el id REAL de Switch—,
 * nunca por nombre ni por el número de factura: es justamente lo que las
 * etiquetas guardan y los renglones no.
 */
export function etiquetaPendienteDeLaFactura(
  etiquetas: readonly EtiquetaFila[],
  f: Pick<FacturaDelCliente, "empresa_key" | "switch_factura_id">,
): EtiquetaFila | null {
  if (f.switch_factura_id == null) return null;
  const e = etiquetaDeLaFactura(etiquetas, f.empresa_key, f.switch_factura_id);
  if (!e || estaImportada(e)) return null;
  return e;
}

/** Lo que el selector de siempre puede hacer con una fila. */
export type CapturaEnElSelector =
  | { modo: "libre" }
  | { modo: "de-etiquetas"; etiqueta: EtiquetaFila; marcada: boolean; motivo: string };

/**
 * 🔴 DIRECCIÓN 1 — ETIQUETAS ⇒ SELECTOR. Una factura con etiqueta viva sale
 * BLOQUEADA en «Facturas del cliente», marcada si ya está en la guía, y con el
 * porqué a la vista.
 */
export function capturaEnElSelector(
  items: readonly RenglonDeGuia[],
  cliente: ClienteElegido,
  f: Pick<FacturaDelCliente, "empresa_key" | "switch_factura_id" | "empresa" | "secuencial">,
  etiquetas: readonly EtiquetaFila[],
): CapturaEnElSelector {
  const etiqueta = etiquetaPendienteDeLaFactura(etiquetas, f);
  if (!etiqueta) return { modo: "libre" };
  const marcada = facturaMarcada(items, cliente, f);
  return {
    modo: "de-etiquetas",
    etiqueta,
    marcada,
    motivo: marcada
      ? `Ya viene de Etiquetas · ${textoCajas(etiqueta.cajas)}`
      : `Se marca en Etiquetas · ${textoCajas(etiqueta.cajas)}`,
  };
}

/** Lo que el panel de etiquetas puede hacer con una de sus filas. */
export type CapturaEnEtiquetas = "libre" | "marcada" | "tomada-por-el-selector";

/** El texto del bloqueo en «Facturas etiquetadas pendientes». */
export const MOTIVO_TOMADA_POR_EL_SELECTOR =
  "Ya está marcada abajo, en «Facturas del cliente»";

/**
 * 🔴 DIRECCIÓN 2 — SELECTOR ⇒ ETIQUETAS. Si la factura de esta etiqueta ya
 * está en un renglón y NO la puso este panel, la casilla se BLOQUEA: volver a
 * marcarla sumaría sus cajas encima de un renglón que ya la tiene.
 *
 * `mias` son los ids que este panel encendió. Que la etiqueta esté en `mias`
 * **no alcanza**: también tiene que seguir en los renglones, para que borrar
 * una fila a mano la desmarque sola (la conducta de la Fase 1, intacta).
 */
export function capturaEnEtiquetas(
  items: readonly RenglonDeGuia[],
  e: EtiquetaFila,
  mias: ReadonlySet<number>,
): CapturaEnEtiquetas {
  const enLaGuia = etiquetaMarcada(items, e);
  if (!enLaGuia) return "libre";
  return mias.has(e.id) ? "marcada" : "tomada-por-el-selector";
}

/** ¿Está marcada esta etiqueta? (derivado del renglón **y** de quién la marcó) */
export function etiquetaEstaMarcada(
  items: readonly RenglonDeGuia[],
  e: EtiquetaFila,
  mias: ReadonlySet<number>,
): boolean {
  return capturaEnEtiquetas(items, e, mias) === "marcada";
}

/**
 * Los ids que se atan a los renglones DESPUÉS de crear la guía: solo los que
 * este panel marcó y siguen en los renglones.
 */
export function idsParaAtar(
  items: readonly RenglonDeGuia[],
  etiquetas: readonly EtiquetaFila[],
  mias: ReadonlySet<number>,
): number[] {
  return etiquetas.filter((e) => etiquetaEstaMarcada(items, e, mias)).map((e) => e.id);
}
