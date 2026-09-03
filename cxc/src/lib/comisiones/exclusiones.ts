// Clientes por los que UN vendedor no comisiona — la parte PURA (sin base).
//
// 🩸 Daniel, 3-sep-2026, textual: «crea configuración en comisiones para
// desactivar cálculos de clientes». Grano «cliente vendedor»; aplica a venta
// y cobro: «correcto, también venta».
//
// Quién resta de verdad es la RPC (`comision_b2b_v7`, tabla
// `comision_exclusion`): este módulo solo NORMALIZA lo que se guarda —para que
// lo que escribe la pantalla cruce con lo que compara el SQL— y VALIDA lo que
// llega por la API. La misma fórmula en los tres lados: UPPER(TRIM(…)).
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
  creado_por: string;
  creado_en: string;
}

/** Lo que la pantalla manda para agregar una. */
export interface ExclusionNueva {
  empresa_key: string;
  cliente_codigo: string;
  vendedor: string;
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
  return { ok: true, valor: { empresa_key: empresa, cliente_codigo: codigo, vendedor } };
}

/** Un cliente que no comisiona para un vendedor, como viaja a la pantalla. */
export interface ClienteSinComision {
  codigo: string;
  nombre: string | null;
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
      lista.push({ codigo: e.cliente_codigo, nombre: e.cliente_nombre });
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

/** «D-84 Kheriddine» — el mismo texto en el tooltip, la lista y el Excel. */
export const etiquetaClienteSinComision = (c: ClienteSinComision): string =>
  c.nombre ? `${c.codigo} ${c.nombre}` : c.codigo;

/** «3 clientes sin comisión» / «1 cliente sin comisión». */
export function rotuloClientesSinComision(n: number): string {
  return `${n} ${n === 1 ? "cliente" : "clientes"} sin comisión`;
}
