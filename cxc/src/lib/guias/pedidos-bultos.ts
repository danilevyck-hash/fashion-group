// ─────────────────────────────────────────────────────────────────────────────
// Guías › Pedidos — TRES estados y el detalle con BULTOS (6-oct-2026)
//
// 🔴 Decisiones de Daniel, 6-oct-2026. Reemplazan las del 5-oct-2026, que
// quedan apagadas detrás de `PEDIDOS_BULTOS_2026_10` (`false` = la pantalla de
// hoy, con sus dos estados, intacta).
//
//   1. Los pedidos SIEMPRE nacen en Switch. Aquí no se crea ninguno.
//   2. Quién ve qué, POR EMPRESA y nunca por vendedor (`EMPRESAS_POR_PERSONA`).
//      El recorte es DURO, como el de Boston: si piden otra empresa, no la ven,
//      y lo decide el SERVIDOR.
//   3. Los estados pasan de dos a TRES:
//        Pendiente → Terminado (lo marca bodega) → Recibido (lo marca la
//        secretaria) → y de ahí sale a Etiquetas.
//      🔴 Daniel CAMBIA A PROPÓSITO su decisión del 5-oct-2026 («SOLO 2
//      estados»): «no se puede confiar solo en bodega». Quien marcó Terminado
//      solo puede marcar Recibido si es admin.
//      «Recibido» es por pedido COMPLETO: ahí ya está listo para imprimir
//      etiqueta y facturar.
//   4. El detalle del pedido se ve como el PDF de pedido de Switch, SIN la
//      columna «Código barra»: Código · Referencia · Descripción · Cantidad ·
//      Precio · Total · Bulto. Bodega selecciona varias líneas con casillas y
//      toca «Poner en bulto…», escribe el número y esas líneas quedan ahí.
//   5. Imprimir: un papel ordenado por bulto, con el estilo de papel de la casa.
//   6. Al marcar «Recibido» se crea el envío de Etiquetas ya puesto.
//
// 🔑 LO MEDIDO (6-oct-2026): un envío real tuvo **416 bultos y 56 líneas**, así
// que nada de esta pantalla puede ser O(bultos × líneas) ni pedir una lista de
// 416 opciones: el bulto se ESCRIBE, no se elige de un desplegable.
//
// 🔑 SWITCH NO MANDA TALLA NI COLOR SEPARADOS: van dentro de `descripcion` y
// así se muestran. No se parten ni se adivinan.
//
// ⚠️ «Referencia» NO EXISTE en el API de Switch (§5.37 `/apipedido/info` trae
// `codigoArticulo`, `codigobarra`, `descripcion`, `cantidad`, `precio`,
// `descuento`; ningún campo «referencia» — tampoco `/apiarticulos/lista` ni
// `/info`). Se DERIVA del código con la MISMA regla ya aprobada de Consulta de
// artículos (`modeloDe`, quitar los 3 últimos caracteres, candado
// `referencia-modelo-3-caracteres`). 🔴 Decisión pendiente de Daniel: ver
// `referenciaDeCodigo` abajo.
// ─────────────────────────────────────────────────────────────────────────────

import { B2B_EMPRESA_KEYS } from "@/lib/empresa-mapping";
import { modeloDe } from "@/lib/ventas/referencia";

/**
 * 🔴 `false` = la pantalla de hoy: dos estados (Pendiente/Preparado), sin
 * detalle, sin bultos, sin enlace a Etiquetas. Se prende con el «sí» de Daniel.
 */
export const PEDIDOS_BULTOS_EN_CODIGO = false;

/**
 * El mismo escape que `PAPELES_ESTILO_UNICO`: se puede prender en LOCAL con
 * `NEXT_PUBLIC_PEDIDOS_BULTOS=1` para sacar las capturas del «después» sin
 * tocar el código ni publicar nada. 🔴 En producción manda la constante de
 * arriba: la variable no existe en Vercel.
 */
export const PEDIDOS_BULTOS_2026_10: boolean =
  PEDIDOS_BULTOS_EN_CODIGO ||
  (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_PEDIDOS_BULTOS === "1");

// ─── 2 · Quién ve qué, POR EMPRESA ───────────────────────────────────────────

/**
 * Las empresas de Pedidos que ve cada PERSONA, por su nombre de usuario.
 * Lista ESCRITA A MANO, como `empresa-fiscal.ts` y `DESPACHADORES_BASE`: no se
 * deriva del rol ni del vendedor de Switch (Daniel, 6-oct-2026: «por empresa,
 * no por vendedor»).
 *
 * 🔴 Quien NO está en esta lista ve las 6, como hoy (falla ABIERTA): el recorte
 * es para las personas que Daniel nombró, no un permiso nuevo para todos.
 * Admin pasa siempre, como en todo el sistema.
 */
export const EMPRESAS_POR_PERSONA: Readonly<Record<string, readonly string[]>> = {
  julio: ["fashion_wear", "fashion_shoes", "active_shoes", "active_wear", "joystep"],
  rodrigo: ["vistana"],
  jorman: ["vistana"],
};

/** Las empresas que esta persona puede ver. Admin y los no listados, las 6. */
export function empresasQueVe(userName: string | null | undefined, role: string | null | undefined): readonly string[] {
  if (role === "admin") return B2B_EMPRESA_KEYS;
  const recorte = EMPRESAS_POR_PERSONA[(userName ?? "").trim().toLowerCase()];
  return recorte ?? B2B_EMPRESA_KEYS;
}

/** ¿Puede esta persona tocar un pedido de esa empresa? Lo decide el SERVIDOR. */
export function veLaEmpresa(
  empresaKey: string,
  userName: string | null | undefined,
  role: string | null | undefined,
): boolean {
  return empresasQueVe(userName, role).includes(empresaKey);
}

// ─── 3 · Los TRES estados ────────────────────────────────────────────────────

export const ESTADOS_BULTOS = ["pendiente", "terminado", "recibido"] as const;
export type EstadoBultos = (typeof ESTADOS_BULTOS)[number];

export const ROTULO_ESTADO_BULTOS: Record<EstadoBultos, string> = {
  pendiente: "Pendiente",
  terminado: "Terminado",
  recibido: "Recibido",
};

export function esEstadoBultos(v: unknown): v is EstadoBultos {
  return typeof v === "string" && (ESTADOS_BULTOS as readonly string[]).includes(v);
}

/**
 * Lo guardado hoy es `pendiente` | `preparado`. 🔴 Falla ABIERTA mientras la
 * migración no corra: «preparado» se LEE como «terminado», que es el mismo
 * lugar del flujo (bodega terminó de preparar). Nada se pierde y nada se pisa.
 */
export function estadoLeido(v: unknown): EstadoBultos {
  if (v === "preparado") return "terminado";
  return esEstadoBultos(v) ? v : "pendiente";
}

/** El siguiente paso del flujo; `recibido` ya es el final. */
export function siguienteEstado(e: EstadoBultos): EstadoBultos | null {
  return e === "pendiente" ? "terminado" : e === "terminado" ? "recibido" : null;
}

/** El paso de atrás, para deshacer un toque. `pendiente` no tiene atrás. */
export function estadoAnterior(e: EstadoBultos): EstadoBultos | null {
  return e === "recibido" ? "terminado" : e === "terminado" ? "pendiente" : null;
}

/** Bodega marca Terminado: los mismos que hoy marcan en Pedidos. */
export const ROLES_TERMINADO: readonly string[] = ["admin", "secretaria", "bodega", "vendedor"];

/**
 * 🔴 Recibido lo marca LA SECRETARIA (y admin), nunca bodega: «no se puede
 * confiar solo en bodega» (Daniel, 6-oct-2026).
 */
export const ROLES_RECIBIDO: readonly string[] = ["admin", "secretaria"];

export function rolesDelEstado(destino: EstadoBultos): readonly string[] {
  return destino === "recibido" ? ROLES_RECIBIDO : ROLES_TERMINADO;
}

export interface QuienMarca {
  role: string | null | undefined;
  userName: string | null | undefined;
}

export type Veredicto = { ok: true } | { ok: false; error: string };

/**
 * ¿Puede esta persona mover ESTE pedido a ESE estado? Una sola función, que
 * leen la pantalla y el servidor.
 *
 * Reglas, todas del 6-oct-2026:
 *   1. Solo se avanza o se retrocede UN paso (sin saltarse Terminado).
 *   2. El rol tiene que estar en la lista del estado DESTINO.
 *   3. 🔴 Quien marcó Terminado puede marcar Recibido **solo si es admin**: en
 *      cualquier otro caso tiene que marcarlo otra persona.
 *   4. Y la empresa del pedido tiene que ser una de las suyas.
 */
export function puedeMover(
  args: {
    desde: EstadoBultos;
    hasta: EstadoBultos;
    empresa_key: string;
    /** Quién dejó el pedido en «Terminado», si alguien lo hizo. */
    terminado_por: string | null;
  },
  quien: QuienMarca,
): Veredicto {
  const { desde, hasta, empresa_key, terminado_por } = args;
  if (desde === hasta) return { ok: false, error: "El pedido ya está así" };
  if (siguienteEstado(desde) !== hasta && estadoAnterior(desde) !== hasta) {
    return { ok: false, error: "Ese pedido tiene que pasar primero por Terminado" };
  }
  if (!veLaEmpresa(empresa_key, quien.userName, quien.role)) {
    return { ok: false, error: "Ese pedido no es de una de tus empresas" };
  }
  if (!quien.role || !rolesDelEstado(hasta).includes(quien.role)) {
    return {
      ok: false,
      error: hasta === "recibido" ? "«Recibido» lo marca la secretaria" : "No puedes marcar pedidos",
    };
  }
  if (hasta === "recibido" && quien.role !== "admin" && mismaPersona(terminado_por, quien.userName)) {
    return { ok: false, error: "«Recibido» lo marca otra persona, no quien lo terminó" };
  }
  return { ok: true };
}

/** Igualdad EXACTA normalizada (minúsculas y espacios), nunca por parecido. */
export function mismaPersona(a: string | null | undefined, b: string | null | undefined): boolean {
  const n = (s: string | null | undefined) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  const x = n(a);
  return !!x && x === n(b);
}

// ─── 4 · El detalle con bultos ───────────────────────────────────────────────

/** Una línea del pedido, como la deja `/apipedido/info` en `pedidos_lineas`. */
export interface LineaPedido {
  /** `codigoBarraId` de Switch: la identidad de la línea dentro del pedido. */
  codigo_barra_id: number;
  codigo: string;
  /** Talla y color vienen ADENTRO (Switch no los manda aparte). */
  descripcion: string;
  cantidad: number;
  precio: number;
  /** El bulto donde quedó, o `null` si todavía no se asignó. */
  bulto: number | null;
}

/** Las columnas de la pantalla y del papel, en el orden del PDF de Switch. */
export const COLUMNAS_DETALLE = [
  "Código",
  "Referencia",
  "Descripción",
  "Cantidad",
  "Precio",
  "Total",
  "Bulto",
] as const;

/**
 * La «Referencia» del PDF de Switch, que el API no manda: el MODELO del código,
 * con la regla ya aprobada de Consulta de artículos (quitar los 3 últimos
 * caracteres). `NB2570001` → `NB2570`.
 *
 * 🔴 PENDIENTE DE DANIEL: si la «Referencia» que él ve en el papel de Switch es
 * otro dato (uno que solo vive en el panel web), esta columna sale de aquí y
 * hay que traerla de otro lado. No se inventa nada más.
 */
export function referenciaDeCodigo(codigo: string): string {
  const c = (codigo ?? "").trim();
  return c ? modeloDe(c) : "";
}

/** Cantidad × precio, a dos decimales. No se recalcula nada más de Switch. */
export function totalDeLinea(l: Pick<LineaPedido, "cantidad" | "precio">): number {
  return Math.round(l.cantidad * l.precio * 100) / 100;
}

export const MIN_BULTO = 1;
/** Un envío real tuvo 416 bultos; el tope deja aire y atrapa un dedazo. */
export const MAX_BULTO = 9999;

/** El número que se escribió en «Poner en bulto…». Entero de 1 a 9999. */
export function validarBulto(v: unknown): Veredicto & { valor?: number } {
  const n = typeof v === "number" ? v : Number(String(v ?? "").trim());
  if (!Number.isInteger(n) || n < MIN_BULTO || n > MAX_BULTO) {
    return { ok: false, error: `Escribe el número del bulto, de ${MIN_BULTO} a ${MAX_BULTO}` };
  }
  return { ok: true, valor: n };
}

/**
 * «18 de 24 artículos asignados · 6 bultos» — la línea de arriba del detalle.
 * Cuenta LÍNEAS (cada línea es un artículo), no piezas.
 */
export function resumenAsignacion(lineas: readonly Pick<LineaPedido, "bulto">[]): string {
  const total = lineas.length;
  const puestas = lineas.filter((l) => l.bulto != null).length;
  const bultos = new Set(lineas.map((l) => l.bulto).filter((b): b is number => b != null)).size;
  const art = `${puestas} de ${total} ${total === 1 ? "artículo" : "artículos"} ${puestas === 1 ? "asignado" : "asignados"}`;
  return `${art} · ${bultos} ${bultos === 1 ? "bulto" : "bultos"}`;
}

/** ¿Está el pedido entero en algún bulto? Es lo que habilita «Recibido». */
export function todoAsignado(lineas: readonly Pick<LineaPedido, "bulto">[]): boolean {
  return lineas.length > 0 && lineas.every((l) => l.bulto != null);
}

/** Cuántos bultos distintos tiene el pedido: los `cajas` del envío de Etiquetas. */
export function cuantosBultos(lineas: readonly Pick<LineaPedido, "bulto">[]): number {
  return new Set(lineas.map((l) => l.bulto).filter((b): b is number => b != null)).size;
}

export interface BultoDelPapel {
  bulto: number;
  lineas: LineaPedido[];
}

/**
 * Los bultos para el papel: del 1 al último, cada uno con sus líneas en el
 * orden del pedido. Lo que todavía no tiene bulto queda FUERA y se dice en el
 * papel: una hoja no puede callar que falta mercancía.
 *
 * O(n log n) sobre las líneas, nunca sobre los bultos (416 medidos).
 */
export function bultosDelPapel(lineas: readonly LineaPedido[]): BultoDelPapel[] {
  const porBulto = new Map<number, LineaPedido[]>();
  for (const l of lineas) {
    if (l.bulto == null) continue;
    const g = porBulto.get(l.bulto);
    if (g) g.push(l);
    else porBulto.set(l.bulto, [l]);
  }
  return [...porBulto.entries()].sort((a, b) => a[0] - b[0]).map(([bulto, ls]) => ({ bulto, lineas: ls }));
}

/** Las líneas que todavía no están en ningún bulto, en el orden del pedido. */
export function sinBulto(lineas: readonly LineaPedido[]): LineaPedido[] {
  return lineas.filter((l) => l.bulto == null);
}

/**
 * «Pedido 2732 · Fashion Wear · D-25 OUTLET DAVID» — el título del papel de
 * bultos. La fecha de impresión la pone la cabecera del papel de la casa.
 */
export function tituloPapelBultos(secuencial: string, empresa: string, cliente: string): string {
  return `Pedido ${secuencial} · ${empresa} · ${cliente}`;
}

// ─── 6 · El envío de Etiquetas que nace al marcar «Recibido» ─────────────────

/** 15 letras es el tope de la nota de una etiqueta (`MAX_NOTA`). */
export const MAX_NOTA_ETIQUETA = 15;

/**
 * La nota del traslado que se crea en Etiquetas: «PEDIDO 2732», recortada al
 * tope. Un pedido no tiene factura todavía (Activo = falta facturar), así que
 * el envío entra por el camino de TRASLADO, que sí acepta un pedido sin factura.
 */
export function notaDelPedido(secuencial: string): string {
  return `PEDIDO ${String(secuencial ?? "").trim()}`.toUpperCase().slice(0, MAX_NOTA_ETIQUETA).trim();
}
