// ─────────────────────────────────────────────────────────────────────────────
// QUÉ ME COMPRA UN CLIENTE — el camino INVERSO del #591.
//
// El #591 dejó "descripción → clientes" (abrir una fila y ver quién la compra).
// Falta la vuelta: elegir un CLIENTE y que toda la tabla conteste *"¿qué me
// compra más éste?"* — y, de paso, *"¿qué me dejó de comprar?"*.
//
// ── 🔴 NI EL CRUCE NI EL SIGNO SE VUELVEN A DEFINIR ACÁ ─────────────────────
//
// · EL CRUCE ES POR CÓDIGO, y es EL MISMO del #591: la línea de factura se ata
//   a `switch_articulo_diario` por `codigo`, nunca por el texto de la
//   descripción. Está medido en aquel PR: por texto, 39 de 136 descripciones de
//   vistana quedaban sin un solo cliente ($184.164,23 = 7,66%); por código
//   quedan 11 ($11.435,32 = 0,48%). Lo único que cambia es la DIRECCIÓN en la
//   que se lee el mismo join.
//
// · EL AGRUPADO POR CLIENTE ES LA MISMA FUNCIÓN: se IMPORTA `agruparPorCliente`
//   del #591 y se la llama una vez por descripción. No es comodidad — es lo que
//   hace que el filtro y la pestaña «Quién lo compra» no puedan separarse: el
//   signo de la NC, la llave por `cliente_switch_id` (no por nombre), el
//   descarte del cero-en-las-dos y el orden salen de UN solo lugar. Si algún día
//   cambia, cambian los dos a la vez. Un segundo agrupado es el bug que este
//   repo ya pagó, y su firma es que las dos pantallas dicen números distintos
//   del mismo cliente.
//
// ⚠️ `switch_factura_lineas` NO TRAE COSTO. Acá no hay —ni puede haber— margen
// por cliente. Todo lo que sale de este módulo son PIEZAS y VENTA.
//
// Módulo PURO: ni Supabase, ni red, ni reloj.
// ─────────────────────────────────────────────────────────────────────────────

import {
  agruparPorCliente,
  type ClienteDeProducto,
  type LineaParaCliente,
} from "@/lib/ventas/productos-clientes";

/** Cuando el código de la línea no aparece en `switch_articulo_diario`. */
export const SIN_DESCRIPCION = "(sin descripción)";

/** Una línea de factura con su código — lo mínimo para armar la matriz. */
export interface LineaConCodigo extends LineaParaCliente {
  codigo: string | null;
}

/** Una celda de la matriz: qué compró UN cliente de UNA descripción. */
export interface FilaPorCliente {
  cliente_switch_id: number | null;
  cliente_nombre: string;
  descripcion: string;
  /** Piezas NETAS (la nota de crédito resta). */
  cantidad: number;
  /** Venta NETA. Nunca un margen: no hay costo en esta tabla. */
  venta: number;
}

/** Un cliente del desplegable: quién es y cuánto pesa en el período. */
export interface ClienteDelPeriodo {
  id: number | null;
  nombre: string;
  venta: number;
}

/** Lo que el cliente compró de una descripción, listo para pintar la fila. */
export interface CompraDelCliente {
  cantidad: number;
  venta: number;
}

/** Un renglón de «Dejó de comprar». */
export interface DejadoDeComprar {
  descripcion: string;
  /** Lo que ese cliente compraba en el período anterior. Es el orden de la lista. */
  venta: number;
  cantidad: number;
  /**
   * 🔴 LA DISTINCIÓN QUE HACE QUE LA LISTA SIRVA.
   *
   * `true`  → la empresa SIGUE vendiendo esa descripción (a otros): este cliente
   *           la dejó, y ahí sí hay a quién llamar.
   * `false` → la empresa NO la vende más EN ESTE PERÍODO. El cliente no dejó
   *           nada: se dejó de vender el producto. Sin esta distinción la lista
   *           manda a llamar a un cliente por algo que ya no existe.
   */
  seSigueVendiendo: boolean;
}

/**
 * `codigo` → la descripción con la que la PANTALLA nombra ese artículo.
 *
 * La fuente es `switch_articulo_diario`, la misma tabla que dibuja la tabla de
 * arriba, así que las filas del filtro caen sobre las filas que ya existen y no
 * estrenan un catálogo paralelo.
 *
 * 🩸 UN CÓDIGO PUEDE VIVIR BAJO DOS GRAFÍAS (el hallazgo del #591:
 * `Women-Small Leather Goods` y `Women-Small Leather`). Acá gana la MÁS
 * RECIENTE, que es una regla y no un empate resuelto al azar. El solape se
 * sigue DICIENDO donde ya se decía: el aviso ámbar del desplegable, que este
 * módulo no toca.
 */
export function mapaCodigoDescripcion(
  filas: readonly { codigo: string | null; descripcion: string | null; fecha: string | null }[],
): Map<string, string> {
  const mapa = new Map<string, string>();
  const masReciente = new Map<string, string>();
  for (const f of filas) {
    if (!f.codigo) continue;
    const vista = f.fecha ?? "";
    const previa = masReciente.get(f.codigo);
    if (previa != null && previa >= vista) continue;
    masReciente.set(f.codigo, vista);
    mapa.set(f.codigo, f.descripcion ?? SIN_DESCRIPCION);
  }
  return mapa;
}

/** Lo que devuelve el armado de la matriz. */
export interface Matriz {
  filas: FilaPorCliente[];
  /**
   * Líneas cuyo código no está en `switch_articulo_diario` de la ventana. No se
   * inventa una descripción con el texto de la línea: sería estrenar una segunda
   * forma de nombrar el mismo producto. Se CUENTAN, y quedan fuera.
   * (Medido el 25-ago-2026 sobre 12 meses: 3 de 14.474 en vistana, 7 de 23.246
   * en fashion_wear.)
   */
  sinDescripcion: number;
}

/**
 * Las líneas → una fila por (cliente, descripción).
 *
 * 🔑 Se agrupa por descripción y CADA GRUPO PASA POR `agruparPorCliente`, la
 * función del #591. Por eso el total de un cliente acá y su renglón en «Quién lo
 * compra» dan lo mismo por construcción, no por coincidencia.
 */
export function armarMatriz(
  lineas: readonly LineaConCodigo[],
  descripcionDeCodigo: ReadonlyMap<string, string>,
): Matriz {
  const porDescripcion = new Map<string, LineaConCodigo[]>();
  let sinDescripcion = 0;
  for (const l of lineas) {
    const d = l.codigo != null ? descripcionDeCodigo.get(l.codigo) : undefined;
    if (d == null) {
      sinDescripcion++;
      continue;
    }
    const bolsa = porDescripcion.get(d);
    if (bolsa) bolsa.push(l);
    else porDescripcion.set(d, [l]);
  }
  const filas: FilaPorCliente[] = [];
  for (const [descripcion, bolsa] of porDescripcion) {
    for (const c of agruparPorCliente(bolsa)) {
      filas.push({
        cliente_switch_id: c.cliente_switch_id,
        cliente_nombre: c.cliente_nombre,
        descripcion,
        cantidad: c.cantidad,
        venta: c.venta,
      });
    }
  }
  filas.sort((a, b) => b.venta - a.venta);
  return { filas, sinDescripcion };
}

/** La llave con la que se identifica un cliente en la pantalla. */
export function claveCliente(id: number | null): string {
  return id == null ? "sin-cliente" : String(id);
}

/**
 * El contenido del desplegable «Cliente», sacado de la matriz que YA viajó.
 *
 * No se consulta ningún directorio: los clientes que se ofrecen son
 * exactamente los que compraron algo en este período y en esta empresa. Un
 * desplegable con clientes que no tienen ni una fila abajo es un filtro que
 * devuelve la tabla vacía sin decir por qué.
 *
 * Del que más compra al que menos: con 66 clientes (vistana, 12 meses) el orden
 * alfabético deja al que importa en la mitad de la lista.
 */
export function clientesDelPeriodo(filas: readonly FilaPorCliente[]): ClienteDelPeriodo[] {
  const acc = new Map<string, ClienteDelPeriodo>();
  for (const f of filas) {
    const k = claveCliente(f.cliente_switch_id);
    const previo = acc.get(k);
    if (previo) {
      previo.venta += f.venta;
      if (f.cliente_nombre) previo.nombre = f.cliente_nombre;
    } else {
      acc.set(k, { id: f.cliente_switch_id, nombre: f.cliente_nombre, venta: f.venta });
    }
  }
  return [...acc.values()].sort((a, b) => b.venta - a.venta);
}

/** `descripción` → lo que ESE cliente compró. Todo en el navegador. */
export function comprasDe(
  filas: readonly FilaPorCliente[],
  clienteId: number | null,
): Map<string, CompraDelCliente> {
  const clave = claveCliente(clienteId);
  const m = new Map<string, CompraDelCliente>();
  for (const f of filas) {
    if (claveCliente(f.cliente_switch_id) !== clave) continue;
    const previo = m.get(f.descripcion);
    if (previo) {
      previo.cantidad += f.cantidad;
      previo.venta += f.venta;
    } else {
      m.set(f.descripcion, { cantidad: f.cantidad, venta: f.venta });
    }
  }
  return m;
}

/**
 * QUÉ DEJÓ DE COMPRAR: lo que compraba en el período anterior y en el actual no.
 *
 * Ordenado por CUÁNTA PLATA ERA, de mayor a menor — que es el orden en el que
 * uno decide a quién llamar.
 *
 * 🔴 `seVendeHoy` NO se consulta: son las descripciones que la tabla de arriba
 * ya tiene en pantalla para el período actual (todas las de la empresa, no las
 * del cliente). Con eso, la lista distingue las dos cosas que no son lo mismo:
 * el cliente dejó de comprar algo que se sigue vendiendo, o la empresa dejó de
 * vender el producto. Sin la distinción, la lista manda a llamar a un cliente
 * por algo que ya no existe.
 */
export function dejoDeComprar(
  actual: ReadonlyMap<string, CompraDelCliente>,
  previo: ReadonlyMap<string, CompraDelCliente>,
  seVendeHoy: ReadonlySet<string>,
): DejadoDeComprar[] {
  const salida: DejadoDeComprar[] = [];
  for (const [descripcion, antes] of previo) {
    // Sólo lo que ERA una compra de verdad: una devolución neta del período
    // anterior no es algo que se "dejó de comprar".
    if (antes.venta <= 0) continue;
    const hoy = actual.get(descripcion);
    if (hoy && hoy.venta > 0) continue;
    salida.push({
      descripcion,
      venta: antes.venta,
      cantidad: antes.cantidad,
      seSigueVendiendo: seVendeHoy.has(descripcion),
    });
  }
  return salida.sort((a, b) => b.venta - a.venta);
}

/** Piezas y venta de todo lo que el cliente compró — el renglón de totales. */
export function totalDeCompras(
  compras: ReadonlyMap<string, CompraDelCliente>,
): { cantidad: number; venta: number } {
  let cantidad = 0;
  let venta = 0;
  for (const c of compras.values()) {
    cantidad += c.cantidad;
    venta += c.venta;
  }
  return { cantidad, venta };
}

/** Re-export para que la pantalla no tenga que conocer dos módulos. */
export type { ClienteDeProducto };
