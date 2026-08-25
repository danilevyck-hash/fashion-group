// ─────────────────────────────────────────────────────────────────────────────
// QUIÉN COMPRA UNA DESCRIPCIÓN — módulo PURO.
//
// Daniel, textual (24-ago-2026), mirando el tab Productos: *"no veo por
// clientes, me gustaría saber por ejemplo, quién compra más una descripción, me
// explico?"*. O sea: se parte del PRODUCTO y se quiere ver a los CLIENTES.
//
// Acá vive el agrupado y nada más: ni Supabase, ni red, ni reloj. Se prueba sin
// credenciales y sin tocar producción.
//
// ── 🔴 EL SIGNO NO SE VUELVE A DEFINIR ACÁ ──────────────────────────────────
//
// Una nota de crédito RESTA, y la única definición de eso en este repo es
// `signoDeTipo()` (src/lib/switch-api/factura-lineas-parse.ts). Se IMPORTA. Una
// segunda definición del signo es el bug que este repo ya pagó dos veces, y su
// firma es inconfundible: la diferencia da EXACTO el doble de las NC.
//
// Y no es teórico en esta pantalla justamente: en Active Shoes las NC son el
// 13,4% de las unidades, y **City Mall David devolvió el 58% de lo que se le
// facturó a $30**. Un ranking BRUTO pondría a ese cliente muy por encima de
// donde va — que es exactamente la pregunta que Daniel viene a hacerle a esta
// lista.
// ─────────────────────────────────────────────────────────────────────────────

import { signoDeTipo } from "@/lib/switch-api/factura-lineas-parse";

/**
 * Lo MÍNIMO que hay que leer de `switch_factura_lineas` para armar la lista.
 *
 * Los números llegan de PostgREST como `string` cuando la columna es `numeric`,
 * así que el tipo los acepta como vienen y `numero()` los normaliza una sola
 * vez. Confiar en que ya son `number` es cómo un `NaN` entra a una suma y la
 * vuelve `NaN` entera sin un solo error a la vista.
 */
export interface LineaParaCliente {
  tipo_comprobante: string;
  cliente_switch_id: number | null;
  cliente_nombre: string | null;
  cantidad: number | string | null;
  subtotal_con_descuento: number | string | null;
}

/** Un renglón de la lista "quién lo compra". Cantidad y venta son NETAS. */
export interface ClienteDeProducto {
  cliente_switch_id: number | null;
  cliente_nombre: string;
  cantidad: number;
  venta: number;
}

/**
 * Una GRAFÍA distinta del mismo producto, y el código por el que se solapa.
 *
 * 🩸 En Switch el mismo producto está escrito de dos formas —
 * `Women-Small Leather Goods` y `Women-Small Leather`— y un código puede vivir
 * bajo las dos. La fila de la pantalla suma solo SU grafía; la lista de
 * clientes trae todas las líneas de esos códigos. Por eso la lista puede sumar
 * más que la fila, y por eso la pantalla lo tiene que DECIR.
 */
export interface GrafiaSolapada {
  /** La otra forma en que está escrito el mismo producto. */
  otra: string;
  /** Un código que aparece bajo las dos. */
  codigo: string;
}

/** Cuando el documento no trae cliente. No se inventa un nombre. */
export const CLIENTE_SIN_NOMBRE = "(sin cliente)";

function numero(v: number | string | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

/**
 * Las líneas de UNA descripción → un renglón por cliente, del que más compra al
 * que menos.
 *
 * 🔑 La llave es `cliente_switch_id`, NO el nombre: el nombre de un cliente se
 * edita en Switch y dos grafías del mismo cliente partirían su fila en dos. El
 * nombre que se muestra es el de la línea MÁS RECIENTE que se haya visto para
 * ese id — o sea el último con el que Switch lo nombró.
 *
 * 🩸 UN CLIENTE EN CERO NETO IGUAL EXISTE, pero no en cero de las DOS. Quien
 * compró 10 y devolvió 10 quedó en (0 u, $0) y no dice nada; se saca. Quien
 * quedó en (0 u, −$40) SÍ dice algo —una NC sin factura en la ventana— y se
 * queda, con su signo a la vista.
 */
export function agruparPorCliente(lineas: readonly LineaParaCliente[]): ClienteDeProducto[] {
  const porCliente = new Map<string, ClienteDeProducto>();
  for (const l of lineas) {
    const signo = signoDeTipo(l.tipo_comprobante);
    const clave = l.cliente_switch_id == null ? "sin-cliente" : String(l.cliente_switch_id);
    const previo = porCliente.get(clave);
    const nombre = (l.cliente_nombre ?? "").trim();
    const fila: ClienteDeProducto = previo ?? {
      cliente_switch_id: l.cliente_switch_id ?? null,
      cliente_nombre: nombre || CLIENTE_SIN_NOMBRE,
      cantidad: 0,
      venta: 0,
    };
    if (nombre) fila.cliente_nombre = nombre;
    fila.cantidad += signo * numero(l.cantidad);
    fila.venta += signo * numero(l.subtotal_con_descuento);
    porCliente.set(clave, fila);
  }
  return [...porCliente.values()]
    .filter(c => c.cantidad !== 0 || c.venta !== 0)
    .sort((a, b) => b.venta - a.venta);
}

/** Piezas y venta de TODA la lista — el pie del bloque y la base del %. */
export function totalDeClientes(
  clientes: readonly ClienteDeProducto[],
): { cantidad: number; venta: number } {
  return clientes.reduce(
    (t, c) => ({ cantidad: t.cantidad + c.cantidad, venta: t.venta + c.venta }),
    { cantidad: 0, venta: 0 },
  );
}

/**
 * Qué parte de la descripción se lleva este cliente.
 *
 * 🔑 LA BASE ES LA SUMA DE LA LISTA, no la venta de la fila de arriba, y es a
 * propósito: los dos números salen de fuentes distintas (la fila sale de
 * `switch_articulo_diario`, que incluye las transacciones de mostrador; la
 * lista sale del detalle de facturas y NC, que no las tiene). Con la venta de
 * la fila como base, los porcentajes NO sumarían 100 y el que mira tendría que
 * adivinar adónde se fue el resto. Con la suma de la lista, suman 100 y el
 * hueco se explica UNA vez, en el pie del bloque.
 *
 * `null` cuando la base no es positiva: un producto que quedó en devolución
 * neta no tiene "participación" que repartir, y un 0% sería mentira. Es la
 * misma regla con la que el margen es `null` con venta ≤ 0.
 */
export function participacion(venta: number, totalVenta: number): number | null {
  if (!Number.isFinite(venta) || !Number.isFinite(totalVenta)) return null;
  if (totalVenta <= 0) return null;
  return venta / totalVenta;
}

/** Participación lista para pintar. "—" cuando no aplica. */
export function fmtParticipacion(p: number | null | undefined): string {
  if (p == null) return "—";
  return (p * 100).toFixed(1) + "%";
}

// ─────────────────────────────────────────────────────────────────────────────
// Piezas de la LECTURA que igual son puras: viven acá para que sus candados
// corran sin credenciales y sin arrastrar Supabase.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cuántos códigos entran en un `.in()` del camino sin RPC.
 *
 * PostgREST recibe el filtro en la URL, y hay descripciones enormes: medido el
 * 25-ago-2026, "Women-Bags" de fashion_wear tiene 842 códigos, que en una sola
 * URL son ~10 KB — más de lo que conviene mandar por GET. En lotes de 150 el
 * peor caso son 6 lotes.
 */
export const CODIGOS_POR_LOTE = 150;

/**
 * El día de negocio de Panamá (UTC−5 fijo, sin horario de verano) como instante.
 *
 * `switch_factura_lineas.fecha` es `timestamptz` y el período llega como dos
 * DATE. Comparar un `timestamptz` contra un `date` pelado deja el borde en UTC,
 * o sea corrido 5 horas — el mismo gotcha que ya está anotado para las ventas.
 */
export function bordePanama(dia: string): string {
  return `${dia}T00:00:00-05:00`;
}

/** El día siguiente a `dia` (YYYY-MM-DD), para usar el borde como `<`. */
export function diaSiguiente(dia: string): string {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Trocea en lotes de `tamano`. Puro, para poder probarlo. */
export function enLotes<T>(items: readonly T[], tamano: number): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < items.length; i += tamano) lotes.push(items.slice(i, i + tamano));
  return lotes;
}

/**
 * Las grafías con las que esta descripción se solapa, sacadas de las filas
 * (codigo, descripcion) de `switch_articulo_diario` de esos mismos códigos.
 *
 * ⛔ NO NORMALIZA NADA — ni minúsculas, ni espacios, ni acentos. Normalizar
 * arreglaría 7 de los 36 casos medidos y dejaría 29 mintiendo igual, y sobre
 * todo estrenaría una SEGUNDA idea de "qué es la misma descripción" conviviendo
 * con la de la fila de arriba. Dos definiciones de lo mismo es el bug que este
 * repo ya pagó varias veces. La salida buena es corregir los nombres EN SWITCH;
 * cuando eso pase, el aviso desaparece solo.
 *
 * Una grafía por fila, con UN código de ejemplo — el aviso tiene que caber en
 * un renglón, no ser un volcado de 600 códigos.
 */
export function grafiasSolapadas(
  filas: readonly { codigo: string | null; descripcion: string | null }[],
  descripcionDeLaFila: string,
): GrafiaSolapada[] {
  const porGrafia = new Map<string, string>();
  for (const f of filas) {
    if (!f.codigo) continue;
    const d = f.descripcion ?? "(sin descripcion)";
    if (d === descripcionDeLaFila) continue;
    if (!porGrafia.has(d)) porGrafia.set(d, f.codigo);
  }
  return [...porGrafia.entries()]
    .map(([otra, codigo]) => ({ otra, codigo }))
    .sort((a, b) => a.otra.localeCompare(b.otra));
}
