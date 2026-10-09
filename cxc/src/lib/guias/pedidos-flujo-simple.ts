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
 * 🔴 PRENDIDO el 7-oct-2026 con el «sí» de Daniel, después de ver el mockup
 * HOY vs RECOMENDACIÓN con capturas reales. `false` sigue siendo la pantalla
 * de antes: asignación de bulto por artículo, tres estados del otro flujo
 * (`PEDIDOS_BULTOS_2026_10`) — es la vuelta atrás, con el mismo escape que
 * `PAPELES_ESTILO_UNICO` para sacar capturas en LOCAL sin publicar nada:
 * `NEXT_PUBLIC_PEDIDOS_FLUJO_SIMPLE=1`. En producción manda esta constante.
 */
export const PEDIDOS_FLUJO_SIMPLE_EN_CODIGO = true;

export const PEDIDOS_FLUJO_SIMPLE_2026_10: boolean =
  PEDIDOS_FLUJO_SIMPLE_EN_CODIGO ||
  (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_PEDIDOS_FLUJO_SIMPLE === "1");

export { empresasQueVe, veLaEmpresa };

// ─── Los CUATRO estados ──────────────────────────────────────────────────────
//
// 🔴 9-oct-2026, Daniel: se suma «En preparación» entre Pendiente y Preparado.
// Lo marca BODEGA para confirmar que la secretaria le entregó la hoja del
// pedido (que el papel físico llegó a bodega). Bodega puede tener varios a la
// vez. Los pedidos que ya estaban en Preparado o Recibido se quedan donde
// están: ninguna fila se mueve.

export const ESTADOS_FLUJO_SIMPLE = ["pendiente", "en_preparacion", "preparado", "recibido"] as const;
export type EstadoFlujoSimple = (typeof ESTADOS_FLUJO_SIMPLE)[number];

export const ROTULO_ESTADO_FLUJO_SIMPLE: Record<EstadoFlujoSimple, string> = {
  pendiente: "Pendiente",
  en_preparacion: "En preparación",
  preparado: "Preparado",
  recibido: "Recibido",
};

/** El rótulo de cada pestaña de la lista (el plural no sale de pegar una «s»). */
export const PESTANA_FLUJO_SIMPLE: Record<EstadoFlujoSimple, string> = {
  pendiente: "Pendientes",
  en_preparacion: "En preparación",
  preparado: "Preparados",
  recibido: "Recibidos",
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

/**
 * 🔴 «PREPARADO» LO MARCA SOLO BODEGA (y admin) — Daniel, 7-oct-2026, segunda
 * vuelta: «¿por qué Ángela puede preparar un pedido en su sistema? Ya
 * habíamos hablado del tema». La lista venía copiada de la del otro flujo
 * (`ROLES_PREPARADO` en `pedidos-bultos.ts`, que sí deja preparar a la
 * secretaria); acá los dos pasos son la doble firma, así que cada uno lo
 * marca alguien DISTINTO: bodega prepara, secretaria recibe.
 */
export const ROLES_PREPARA_FLUJO_SIMPLE: readonly string[] = ["admin", "bodega"];

/** «Recibido» es trabajo de LA SECRETARIA: confirma que lo tiene en mano. */
export const ROLES_RECIBE_FLUJO_SIMPLE: readonly string[] = ["admin", "secretaria"];

/**
 * La unión de las dos listas de arriba. La usa el guard ANCHO del PATCH
 * (`/api/guias/pedidos`): ahí solo se pregunta «¿puede tocar esta ruta?»,
 * nunca «¿puede marcar ESTE estado?» —eso lo decide `puedeMoverFlujoSimple`
 * con el destino—. Con `ROLES_PREPARA_FLUJO_SIMPLE` sola (ya sin secretaria)
 * esa puerta ancha dejaría afuera a la secretaria también para marcar
 * Recibido.
 */
export const ROLES_FLUJO_SIMPLE_TODAS: readonly string[] = [
  ...new Set([...ROLES_PREPARA_FLUJO_SIMPLE, ...ROLES_RECIBE_FLUJO_SIMPLE]),
];

/** «En preparación» y «Preparado» los marca bodega; «Recibido», la secretaria. */
export function rolesDelEstadoFlujoSimple(destino: EstadoFlujoSimple): readonly string[] {
  return destino === "recibido" ? ROLES_RECIBE_FLUJO_SIMPLE : ROLES_PREPARA_FLUJO_SIMPLE;
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
  // 🔴 El rol lo decide el PASO que se toca, no solo el destino: deshacer
  // «Recibido» (volver a Preparado) es de la secretaria; deshacer «Preparado»
  // (volver a En preparación) y «En preparación» (volver a Pendiente), de bodega.
  const paso: EstadoFlujoSimple = ORDEN.indexOf(desde) > ORDEN.indexOf(hasta) ? desde : hasta;
  if (!quien.role || !rolesDelEstadoFlujoSimple(paso).includes(quien.role)) {
    // 🩸 7-oct-2026: Ángela leyó «Ese paso lo marca la secretaria» siendo la
    // secretaria — su pestaña decía Angela, pero el navegador ya tenía abierta
    // la sesión de jorman (bodega). El rechazo nombra la sesión con que llegó
    // la petición, para que nunca contradiga a quien lo lee.
    const quienEs = quien.userName ? `${quien.userName} (${quien.role ?? "sin rol"})` : (quien.role ?? "sin rol");
    const quienMarca =
      paso === "recibido" ? "«Recibido» lo marca la secretaria" : `«${ROTULO_ESTADO_FLUJO_SIMPLE[paso]}» lo marca bodega`;
    return { ok: false, error: `${quienMarca}. La sesión abierta es de ${quienEs}.` };
  }
  return { ok: true };
}

// ─── Lo que se escribe en la fila al dar (o deshacer) un paso ───────────────

export interface ColumnasDelPaso {
  estado: EstadoFlujoSimple;
  bultos?: number | null;
  en_preparacion_por?: string | null;
  en_preparacion_en?: string | null;
  espera_muestra_desde?: string | null;
  espera_muestra_por?: string | null;
  espera_muestra_nota?: string | null;
  preparado_por?: string | null;
  preparado_en?: string | null;
  recibido_por?: string | null;
  recibido_en?: string | null;
}

/**
 * 🔴 DESHACER UN PASO (Daniel, 8-oct-2026: «¿cómo se deshace si se pasó de un
 * paso a otro por error?»). Una sola función para avanzar y retroceder; la
 * usan el PATCH de la pantalla y cualquier corrección hecha a mano, para que
 * las dos escriban exactamente lo mismo.
 *   · Avanzar firma SU columna (y Preparado guarda los bultos).
 *   · Volver a Preparado borra SOLO la firma de Recibido: la de bodega queda.
 *   · Volver a Pendiente deja la fila como nueva —sin bultos ni firmas—, porque
 *     al prepararlo de nuevo se anota otra vez el número. La firma de quien lo
 *     había marcado NO se pierde: queda en el registro de actividad (`antes`).
 * Sin validar permisos: eso es `puedeMoverFlujoSimple`, antes de llamar aquí.
 */
export function columnasDelPaso(
  desde: EstadoFlujoSimple,
  hasta: EstadoFlujoSimple,
  quien: string,
  ahora: string,
  bultos?: number | null,
): ColumnasDelPaso {
  if (hasta === "pendiente") {
    return {
      estado: hasta, bultos: null, preparado_por: null, preparado_en: null, recibido_por: null, recibido_en: null,
      en_preparacion_por: null, en_preparacion_en: null, ...SIN_ESPERA_MUESTRA,
    };
  }
  if (hasta === "en_preparacion") {
    // Volver desde Preparado borra los bultos y la firma de Preparado; la de
    // «En preparación» queda (la hoja sigue en bodega).
    return desde === "preparado"
      ? { estado: hasta, bultos: null, preparado_por: null, preparado_en: null }
      : { estado: hasta, en_preparacion_por: quien, en_preparacion_en: ahora };
  }
  if (hasta === "preparado") {
    // 🔴 Marcar Preparado QUITA SOLA la espera de muestra (Daniel, 9-oct-2026).
    return desde === "recibido"
      ? { estado: hasta, recibido_por: null, recibido_en: null }
      : { estado: hasta, bultos: bultos ?? null, preparado_por: quien, preparado_en: ahora, ...SIN_ESPERA_MUESTRA };
  }
  return { estado: hasta, recibido_por: quien, recibido_en: ahora };
}

// ─── «En espera de muestra» ──────────────────────────────────────────────────
//
// 🔴 Daniel, 9-oct-2026: mientras un pedido está En preparación, bodega puede
// marcar que le faltan piezas finales que tiene que traer de otro lado. Es EL
// ÚNICO motivo, así que es un solo botón (sin lista) y una nota opcional
// (qué pieza falta). NO es un estado: es una marca sobre «En preparación».
// Solo existe ahí — lo garantiza también un CHECK en la base — y marcar
// Preparado la quita sola.

const SIN_ESPERA_MUESTRA = { espera_muestra_desde: null, espera_muestra_por: null, espera_muestra_nota: null } as const;

export const MAX_NOTA_MUESTRA = 200;

/** ¿Puede esta persona poner o quitar «En espera de muestra» a este pedido? */
export function puedeMarcarEsperaMuestra(
  args: { estado: EstadoFlujoSimple; empresa_key: string },
  quien: QuienMarcaFlujoSimple,
): Veredicto {
  if (args.estado !== "en_preparacion") {
    return { ok: false, error: "«En espera de muestra» solo se marca en un pedido En preparación" };
  }
  if (!veLaEmpresa(args.empresa_key, quien.userName, quien.role)) {
    return { ok: false, error: "Ese pedido no es de una de tus empresas" };
  }
  if (!quien.role || !ROLES_PREPARA_FLUJO_SIMPLE.includes(quien.role)) {
    return { ok: false, error: "«En espera de muestra» lo marca bodega" };
  }
  return { ok: true };
}

/** Las columnas al poner (`true`) o quitar (`false`) la espera. La nota se recorta. */
export function columnasEsperaMuestra(
  poner: boolean,
  quien: string,
  ahora: string,
  nota?: unknown,
): Pick<ColumnasDelPaso, "espera_muestra_desde" | "espera_muestra_por" | "espera_muestra_nota"> {
  if (!poner) return { ...SIN_ESPERA_MUESTRA };
  const n = typeof nota === "string" ? nota.trim().slice(0, MAX_NOTA_MUESTRA) : "";
  return { espera_muestra_desde: ahora, espera_muestra_por: quien, espera_muestra_nota: n || null };
}

/**
 * «En espera de muestra · Julio · 2:15 p. m. · hace 2 días» — la línea ámbar de
 * la fila, con la misma firma que los otros pasos (Daniel, 9-oct-2026: «que se
 * pueda ver la marcación de bodega»). Sin firma guardada, solo los días.
 */
export function lineaEsperaMuestra(dias: number, por?: string | null, en?: string | null): string {
  const cuando = dias === 0 ? "desde hoy" : dias === 1 ? "hace 1 día" : `hace ${dias} días`;
  const firma = firmaEnColumnaFlujoSimple(por, en);
  return `En espera de muestra · ${firma ? `${firma} · ` : ""}${cuando}`;
}

/** ¿Este cambio es deshacer un paso (ir hacia atrás)? */
export function esDeshacerFlujoSimple(desde: EstadoFlujoSimple, hasta: EstadoFlujoSimple): boolean {
  return estadoAnteriorFlujoSimple(desde) === hasta;
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
  en_preparacion_por?: string | null;
  en_preparacion_en?: string | null;
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
    ["en_preparacion", f.en_preparacion_por ?? null, f.en_preparacion_en ?? null],
  ];
  for (const [paso, por, en] of pasos) {
    const t = firmaEnColumnaFlujoSimple(por, en);
    if (t) return `${ROTULO_ESTADO_FLUJO_SIMPLE[paso]} · ${t}`;
  }
  return null;
}

/** Que no se nos olviden las 6 del grupo en ningún camino de respaldo. */
export const EMPRESAS_PEDIDOS_FLUJO_SIMPLE = B2B_EMPRESA_KEYS;
