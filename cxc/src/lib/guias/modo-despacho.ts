// ─────────────────────────────────────────────────────────────────────────────
// CÓMO SALE UNA GUÍA — y por qué el modo lo decide `modo_entrega`, no la columna
// `tipo_despacho`.
//
// Daniel, textual: *«Entrega directa no debería de llevar placa, ya que es
// directo con nuestro propio camión.»*
//
// 🩸 EL BUG, Y POR QUÉ NO ALCANZABA CON UN `??`. `useDespachoGuia` arrancaba con
// `(g.tipo_despacho as TipoDespacho) || "externo"` y NUNCA miraba `modo_entrega`,
// que es lo que la persona ya había elegido al crear la guía. La trampa es que
// **`guia_transporte.tipo_despacho` tiene DEFAULT 'externo' en la base**: no es
// null en una guía sin despachar, así que un `g.tipo_despacho ?? derivado` sería
// un no-op perfecto. Medido en producción el 14-ago-2026: de las 186 guías
// vivas, las 186 traen `tipo_despacho` con valor, incluida la única pendiente
// (GT-201, sin placa ni chofer). O sea que ese campo NO dice cómo salió una guía
// que todavía no salió: dice el default de la columna.
//
// 🔴 LA REGLA, y las dos mitades importan:
//   · Guía SIN despachar → el modo es el que se eligió al crearla
//     (`modo_entrega`). Es lo único que alguien decidió a propósito.
//   · Guía YA despachada → `tipo_despacho`, que es lo que REALMENTE pasó y quedó
//     firmado en el papel. No se reinterpreta: la historia no se toca.
//
// ⚠️ ESA SEGUNDA MITAD ES LA QUE EVITA UNA MENTIRA NUEVA. Con el botón
// "cambiar" del despacho, alguien puede crear una guía como entrega directa y al
// despacharla elegir transportista externo (llegó el camión de un tercero). Si
// `modo_entrega` ganara siempre, ESA guía saldría impresa como "Entrega directa"
// con una placa real de un tercero al lado. Se cambiaría un papel que miente por
// otro que miente distinto.
//
// ⚠️ LAS 50 GUÍAS YA GRABADAS MAL NO SE TOCAN — son Completada con
// `tipo_despacho='externo'`, y arreglarlas es otra decisión de Daniel. Lo que sí
// se limpia es el "0": ver `sinCeroPelado`.
// ─────────────────────────────────────────────────────────────────────────────

import {
  numeroTranspDeLinea,
  numeroTranspUnico,
  type TipoDespacho,
} from "./falta-para-despachar";

export type ModoEntrega = "transportista" | "entrega_directa";

/**
 * 🔴 LAS MISMAS PALABRAS EN LAS DOS PANTALLAS. Al crear decía "Transportista" y
 * al despachar "Transportista externo": dos nombres para lo mismo, en el mismo
 * flujo, con dos días de diferencia. Gana "Transportista externo" porque es lo
 * que ya dicen el papel, el PDF, la lista y la ficha de la guía — y porque
 * "externo" es justamente lo que lo distingue de nuestro propio camión.
 */
export const ETIQUETA_TIPO_DESPACHO: Record<TipoDespacho, string> = {
  externo: "Transportista externo",
  directo: "Entrega directa",
};

/** Los estados en los que la guía ya salió: ahí manda `tipo_despacho`. */
export function guiaYaDespachada(estado: string | null | undefined): boolean {
  return estado === "Completada" || estado === "Rechazada";
}

/** `modo_entrega` (lo que se elige al crear) → `tipo_despacho` (lo que se despacha). */
export function tipoDespachoDeModo(modo: string | null | undefined): TipoDespacho {
  return modo === "entrega_directa" ? "directo" : "externo";
}

function tipoValido(v: string | null | undefined): TipoDespacho | null {
  return v === "directo" || v === "externo" ? v : null;
}

export interface GuiaModo {
  estado?: string | null;
  tipo_despacho?: string | null;
  modo_entrega?: string | null;
}

/**
 * Cómo sale (o salió) esta guía. Ver la cabecera: sin despachar manda
 * `modo_entrega`; despachada manda `tipo_despacho`.
 *
 * Sin `modo_entrega` legible cae en "externo", que es el comportamiento de
 * siempre — no se inventa una entrega directa por ausencia de dato.
 */
export function tipoDespachoEfectivo(g: GuiaModo): TipoDespacho {
  if (guiaYaDespachada(g.estado)) {
    return tipoValido(g.tipo_despacho) ?? tipoDespachoDeModo(g.modo_entrega);
  }
  return tipoDespachoDeModo(g.modo_entrega);
}

export function esEntregaDirecta(g: GuiaModo): boolean {
  return tipoDespachoEfectivo(g) === "directo";
}

/**
 * 🔴 UN "0" NO ES UNA PLACA NI UN N° DE GUÍA: es lo que alguien tecleó para
 * poder apretar el botón.
 *
 * Medido en producción el 14-ago-2026: GT-194, GT-195 y GT-196 (11-ago) tienen
 * `placa = "0"` y `numero_guia_transp = "0"`, y son las ÚNICAS tres placas "0"
 * de toda la base. Las tres se crearon como entrega directa y la pantalla les
 * exigía placa y número de transportista.
 *
 * Esto NO toca la base: es solo para el PAPEL. Imprimir "PLACA: 0" en un
 * documento que alguien firma es afirmar algo falso, y ninguna placa de Panamá
 * es "0". La columna se queda como está — corregir las filas es otra decisión.
 */
export function sinCeroPelado(valor: string | null | undefined): string {
  const t = String(valor ?? "").trim();
  return t === "0" ? "" : t;
}

/**
 * Los DOS papeles (la hoja que se imprime y el PDF que se comparte) usan estos
 * envoltorios en vez de llamar a `numeroTransp*` directo, para que el "0" no se
 * cuele por una de las dos puertas. Son un envoltorio, no una segunda regla: la
 * herencia línea → cabecera sigue viviendo en `falta-para-despachar`.
 */
export function numeroTranspImpreso(
  numeroLinea: string | null | undefined,
  numeroGuia: string | null | undefined,
): string {
  return numeroTranspDeLinea(sinCeroPelado(numeroLinea), sinCeroPelado(numeroGuia));
}

export function numeroTranspUnicoImpreso(
  items: ReadonlyArray<{ numero_guia_transp?: string | null }>,
  numeroGuia: string | null | undefined,
): string {
  return numeroTranspUnico(
    items.map((i) => ({ numero_guia_transp: sinCeroPelado(i.numero_guia_transp) })),
    sinCeroPelado(numeroGuia),
  );
}
