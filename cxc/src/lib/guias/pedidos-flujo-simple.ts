// ─────────────────────────────────────────────────────────────────────────────
// Despachos › Pedidos — el flujo SIMPLIFICADO (7-oct-2026, Daniel).
//
// Reemplaza, detrás de este interruptor, la asignación de bulto POR ARTÍCULO
// que se publicó hoy mismo (`PEDIDOS_BULTOS_2026_10`, commit `8ed2479d`).
// Daniel, textual (primer pedido): «Quitar lo de poner número de bulto, que
// los de la bodega solo vean su pedido, anotar cuántos bultos tiene el
// pedido, y entregarlo. Al entregarlo, a la secretaria le sale en su parte
// los pedidos recibidos (con los bultos) para que ella sepa y pueda facturar
// en Switch.»
//
// 🔴 ALCANCE RECORTADO (Daniel, mismo día, segunda vuelta): «El flujo de
// Pedidos termina en Recibido. Son tres estados y nada más […] Lo que pasa
// después —la secretaria entra a Switch, factura, y eso aparece en
// Etiquetas— no es parte de Pedidos. Tampoco programes la detección
// automática de la factura: sale del alcance.» Por eso NO hay «Facturado» ni
// «Despachado» aquí, y no hay ningún código que mire Switch para detectar la
// factura — ver el porqué de esa parte (igual útil como dato, no programado)
// más abajo.
//
// El flujo, TRES estados con nombres de ERP (`docs/nombres-erp.md`):
//
//   Pendiente → Preparado → Recibido
//
//   1. Bodega ve su pedido, lo arma (sin precios, como hoy) y anota CUÁNTOS
//      BULTOS son — un solo número por pedido, nunca por artículo — y lo
//      entrega. Se va la columna «Bulto» por línea y la tabla
//      `pedidos_linea_bulto`: esa asignación no existe más en este flujo.
//   2. «Preparado»: sale de la lista de bodega, entra a la de la secretaria
//      con la cantidad de bultos. Ahí termina Pedidos — facturar en Switch y
//      lo que salga en Etiquetas es OTRA pantalla, no esta.
//   3. «Recibido»: la secretaria lo marca cuando lo tiene en mano. Cierra el
//      pedido en ESTE módulo.
//
// 🔑 NOMBRES: «Preparado» ya estaba aprobado (no se toca). «Recibido» es el
// término de ERP para «la otra parte ya lo tiene en mano» — más simple que
// «Verificado» (que sugiere una revisión que aquí no hace falta, al no haber
// líneas que chequear) y encaja con que la secretaria SOLO confirma que lo
// recibió, sin facturar todavía.
//
// 🔴 UN PEDIDO «PREPARADO» QUE NADIE RECIBE TIENE QUE VERSE (Daniel: el
// motivo de las dos marcas). `PREPARADO_VIEJO_DIAS = 2`: medio día o un día
// de demora es normal (la secretaria no está pegada a la pantalla); a los 2
// días completos ya es más que un ciclo de entrega-recepción y vale la pena
// un aviso — y no se espera a una semana, que es cuando un pedido se
// perdería de vista del todo. La función que lo decide es pura y la usan la
// pantalla (para resaltar) y cualquier aviso futuro, con el mismo número.
//
// 🔴 ¿PUEDE EL SISTEMA DARSE CUENTA SOLO DE QUE SWITCH YA FACTURÓ? — Dato
// para el día que se vuelva a evaluar (NO programado, por instrucción
// explícita de Daniel): NO es una señal confiable hoy. `sync-pedidos.ts` trae
// `/apipedido/lista` con `estatus: "Activo"` y BORRA de `switch_pedidos`
// cualquier pedido que deje de venir en esa lista — el comentario del propio
// sync asume que "lo que ya no está Activo (facturado) se va", pero es una
// suposición sin verificar: `docs/switch-panel.md` §15 dice que «anular un
// comprobante» no tiene permiso documentado («sigue sin respuesta»), y
// `switch-referencia.md` §1.5 anota que con OTRO endpoint (facturas) «nunca
// usamos estatus (¿excluye anuladas? la doc no lo dice)». El sync además
// BORRA la fila en vez de archivarla, así que un pedido que desaparece no
// deja rastro de SI se facturó o se anuló. No se pudo sondear el API en vivo
// para despejarlo (solo de noche, separado ≥15 min de otros crons de la
// misma empresa: Switch permite un solo token por usuario, y de día hubiera
// sacado a Daniel de su panel).
// ─────────────────────────────────────────────────────────────────────────────

import { B2B_EMPRESA_KEYS } from "@/lib/empresa-mapping";
import { empresasQueVe, horaPanama, MAX_BULTO, MIN_BULTO, veLaEmpresa, type Veredicto } from "./pedidos-bultos";

/**
 * `false` = la pantalla de hoy: asignación de bulto por artículo, TRES
 * estados del otro flujo (`PEDIDOS_BULTOS_2026_10`). Nace APAGADO — el
 * mockup va primero. Mismo escape que `PAPELES_ESTILO_UNICO` para sacar
 * capturas en LOCAL sin publicar nada: `NEXT_PUBLIC_PEDIDOS_FLUJO_SIMPLE=1`.
 * En producción manda la constante: la variable no existe en Vercel.
 */
export const PEDIDOS_FLUJO_SIMPLE_EN_CODIGO = false;

export const PEDIDOS_FLUJO_SIMPLE_2026_10: boolean =
  PEDIDOS_FLUJO_SIMPLE_EN_CODIGO ||
  (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_PEDIDOS_FLUJO_SIMPLE === "1");

export { empresasQueVe, veLaEmpresa };

// ─── Los TRES estados ────────────────────────────────────────────────────────

export const ESTADOS_FLUJO_SIMPLE = ["pendiente", "preparado", "recibido"] as const;
export type EstadoFlujoSimple = (typeof ESTADOS_FLUJO_SIMPLE)[number];

export const ROTULO_ESTADO_FLUJO_SIMPLE: Record<EstadoFlujoSimple, string> = {
  pendiente: "Pendiente",
  preparado: "Preparado",
  recibido: "Recibido",
};

export function esEstadoFlujoSimple(v: unknown): v is EstadoFlujoSimple {
  return typeof v === "string" && (ESTADOS_FLUJO_SIMPLE as readonly string[]).includes(v);
}

/** Sin fila en `pedidos_bodega_estado`, o un valor que no se reconoce, = «pendiente». */
export function estadoFlujoSimpleLeido(v: unknown): EstadoFlujoSimple {
  return esEstadoFlujoSimple(v) ? v : "pendiente";
}

const ORDEN = ESTADOS_FLUJO_SIMPLE;

/** El siguiente paso; `recibido` ya es el final. */
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

/** «Recibido» es trabajo de LA SECRETARIA: confirma que lo tiene en mano. */
export const ROLES_RECIBE_FLUJO_SIMPLE: readonly string[] = ["admin", "secretaria"];

export function rolesDelEstadoFlujoSimple(destino: EstadoFlujoSimple): readonly string[] {
  return destino === "preparado" ? ROLES_PREPARA_FLUJO_SIMPLE : ROLES_RECIBE_FLUJO_SIMPLE;
}

export interface QuienMarcaFlujoSimple {
  role: string | null | undefined;
  userName: string | null | undefined;
}

/**
 * ¿Puede esta persona mover ESTE pedido a ESE estado? Un solo paso adelante o
 * atrás, el rol tiene que estar en la lista del DESTINO, y la empresa tiene
 * que ser una de las suyas. Sin la regla de «otra persona»: Recibido no es
 * una auditoría del trabajo de bodega, es la secretaria confirmando que algo
 * le llegó a sus manos.
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

// ─── Un «Preparado» que nadie recibe tiene que verse ────────────────────────

/**
 * 🔴 Daniel: un pedido Preparado que nadie recibe tiene que verse. El tope:
 * medio día o un día de demora es normal (la secretaria no vive pegada a la
 * pantalla); a los DOS DÍAS completos ya se perdió un ciclo entero de
 * entrega-recepción y vale la pena marcarlo — no se espera a que pasen siete
 * días, que es cuando un pedido ya se perdió de vista del todo.
 */
export const PREPARADO_VIEJO_DIAS = 2;

/** Días enteros desde que se marcó Preparado (o cualquier fecha) hasta hoy. */
export function diasEnPreparado(preparadoEn: string, hoyIso: string): number {
  const ms = Date.parse(hoyIso) - Date.parse(preparadoEn);
  return Math.max(0, Math.floor(ms / 86_400_000));
}

/** ¿Lleva demasiado en Preparado sin que nadie lo reciba? */
export function preparadoViejo(dias: number): boolean {
  return dias >= PREPARADO_VIEJO_DIAS;
}

/** «Preparado hace 2 días» — la línea que ve la secretaria en su lista. */
export function lineaPreparadoHaceDias(dias: number): string {
  return dias === 0 ? "Preparado hoy" : dias === 1 ? "Preparado hace 1 día" : `Preparado hace ${dias} días`;
}

// ─── Quién marcó cada paso, y cuándo ─────────────────────────────────────────

export interface FirmasFlujoSimple {
  preparado_por: string | null;
  preparado_en: string | null;
  recibido_por: string | null;
  recibido_en: string | null;
}

/** «Julio · 10:42 a. m.» para la columna de la lista. `null` = no ocurrió. */
export function firmaEnColumnaFlujoSimple(por: string | null | undefined, en: string | null | undefined): string | null {
  const quien = (por ?? "").trim();
  return quien && en ? `${quien} · ${horaPanama(en)}` : null;
}

/** El ÚLTIMO paso dado, para la columna de la lista: «Recibido · Angela · 4:15 p. m.». */
export function ultimaFirmaFlujoSimple(f: FirmasFlujoSimple): string | null {
  const pasos: [EstadoFlujoSimple, string | null, string | null][] = [
    ["recibido", f.recibido_por, f.recibido_en],
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
