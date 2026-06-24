import { supabaseServer } from "@/lib/supabase-server";

export const EMPRESA_KEY_TO_NAME: Record<string, string> = {
  vistana: "Vistana International",
  fashion_wear: "Fashion Wear",
  fashion_shoes: "Fashion Shoes",
  active_shoes: "Active Shoes",
  active_wear: "Active Wear",
  joystep: "Joystep",
  confecciones_boston: "Confecciones Boston",
  american_classic: "Multifashion",
};

/**
 * Iniciales por empresa para la numeración de reclamos NUEVOS
 * (<INICIALES>-<AÑO>-<correlativo>, ej. VI-2026-0001). Iniciales confirmadas por
 * Daniel. Los reclamos guardan el NOMBRE de la empresa (no la key), así que el
 * lookup es por nombre normalizado (trim + minúsculas). Incluye alias de
 * Multifashion / American Classics → MF. Solo afecta números nuevos: los viejos
 * REC-YYYY-XXXX no se tocan.
 */
const EMPRESA_NAME_TO_INITIALS: Record<string, string> = {
  "vistana international": "VI",
  "fashion wear": "FW",
  "fashion shoes": "FS",
  "active shoes": "AS",
  "active wear": "AW",
  "joystep": "JS",
  "confecciones boston": "CB",
  "multifashion": "MF",
  "american classics": "MF",
  "american classic": "MF",
};

/**
 * Iniciales de la empresa de un reclamo (por NOMBRE). Fallback "RE" si la empresa
 * no está mapeada — sigue siendo un prefijo válido y único, nunca colisiona con el
 * formato viejo REC-.
 */
export function reclamoInitials(empresa: string): string {
  const norm = (empresa || "").trim().toLowerCase();
  return EMPRESA_NAME_TO_INITIALS[norm] ?? "RE";
}

/**
 * Short ids usados por el bundle de Ventas redesign (matrix heatmap, mock-data).
 * El módulo Ventas trabaja con estos ids cortos en el shape de la API; el resto
 * del codebase sigue usando las DB keys largas (vistana, fashion_wear, ...).
 *
 * Mapeo bidireccional con la DB key canónica.
 */
export const EMPRESA_KEY_TO_VENTAS_ID: Record<string, string> = {
  vistana: "vistana",
  fashion_wear: "fwear",
  fashion_shoes: "fshoes",
  active_shoes: "ashoes",
  active_wear: "awear",
  joystep: "joystep",
  confecciones_boston: "boston",
  american_classic: "multi",
};

export const VENTAS_ID_TO_EMPRESA_KEY: Record<string, string> = Object.fromEntries(
  Object.entries(EMPRESA_KEY_TO_VENTAS_ID).map(([k, v]) => [v, k])
);

export type VentasEmpresaId =
  | "vistana" | "fwear" | "fshoes" | "ashoes"
  | "awear" | "joystep" | "boston" | "multi";

export function mapEmpresaKeyToVentasId(key: string): VentasEmpresaId | null {
  return (EMPRESA_KEY_TO_VENTAS_ID[key] as VentasEmpresaId) ?? null;
}

/**
 * Las 6 empresas B2B que tienen clientes con código D-XXX en Switch
 * y CXC/ventas matcheable contra clientes_master. Lista canónica para
 * los flows que dependen del esquema D-XXX (CXC dashboard, /clientes,
 * upload de detallessaldos / listacomprobantes).
 *
 * Excluye Confecciones Boston y American Classic (retail, sin código).
 */
export const B2B_EMPRESA_KEYS = [
  "vistana",
  "fashion_wear",
  "fashion_shoes",
  "active_shoes",
  "active_wear",
  "joystep",
] as const;

export type B2BEmpresaKey = typeof B2B_EMPRESA_KEYS[number];

/**
 * Las 8 empresas del grupo en su orden canónico para el módulo de uploads
 * y para flows que necesitan listar todas las empresas (ventas usa las 8;
 * CXC sólo las 6 B2B). Boston es B2B y va junto a las otras B2B; Multifashion
 * (retail puro) se renderiza al final como fila destacada.
 */
export const ALL_EMPRESA_KEYS = [
  "vistana",
  "fashion_wear",
  "fashion_shoes",
  "active_shoes",
  "active_wear",
  "joystep",
  "confecciones_boston",
  "american_classic",
] as const;

export type EmpresaKey = typeof ALL_EMPRESA_KEYS[number];

/**
 * Empresas que el cron switch-sync?tipo=facturas pobla en switch_facturas.
 * Lista usada por el indicador SyncStatus para detectar empresas que
 * deberían estar al día pero no lo están. Si en el futuro se agrega una
 * empresa al sync de facturas, actualizar acá y la UI la cubre automático.
 */
export const SWITCH_FACTURAS_EMPRESA_KEYS = [
  "active_shoes",
  "active_wear",
  "american_classic",
] as const;

/**
 * Empresas que el cron switch-sync?tipo=estadocuenta pobla en
 * switch_estadocuenta. Hoy = las 6 B2B (Boston/Multifashion no aplican).
 */
export const SWITCH_ESTADOCUENTA_EMPRESA_KEYS = B2B_EMPRESA_KEYS;

export function mapEmpresaName(key: string): string {
  return EMPRESA_KEY_TO_NAME[key] ?? key;
}

export async function getVentasMensuales(year: number, month?: number): Promise<{
  empresa: string; mes: number; ventas_netas: number; utilidad: number; costo: number;
}[]> {
  // Fuente única switch_facturas vía la vista unificada (switch-only, mensual,
  // hora-Panamá; Paso 2). utilidad/costo quedan en 0: los consumidores (metas,
  // metas-auto) solo usan ventas_netas; el costo va al sprint de costo (Opción A).
  const { data } = await supabaseServer
    .from("switch_ventas_unificado_vw")
    .select("empresa_key, mes, ventas_netas")
    .gte("mes", `${year}-01-01`)
    .lte("mes", `${year}-12-31`);

  // Aggregate by empresa + mes
  const map = new Map<string, { ventas_netas: number; utilidad: number; costo: number }>();
  for (const r of (data ?? []) as { empresa_key: string; mes: string; ventas_netas: number | string }[]) {
    const m = new Date(r.mes).getUTCMonth() + 1;
    if (month && m !== month) continue;
    const name = mapEmpresaName(r.empresa_key);
    const key = `${name}|${m}`;
    const entry = map.get(key) ?? { ventas_netas: 0, utilidad: 0, costo: 0 };
    entry.ventas_netas += Number(r.ventas_netas) || 0;
    map.set(key, entry);
  }

  return [...map.entries()].map(([key, v]) => {
    const [empresa, mes] = key.split("|");
    return { empresa, mes: parseInt(mes), ...v };
  });
}
