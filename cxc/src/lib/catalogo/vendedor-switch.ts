// ─────────────────────────────────────────────────────────────────────────────
// El VENDEDOR de Switch de un pedido — elegible, con default (12-ago-2026).
//
// Hasta hoy el vendedor era AUTOMÁTICO y solo automático: salía de
// `fg_user_switch_vendedor` (user_id + empresa_key) y no había forma de
// cambiarlo. Daniel: *"y que al momento de hacer el pedido en todos los
// catalogos, que se pueda poder cambiar de vendedor, eso es posible?"*.
//
// 🔴 LA DIFERENCIA CON EL CLIENTE ES EL DEFAULT, Y NO ES UN DETALLE. Al cliente
// hay que elegirlo SIEMPRE (`ClienteSwitchPicker` no preselecciona nada) porque
// no existe un cliente correcto por omisión. Acá sí: el vendedor mapeado a tu
// login ES el correcto en el 99% de los pedidos. Por eso viene puesto y
// cambiarlo es opcional — pedir un toque más en cada pedido para reconfirmar lo
// que ya estaba bien sería fricción pura.
//
// 🔴 EL VENDEDOR MANDA EN LAS COMISIONES. Daniel lo sabe y lo aceptó. Lo que se
// hace acá para que nadie mande un pedido sin darse cuenta de a nombre de quién
// va es que el vendedor se VEA (bloque propio en el detalle y en el checkout,
// igual que el cliente), no bloquearlo con confirmaciones.
//
// ⚠️ SESIÓN ÚNICA POR EMPRESA. La lista de vendedores no vive en ninguna tabla
// local: sale EN VIVO de `/apivendedor/lista` de la instancia Switch de esa
// empresa (es la MISMA fuente que ya alimenta Sistema → Usuarios, ver
// `/api/admin/switch-vendedores`). Switch admite UN solo login por empresa, así
// que la lista se cachea acá con el mismo patrón de `permiso-precio.ts`: una
// consulta por empresa cada 15 minutos, no una por apertura del selector ni —
// mucho menos— una por tecla.
//
// 🩸 EL ERROR SIRVE LA LISTA VIEJA (`fresco:false`) en vez de romper. El
// catálogo de vendedores de una empresa cambia una vez cada varios meses; si
// Switch tose, servir la lista de hace 20 minutos deja al vendedor armar su
// pedido, mientras que fallar lo deja sin poder elegir. Solo cuando NUNCA se
// pudo leer se propaga el error.
// ─────────────────────────────────────────────────────────────────────────────

import type { MarcaConfig } from "@/lib/catalogo/marcas";

/** Cuánto vale una lista antes de volver a preguntarle a Switch. */
export const TTL_VENDEDORES_MS = 15 * 60 * 1000;

/** Páginas máximas del barrido (50 por página) — el mismo tope que ya usaba
 *  Sistema → Usuarios. */
export const VENDEDORES_MAX_PAGINAS = 10;
export const VENDEDORES_POR_PAGINA = 50;

export interface VendedorSwitch {
  id: number;
  nombre: string;
}

export interface ListaVendedores {
  vendedores: VendedorSwitch[];
  /** ¿La lista salió de Switch ahora, o es la última buena que había? */
  fresco: boolean;
  /** ¿Esta llamada abrió sesión contra Switch? (para el `logout` del route). */
  desdeSwitch: boolean;
}

interface Entrada {
  vendedores: VendedorSwitch[];
  expira: number;
}

const cache = new Map<string, Entrada>();

/**
 * Vendedores de una empresa, cacheados.
 *
 * `traer` se inyecta (no se importa el client de Switch acá) para que este
 * módulo siga siendo trivial de testear — mismo patrón que `permisoCambiarPrecio`.
 */
export async function vendedoresDeEmpresa(
  empresaKey: string,
  traer: () => Promise<VendedorSwitch[]>,
  ahora: number = Date.now(),
): Promise<ListaVendedores> {
  const cacheado = cache.get(empresaKey);
  if (cacheado && cacheado.expira > ahora) {
    return { vendedores: cacheado.vendedores, fresco: true, desdeSwitch: false };
  }

  try {
    const vendedores = ordenarVendedores(await traer());
    cache.set(empresaKey, { vendedores, expira: ahora + TTL_VENDEDORES_MS });
    return { vendedores, fresco: true, desdeSwitch: true };
  } catch (e) {
    // Lista vieja antes que nada: ver la nota de cabecera.
    if (cacheado) return { vendedores: cacheado.vendedores, fresco: false, desdeSwitch: true };
    throw e;
  }
}

/** Orden alfabético estable (el mismo que ya mostraba Sistema → Usuarios). */
export function ordenarVendedores(vendedores: VendedorSwitch[]): VendedorSwitch[] {
  return [...vendedores].sort((a, b) => a.nombre.localeCompare(b.nombre) || a.id - b.id);
}

/** Solo para tests: vacía el caché entre casos. */
export function _resetCacheVendedores(): void {
  cache.clear();
}

/**
 * Normaliza el `vendedorSwitchId` del body.
 *
 * 🔴 A DIFERENCIA DEL CLIENTE, `null` NO ES UNA ELECCIÓN VÁLIDA. En el cliente
 * `null` significa Contado, que es un cliente de verdad; acá significaría "sin
 * vendedor", y un pedido sin vendedor no se puede enviar a Switch (o peor: cae
 * en el fallback de otra marca y la comisión se la lleva quien no vendió).
 * Quitar el vendedor no es una operación que exista.
 */
export function parsearVendedorSwitchId(
  valor: unknown,
): { ok: true; id: number } | { ok: false; error: string } {
  if (valor == null) return { ok: false, error: "Elige el vendedor del pedido" };
  const n = Number(valor);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
    return { ok: false, error: "vendedorSwitchId inválido" };
  }
  return { ok: true, id: n };
}

/** El vendedor de Switch que tiene mapeado UNA persona en UNA empresa. */
export interface VendedorMapeado {
  id: number;
  /** El nombre TAL CUAL está en la tabla — ver la advertencia de abajo. */
  nombre: string | null;
}

/**
 * "¿Cuál es MI vendedor en esta empresa?" — la definición ÚNICA.
 *
 * 🔴 UNA SOLA CONSULTA PARA TODOS LOS CAMINOS. Lo usan el checkout (el vendedor
 * por defecto del pedido nuevo) y el duplicar (el pedido clonado queda a nombre
 * de quien lo duplica). Dos consultas equivalentes escritas por separado se
 * separan de verdad con el tiempo, y acá lo que se decide es a quién se le
 * acredita la venta — o sea la comisión.
 *
 * ⚠️ EL NOMBRE SE DEVUELVE LITERAL, sin recortar ni normalizar. En la tabla
 * conviven `"DANIEL LEVY"` (vistana) y `"DANIEL LEVY "` (joystep, CON espacio
 * al final), y `Rodrigo` es el único en Mixed Case. Switch parea contra ese
 * texto: "limpiarlo" rompe el pareo.
 *
 * Devuelve `null` si no hay mapeo, si no hay sesión, o si la lectura falla
 * (tabla ausente por DDL pendiente, etc.). Quien llama decide qué hacer con
 * eso — nunca se inventa un vendedor.
 *
 * El client de Supabase se importa PEREZOSAMENTE por la misma razón que
 * `traerVendedoresDeSwitch`: este módulo lo importan componentes del navegador
 * (que solo usan `nombreDeVendedor`) y no deben arrastrar la base entera.
 */
export async function vendedorDelUsuario(
  userId: string | null | undefined,
  empresaKey: string,
): Promise<VendedorMapeado | null> {
  if (!userId) return null;
  const { supabaseServer } = await import("@/lib/supabase-server");
  const { data, error } = await supabaseServer
    .from("fg_user_switch_vendedor")
    .select("vendedor_id, vendedor_nombre")
    .eq("user_id", userId)
    .eq("empresa_key", empresaKey)
    .maybeSingle();
  if (error || !data) return null;
  const id = Number(data.vendedor_id);
  if (!Number.isInteger(id) || id <= 0) return null;
  return { id, nombre: (data.vendedor_nombre as string | null) ?? null };
}

/** Busca un vendedor en una lista ya leída (puro). */
export function buscarVendedor(
  vendedores: readonly VendedorSwitch[],
  id: number,
): VendedorSwitch | null {
  return vendedores.find((v) => v.id === id) ?? null;
}

/** Mensaje único para el id que no está en el directorio de vendedores. */
export function errorVendedorNoExiste(cfg: MarcaConfig): string {
  return `Ese vendedor no existe en Switch de ${cfg.switchDirectorioLabel}`;
}

/** Texto de UN vendedor — igual en el selector, en el detalle y en el checkout. */
export function nombreDeVendedor(v: { id: number; nombre?: string | null } | null | undefined): string {
  if (!v) return "Sin vendedor asignado";
  return v.nombre || `Vendedor ${v.id}`;
}

/**
 * Trae los vendedores EN VIVO de la instancia Switch de una empresa.
 *
 * El client se importa PEREZOSAMENTE para que este módulo se pueda testear (y
 * lo importe el picker del navegador, que solo usa `nombreDeVendedor`) sin
 * arrastrar la API de Switch entera.
 */
export async function traerVendedoresDeSwitch(empresaKey: string): Promise<VendedorSwitch[]> {
  const { createSwitchClient } = await import("@/lib/switch-api/client");
  const client = createSwitchClient(empresaKey);
  const vendedores: VendedorSwitch[] = [];
  for (let pagina = 1; pagina <= VENDEDORES_MAX_PAGINAS; pagina++) {
    const data = await client.listVendedores({ porPagina: VENDEDORES_POR_PAGINA, paginaActual: pagina });
    const rows = data.vendedores ?? [];
    for (const v of rows) {
      if (typeof v.id === "number") vendedores.push({ id: v.id, nombre: String(v.nombre ?? v.id) });
    }
    if (rows.length < VENDEDORES_POR_PAGINA) break;
  }
  return vendedores;
}

/** Lista cacheada de UNA empresa, con la fuente real de Switch. */
export function listarVendedores(empresaKey: string): Promise<ListaVendedores> {
  return vendedoresDeEmpresa(empresaKey, () => traerVendedoresDeSwitch(empresaKey));
}

/**
 * Escribe `vendedor_switch_id` en un pedido, tolerando la DDL 20260705120000
 * pendiente (misma tolerancia que el checkout y el duplicar). Devuelve `false`
 * si la columna no existe — el pedido queda como estaba.
 */
export async function guardarVendedorSwitchEnPedido(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  ordersTable: string,
  orderId: string,
  vendedorSwitchId: number,
  vendedorNombre: string | null,
): Promise<boolean> {
  const patch: Record<string, unknown> = {
    vendedor_switch_id: vendedorSwitchId,
    updated_at: new Date().toISOString(),
  };
  // El nombre que se ve en la lista de pedidos y en el papel sale de
  // `vendor_name`: dejarlo con el vendedor viejo sería una pantalla mintiendo.
  if (vendedorNombre) patch.vendor_name = vendedorNombre;
  const { error } = await db.from(ordersTable).update(patch).eq("id", orderId);
  if (!error) return true;
  if (/vendedor_switch_id|column/i.test(error.message ?? "")) return false;
  throw new Error(error.message ?? "No se pudo guardar el vendedor del pedido");
}
