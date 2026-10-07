// ─────────────────────────────────────────────────────────────────────────────
// Despachos › Pedidos — el flujo SIMPLIFICADO (7-oct-2026, Daniel).
//
// Reemplaza, detrás de este interruptor, la asignación de bulto POR ARTÍCULO
// que se publicó hoy mismo (`PEDIDOS_BULTOS_2026_10`, commit `8ed2479d`).
// Daniel, textual: «Quitar lo de poner número de bulto, que los de la bodega
// solo vean su pedido, anotar cuántos bultos tiene el pedido, y entregarlo.
// Al entregarlo, a la secretaria le sale en su parte los pedidos recibidos
// (con los bultos) para que ella sepa y pueda facturar en Switch. Cuando ella
// facture en Switch, le saldrá en etiquetas (que diga etiqueta, no bultos) y
// listo. Y ella tiene que poner entregado para saber que ya facturó el
// pedido que bodega le entregó.»
//
// El flujo nuevo, CUATRO estados con nombres de ERP (`docs/nombres-erp.md`):
//
//   Pendiente → Preparado → Facturado → Despachado
//
//   1. Bodega ve su pedido, lo arma (sin precios, como hoy) y anota CUÁNTOS
//      BULTOS son — un solo número por pedido, nunca por artículo — y lo
//      entrega. Se va la columna «Bulto» por línea y la tabla
//      `pedidos_linea_bulto`: esa asignación no existe más en este flujo.
//   2. «Preparado»: sale de la lista de bodega, entra a la de la secretaria
//      con la cantidad de bultos, para que facture en Switch.
//   3. «Facturado»: la secretaria lo marca A MANO después de facturar
//      —NO es automático; ver el porqué abajo—. Pasa a la pestaña Etiquetas
//      (antes «Bultos», se renombra de vuelta: Daniel, 7-oct-2026, «que diga
//      etiqueta, no bultos»).
//   4. «Despachado»: la secretaria lo marca al salir con sus etiquetas, y el
//      pedido se cierra.
//
// 🔑 NOMBRES: Daniel propuso Pendiente → Preparado → Facturado → Despachado y
// pidió que yo los revisara. Los dejo tal cual — son los nombres de ERP serio
// (SAP/Odoo) para este flujo exacto: «Preparado» ya estaba aprobado (no se
// toca); «Facturado» es el verbo estándar para «Switch ya hizo la factura»,
// más preciso que «Verificado» (que no dice QUÉ se verificó) o «Recibido»
// (ambiguo: ¿recibido por quién?); «Despachado» es el término de ERP para
// «salió con su documento de envío», y encaja con el nombre del módulo
// (Despachos). No hay mejor alternativa que proponer.
//
// 🔴 ¿PUEDE EL SISTEMA DARSE CUENTA SOLO DE QUE SWITCH YA FACTURÓ? — NO, hoy
// no es una señal confiable, así que «Facturado» es MANUAL (Daniel: «si el
// sistema puede bien, si no a mano»).
//   Medido (7-oct-2026): `sync-pedidos.ts` trae `/apipedido/lista` con
//   `estatus: "Activo"` y BORRA de `switch_pedidos` cualquier pedido que deje
//   de venir en esa lista — el comentario del propio sync asume que
//   "lo que ya no está Activo (facturado) se va". Pero esa es una suposición
//   escrita en un comentario, no algo verificado: la documentación del API
//   (`docs/switch-panel.md` §15, punto 3) dice EXPLÍCITAMENTE que «anular un
//   comprobante» no tiene permiso documentado y «sigue sin respuesta», y
//   `switch-referencia.md` §1.5 anota que ya pasó con OTRO endpoint (facturas)
//   que «nunca usamos estatus (¿excluye anuladas? la doc no lo dice)». No hay
//   ningún rastro local para distinguir los dos casos: el sync BORRA la fila
//   en vez de archivarla, así que un pedido que desaparece no deja dato de
//   SI se facturó o se anuló — y no se pudo sondear el API en vivo para
//   despejarlo (❗ solo de noche, separado ≥15 min de otros crons de la misma
//   empresa, y cerrando sesión al salir: de día habría botado a Daniel de su
//   panel de Switch). Mientras no se verifique esa noche, el sistema NO
//   decide solo: la secretaria pone «Facturado» con su propio dedo, después
//   de facturar en Switch. Si una noche se confirma que «desapareció de
//   Activo» SIEMPRE es sinónimo de facturado (nunca de anulado), este paso se
//   puede automatizar sin tocar nombres ni pantalla — solo quién lo marca.
//
// 🔴 Esto reemplaza, PARA ESTE FLUJO, la regla de «nadie hace los dos pasos
// del mismo pedido» de `pedidos-bultos.ts`: esa regla existía porque bodega
// no se auditaba sola («no se puede confiar solo en bodega»). Aquí
// «Facturado» y «Despachado» no son una auditoría del trabajo de bodega: son
// dos pasos del trabajo de LA SECRETARIA (facturar en Switch, y confirmar que
// salió con sus etiquetas), así que no hace falta una segunda persona.
// ─────────────────────────────────────────────────────────────────────────────

import { B2B_EMPRESA_KEYS } from "@/lib/empresa-mapping";
import { empresasQueVe, horaPanama, MAX_BULTO, MIN_BULTO, veLaEmpresa, type Veredicto } from "./pedidos-bultos";

/**
 * `false` = la pantalla de hoy: asignación de bulto por artículo, TRES
 * estados (`PEDIDOS_BULTOS_2026_10`). Nace APAGADO — el mockup va primero.
 * Mismo escape que `PAPELES_ESTILO_UNICO` para sacar capturas en LOCAL sin
 * publicar nada: `NEXT_PUBLIC_PEDIDOS_FLUJO_SIMPLE=1`. En producción manda la
 * constante: la variable no existe en Vercel.
 */
export const PEDIDOS_FLUJO_SIMPLE_EN_CODIGO = false;

export const PEDIDOS_FLUJO_SIMPLE_2026_10: boolean =
  PEDIDOS_FLUJO_SIMPLE_EN_CODIGO ||
  (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_PEDIDOS_FLUJO_SIMPLE === "1");

export { empresasQueVe, veLaEmpresa };

// ─── Los CUATRO estados ──────────────────────────────────────────────────────

export const ESTADOS_FLUJO_SIMPLE = ["pendiente", "preparado", "facturado", "despachado"] as const;
export type EstadoFlujoSimple = (typeof ESTADOS_FLUJO_SIMPLE)[number];

export const ROTULO_ESTADO_FLUJO_SIMPLE: Record<EstadoFlujoSimple, string> = {
  pendiente: "Pendiente",
  preparado: "Preparado",
  facturado: "Facturado",
  despachado: "Despachado",
};

export function esEstadoFlujoSimple(v: unknown): v is EstadoFlujoSimple {
  return typeof v === "string" && (ESTADOS_FLUJO_SIMPLE as readonly string[]).includes(v);
}

/** Sin fila en `pedidos_bodega_estado`, o un valor que no se reconoce, = «pendiente». */
export function estadoFlujoSimpleLeido(v: unknown): EstadoFlujoSimple {
  return esEstadoFlujoSimple(v) ? v : "pendiente";
}

const ORDEN = ESTADOS_FLUJO_SIMPLE;

/** El siguiente paso; `despachado` ya es el final. */
export function siguienteEstadoFlujoSimple(e: EstadoFlujoSimple): EstadoFlujoSimple | null {
  const i = ORDEN.indexOf(e);
  return i < 0 || i === ORDEN.length - 1 ? null : ORDEN[i + 1];
}

/** El paso de atrás, para deshacer un toque; `pendiente` no tiene atrás. */
export function estadoAnteriorFlujoSimple(e: EstadoFlujoSimple): EstadoFlujoSimple | null {
  const i = ORDEN.indexOf(e);
  return i <= 0 ? null : ORDEN[i - 1];
}

/** «Preparado» lo marca bodega o la secretaria, como en el flujo de hoy. */
export const ROLES_PREPARA_FLUJO_SIMPLE: readonly string[] = ["admin", "secretaria", "bodega"];

/**
 * «Facturado» y «Despachado» son trabajo de LA SECRETARIA (facturar en
 * Switch, y confirmar que salió con sus etiquetas): bodega no entra a ninguno
 * de los dos, nunca vio el dinero ni toca Switch.
 */
export const ROLES_FACTURA_O_DESPACHA_FLUJO_SIMPLE: readonly string[] = ["admin", "secretaria"];

export function rolesDelEstadoFlujoSimple(destino: EstadoFlujoSimple): readonly string[] {
  return destino === "preparado" ? ROLES_PREPARA_FLUJO_SIMPLE : ROLES_FACTURA_O_DESPACHA_FLUJO_SIMPLE;
}

export interface QuienMarcaFlujoSimple {
  role: string | null | undefined;
  userName: string | null | undefined;
}

/**
 * ¿Puede esta persona mover ESTE pedido a ESE estado? Un solo paso adelante o
 * atrás, el rol tiene que estar en la lista del DESTINO, y la empresa tiene
 * que ser una de las suyas. Sin la regla de «otra persona»: ver el porqué
 * arriba del archivo.
 */
export function puedeMoverFlujoSimple(
  args: { desde: EstadoFlujoSimple; hasta: EstadoFlujoSimple; empresa_key: string },
  quien: QuienMarcaFlujoSimple,
): Veredicto {
  const { desde, hasta, empresa_key } = args;
  if (desde === hasta) return { ok: false, error: "El pedido ya está así" };
  if (siguienteEstadoFlujoSimple(desde) !== hasta && estadoAnteriorFlujoSimple(desde) !== hasta) {
    return { ok: false, error: "Ese pedido tiene que avanzar un paso a la vez" };
  }
  if (!veLaEmpresa(empresa_key, quien.userName, quien.role)) {
    return { ok: false, error: "Ese pedido no es de una de tus empresas" };
  }
  if (!quien.role || !rolesDelEstadoFlujoSimple(hasta).includes(quien.role)) {
    return {
      ok: false,
      error: hasta === "preparado" ? "No puedes marcar pedidos" : "Ese paso lo marca la secretaria",
    };
  }
  return { ok: true };
}

// ─── Cuántos bultos: UN número por pedido ───────────────────────────────────

/** El número que anota bodega al preparar el pedido. Entero de 1 a 9999. */
export function validarCantidadBultos(v: unknown): Veredicto & { valor?: number } {
  const n = typeof v === "number" ? v : Number(String(v ?? "").trim());
  if (!Number.isInteger(n) || n < MIN_BULTO || n > MAX_BULTO) {
    return { ok: false, error: `Escribe cuántos bultos son, de ${MIN_BULTO} a ${MAX_BULTO}` };
  }
  return { ok: true, valor: n };
}

// ─── Quién marcó cada paso, y cuándo ─────────────────────────────────────────

export interface FirmasFlujoSimple {
  preparado_por: string | null;
  preparado_en: string | null;
  facturado_por: string | null;
  facturado_en: string | null;
  despachado_por: string | null;
  despachado_en: string | null;
}

/** «Julio · 10:42 a. m.» para la columna de la lista. `null` = no ocurrió. */
export function firmaEnColumnaFlujoSimple(por: string | null | undefined, en: string | null | undefined): string | null {
  const quien = (por ?? "").trim();
  return quien && en ? `${quien} · ${horaPanama(en)}` : null;
}

/** El ÚLTIMO paso dado, para la columna de la lista: «Facturado · Angela · 4:15 p. m.». */
export function ultimaFirmaFlujoSimple(f: FirmasFlujoSimple): string | null {
  const pasos: [EstadoFlujoSimple, string | null, string | null][] = [
    ["despachado", f.despachado_por, f.despachado_en],
    ["facturado", f.facturado_por, f.facturado_en],
    ["preparado", f.preparado_por, f.preparado_en],
  ];
  for (const [paso, por, en] of pasos) {
    const t = firmaEnColumnaFlujoSimple(por, en);
    if (t) return `${ROTULO_ESTADO_FLUJO_SIMPLE[paso]} · ${t}`;
  }
  return null;
}

/** Que no se nos olviden las 6 del grupo en ningún camino de respaldo. */
export const EMPRESAS_PEDIDOS_FLUJO_SIMPLE = B2B_EMPRESA_KEYS;
