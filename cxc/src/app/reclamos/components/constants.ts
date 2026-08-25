import { RItem } from "./types";

// Fuente única del cálculo fiscal: src/lib/reclamos/tax.ts. Se re-exporta aquí para
// no romper imports existentes. Active Shoes = importación 15% sin ITBMS; resto igual.
export { TASA_IMPORTACION, TASA_ITBMS, FACTOR_TOTAL, reclamoTaxes, esActiveShoes, ocultaPedido, impLabel, itbmsLabel, pctLabel } from "@/lib/reclamos/tax";
export { ESTADO_PAGADO, esPendiente, soloPendientes } from "@/lib/reclamos/pendientes";

export const EMPRESAS_MAP: Record<string, { proveedor: string; marca: string }> = {
  "Vistana International": { proveedor: "American Designer Fashion", marca: "Calvin Klein" },
  "Fashion Wear": { proveedor: "American Fashion Wear", marca: "Tommy Hilfiger" },
  "Fashion Shoes": { proveedor: "American Fashion Wear", marca: "Tommy Hilfiger" },
  "Active Shoes": { proveedor: "Latin Fitness Group", marca: "Reebok" },
  "Active Wear": { proveedor: "Latin Fitness Group", marca: "Reebok" },
};

export const EMPRESAS = Object.keys(EMPRESAS_MAP);

/** Mapea proveedor/marca extraídos por IA a la "empresa" del reclamo (que
 *  determina proveedor+marca al guardar). Match por marca+proveedor; si la marca
 *  es ambigua (Tommy→FW/FS, Reebok→AS/AW) gana el primer match — el usuario
 *  puede corregir. Devuelve null si no hay match. */
export function empresaDesdeIA(
  proveedor: string | null | undefined,
  marca: string | null | undefined,
): string | null {
  const m = (marca || "").toLowerCase().trim();
  const p = (proveedor || "").toLowerCase().trim();
  if (!m && !p) return null;
  // 1) match por marca + proveedor.
  for (const [empresa, info] of Object.entries(EMPRESAS_MAP)) {
    const im = info.marca.toLowerCase();
    const ip = info.proveedor.toLowerCase();
    if (m && im === m && p && ip === p) return empresa;
  }
  // 2) match por marca sola.
  for (const [empresa, info] of Object.entries(EMPRESAS_MAP)) {
    if (m && info.marca.toLowerCase() === m) return empresa;
  }
  // 3) match por proveedor solo.
  for (const [empresa, info] of Object.entries(EMPRESAS_MAP)) {
    if (p && info.proveedor.toLowerCase() === p) return empresa;
  }
  return null;
}

export const DEFAULT_MOTIVOS = [
  "Mercancía defectuosa",
  "Producto no recibido",
  "Error de facturación",
  "Sobrante de mercancía",
  "Faltante de mercancía",
  "Mercancía manchada",
];

export const TALLAS = ["XS", "S", "M", "L", "XL", "XXL", "OS", "Otros"];

// ─────────────────────────────────────────────────────────────────────────────
// Género del ítem reclamado — dropdown FIJO (sin opción libre). Obligatorio.
//
// 🔴 EL VALOR GUARDADO SIGUE EN INGLÉS Y NO SE PUEDE TRADUCIR.
// `reclamo_items.genero` tiene un CHECK en la base
// (`supabase/migrations/20260623120000_reclamo_items_genero.sql`) que sólo
// admite NULL o exactamente 'Men' | 'Women' | 'Kids' | 'Accessories'. Guardar
// "Hombre" haría fallar el INSERT, y cambiar el CHECK obligaría a migrar las
// filas ya escritas. Además el Excel que se le manda al proveedor —que son
// marcas extranjeras— lleva ese mismo valor.
//
// Lo que SÍ se traduce es lo que ve el usuario: la etiqueta del desplegable y
// del detalle. Era el único campo del sistema en inglés, y encima obligatorio.
// ─────────────────────────────────────────────────────────────────────────────
export const GENEROS = ["Men", "Women", "Kids", "Accessories"] as const;

/** Cómo se MUESTRA cada género. La clave es el valor guardado (inglés). */
export const GENERO_LABEL: Record<string, string> = {
  Men: "Hombre",
  Women: "Mujer",
  Kids: "Niños",
  Accessories: "Accesorios",
};

/** Etiqueta en español de un género guardado. Si llega algo que no está en la
 *  tabla (una fila vieja o rara), se muestra tal cual en vez de esconderla. */
export function generoLabel(valor: string | null | undefined): string {
  if (!valor) return "";
  return GENERO_LABEL[valor] ?? valor;
}

export const ESTADOS = ["Creado", "En proceso", "Pagado"];

/** Display-friendly names for estados (use in buttons/labels) */
export const ESTADO_DISPLAY: Record<string, string> = {};

/** Get display name for an estado, falls back to the estado itself */
export function estadoLabel(estado: string): string {
  return ESTADO_DISPLAY[estado] || estado;
}

export const EC: Record<string, string> = {
  "Creado": "bg-gray-100 text-gray-600",
  "En proceso": "bg-amber-50 text-amber-700",
  "Pagado": "bg-green-50 text-green-700",
};

/** Load custom motivos — tries API first, falls back to localStorage */
export function loadCustomMotivos(): string[] {
  try { return JSON.parse(localStorage.getItem("fg_custom_motivos") || "[]"); } catch { return []; }
}

/** Fetch custom motivos from Supabase. Falls back to localStorage if API fails. */
export async function fetchCustomMotivos(): Promise<string[]> {
  try {
    const res = await fetch("/api/reclamos/motivos");
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        // Sync to localStorage as cache
        localStorage.setItem("fg_custom_motivos", JSON.stringify(data));
        return data;
      }
    }
  } catch { /* fall through */ }
  // Fallback: load from localStorage
  return loadCustomMotivos();
}

/** Save a custom motivo — persists to Supabase and localStorage */
export async function saveCustomMotivo(m: string) {
  // Save to localStorage immediately for instant feedback
  const cur = loadCustomMotivos();
  if (!cur.includes(m)) { cur.push(m); localStorage.setItem("fg_custom_motivos", JSON.stringify(cur)); }
  // Persist to Supabase in background
  try {
    await fetch("/api/reclamos/motivos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ motivo: m }),
    });
  } catch { /* localStorage already has it as fallback */ }
}

export function emptyItem(): RItem {
  return { referencia: "", descripcion: "", talla: "", cantidad: 1, precio_unitario: 0, subtotal: 0, motivo: "", genero: "", nro_factura: "", nro_orden_compra: "" };
}

export function daysSince(d: string) {
  if (!d) return 0;
  return Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
}

export function calcSub(items: RItem[]) {
  return items.reduce((s, i) => s + (Number(i.cantidad) || 0) * (Number(i.precio_unitario) || 0), 0);
}

