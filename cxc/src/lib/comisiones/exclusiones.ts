// Clientes por los que UN vendedor no comisiona — la parte PURA (sin base).
//
// 🩸 Daniel, 3-sep-2026, textual: «crea configuración en comisiones para
// desactivar cálculos de clientes». Grano «cliente vendedor»; aplica a venta
// y cobro: «correcto, también venta».
//
// Quién resta de verdad es la RPC (`comision_b2b_v8`, tabla
// `comision_exclusion`): este módulo solo NORMALIZA lo que se guarda —para que
// lo que escribe la pantalla cruce con lo que compara el SQL— y VALIDA lo que
// llega por la API. La misma fórmula en los tres lados: UPPER(TRIM(…)).
//
// VENTA y COBRO por separado (3-sep-2026, noche). Daniel: «poder quitar
// comisiones en ventas o comisiones sin que tengan que ser de los dos». Cada
// fila lleva dos casillas (`excluye_venta`, `excluye_cobro`); al agregar
// «arranca con las dos marcadas pero yo deselecciono», y una fila con las dos
// apagadas no existe: no se guarda y se avisa (aquí, en el CHECK de la tabla y
// en la pantalla).
//
// Nada de esto se dice «exclusión» en pantalla: Daniel lo llama «clientes que
// no comisionan» y así se rotula (ROTULO_CLIENTES_SIN_COMISION).

import { EMPRESAS_COMISIONAN } from "@/lib/comisiones/empresas";
import { CODIGO_CLIENTE_CONTADO } from "@/lib/catalogo/publico-switch-actor";

/** Rótulo único de la sección y de la marca en la tabla. */
export const ROTULO_CLIENTES_SIN_COMISION = "Clientes que no comisionan";

/** El vendedor como lo guarda la tabla y lo compara la RPC: mayúsculas, sin bordes. */
export const normalizarVendedor = (s: string): string => s.trim().toUpperCase();
/** El código del cliente igual: `d-84 ` → `D-84`. */
export const normalizarCodigoCliente = (s: string): string => s.trim().toUpperCase();

export interface ExclusionActiva {
  id: number;
  empresa_key: string;
  cliente_codigo: string;
  /** Resuelto desde switch_clientes; null si el código ya no está en el directorio. */
  cliente_nombre: string | null;
  vendedor: string;
  /** No comisiona la VENTA a ese cliente. */
  excluye_venta: boolean;
  /** No comisiona el COBRO (los recibos que registró) a ese cliente. */
  excluye_cobro: boolean;
  creado_por: string;
  creado_en: string;
}

/** Lo que la pantalla manda para agregar una. */
export interface ExclusionNueva {
  empresa_key: string;
  cliente_codigo: string;
  vendedor: string;
  excluye_venta: boolean;
  excluye_cobro: boolean;
}

/** Lo que se le dice a quien deja las dos casillas apagadas. */
export const AVISO_NINGUNA_CASILLA = "Marca al menos una: Venta o Cobro. Si no quieres ninguna, quita la fila.";

/** Las dos casillas como llegan por la API: ausentes = marcadas (como al agregar). */
export function leerCasillas(b: Record<string, unknown>): { excluye_venta: boolean; excluye_cobro: boolean } | null {
  const casilla = (v: unknown): boolean | null =>
    v === undefined || v === null ? true : typeof v === "boolean" ? v : null;
  const venta = casilla(b.excluye_venta);
  const cobro = casilla(b.excluye_cobro);
  if (venta === null || cobro === null) return null;
  return { excluye_venta: venta, excluye_cobro: cobro };
}

export type Validacion =
  | { ok: true; valor: ExclusionNueva }
  | { ok: false; error: string };

/**
 * Valida y normaliza lo que llega por POST. Fail-closed: cualquier duda es un
 * error con texto para la pantalla, nunca una fila «más o menos».
 */
export function validarExclusionNueva(body: unknown): Validacion {
  const b = (body ?? {}) as Record<string, unknown>;
  const empresa = typeof b.empresa_key === "string" ? b.empresa_key.trim() : "";
  if (!(EMPRESAS_COMISIONAN as readonly string[]).includes(empresa)) {
    return { ok: false, error: "Elige una de las seis empresas que comisionan" };
  }
  const codigo = typeof b.cliente_codigo === "string" ? normalizarCodigoCliente(b.cliente_codigo) : "";
  if (!codigo) return { ok: false, error: "Elige el cliente" };
  if (codigo === CODIGO_CLIENTE_CONTADO) {
    return { ok: false, error: "La venta de mostrador ya no comisiona; no hace falta agregarla" };
  }
  if (codigo.length > 40) return { ok: false, error: "El código del cliente no es válido" };
  const vendedor = typeof b.vendedor === "string" ? normalizarVendedor(b.vendedor) : "";
  if (!vendedor) return { ok: false, error: "Elige el vendedor" };
  if (vendedor.length > 120) return { ok: false, error: "El nombre del vendedor no es válido" };
  const casillas = leerCasillas(b);
  if (!casillas) return { ok: false, error: "Las casillas de Venta y Cobro no son válidas" };
  if (!casillas.excluye_venta && !casillas.excluye_cobro) return { ok: false, error: AVISO_NINGUNA_CASILLA };
  return { ok: true, valor: { empresa_key: empresa, cliente_codigo: codigo, vendedor, ...casillas } };
}

export type ValidacionCasillas =
  | { ok: true; valor: { excluye_venta: boolean; excluye_cobro: boolean } }
  | { ok: false; error: string };

/** Cambiar las casillas de una fila que ya existe: las dos tienen que venir, y al menos una marcada. */
export function validarCasillas(body: unknown): ValidacionCasillas {
  const b = (body ?? {}) as Record<string, unknown>;
  if (typeof b.excluye_venta !== "boolean" || typeof b.excluye_cobro !== "boolean") {
    return { ok: false, error: "Las casillas de Venta y Cobro no son válidas" };
  }
  if (!b.excluye_venta && !b.excluye_cobro) return { ok: false, error: AVISO_NINGUNA_CASILLA };
  return { ok: true, valor: { excluye_venta: b.excluye_venta, excluye_cobro: b.excluye_cobro } };
}

/** Un cliente que no comisiona para un vendedor, como viaja a la pantalla. */
export interface ClienteSinComision {
  codigo: string;
  nombre: string | null;
  /** Ausente = las dos (venta y cobro). */
  excluye_venta?: boolean;
  excluye_cobro?: boolean;
}

/**
 * Cuáles clientes NO comisionan para cada vendedor de UNA empresa.
 * Clave = vendedor normalizado; el nombre de la RPC viene recortado pero no
 * en mayúsculas, así que quien busque tiene que normalizar (ver
 * `adjuntarClientesSinComision`).
 */
export function clientesSinComisionPorVendedor(
  exclusiones: readonly ExclusionActiva[],
  empresa: string,
): Map<string, ClienteSinComision[]> {
  const out = new Map<string, ClienteSinComision[]>();
  for (const e of exclusiones) {
    if (e.empresa_key !== empresa) continue;
    const k = normalizarVendedor(e.vendedor);
    const lista = out.get(k) ?? [];
    if (!lista.some((c) => c.codigo === e.cliente_codigo)) {
      lista.push({
        codigo: e.cliente_codigo,
        nombre: e.cliente_nombre,
        excluye_venta: e.excluye_venta ?? true,
        excluye_cobro: e.excluye_cobro ?? true,
      });
    }
    out.set(k, lista);
  }
  for (const lista of out.values()) lista.sort((a, b) => a.codigo.localeCompare(b.codigo));
  return out;
}

/**
 * Le pega a cada fila de la RPC la lista de sus clientes sin comisión (solo si
 * tiene alguna). Puro: no cambia ningún monto — la RPC ya restó.
 */
export function adjuntarClientesSinComision<T extends { vendedor: string }>(
  vendedores: readonly T[],
  exclusiones: readonly ExclusionActiva[],
  empresa: string,
): (T & { clientes_sin_comision?: ClienteSinComision[] })[] {
  const por = clientesSinComisionPorVendedor(exclusiones, empresa);
  return (vendedores ?? []).map((v) => {
    const lista = por.get(normalizarVendedor(v.vendedor));
    return lista && lista.length > 0 ? { ...v, clientes_sin_comision: lista } : { ...v };
  });
}

/** «D-84 Kheriddine» — el mismo texto en el tooltip, la lista y el Excel.
 *  Si solo aplica a una de las dos, lo dice: «D-84 Kheriddine (solo cobro)». */
export const etiquetaClienteSinComision = (c: ClienteSinComision): string => {
  const base = c.nombre ? `${c.codigo} ${c.nombre}` : c.codigo;
  const venta = c.excluye_venta ?? true;
  const cobro = c.excluye_cobro ?? true;
  if (venta && !cobro) return `${base} (solo venta)`;
  if (!venta && cobro) return `${base} (solo cobro)`;
  return base;
};

/** «3 clientes sin comisión» / «1 cliente sin comisión». */
export function rotuloClientesSinComision(n: number): string {
  return `${n} ${n === 1 ? "cliente" : "clientes"} sin comisión`;
}
