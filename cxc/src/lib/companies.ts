import { B2B_EMPRESA_KEYS } from "@/lib/empresa-mapping";

export interface Company {
  key: string;
  name: string;
  brand: string;
  vendedor?: string;
  vendedorPhone?: string;
}

// Admin's 5 companies
export const ADMIN_COMPANIES: Company[] = [
  { key: "vistana", name: "Vistana International", brand: "Calvin Klein", vendedor: "Edwin", vendedorPhone: "50768344909" },
  { key: "fashion_shoes", name: "Fashion Shoes", brand: "Tommy Hilfiger Footwear" },
  { key: "fashion_wear", name: "Fashion Wear", brand: "Tommy Hilfiger Apparel" },
  { key: "active_shoes", name: "Active Shoes", brand: "Reebok Footwear" },
  { key: "active_wear", name: "Active Wear", brand: "Reebok Apparel" },
];

// 2 empresas adicionales (solo admin las ve)
export const EXTRA_COMPANIES: Company[] = [
  { key: "confecciones_boston", name: "Confecciones Boston", brand: "Confecciones Boston" },
  { key: "joystep", name: "Joystep", brand: "Joybees" },
];

// Las 7 empresas del grupo
export const ALL_COMPANIES: Company[] = [...ADMIN_COMPANIES, ...EXTRA_COMPANIES];

// Legacy export for backward compat
export const COMPANIES = ALL_COMPANIES;

/**
 * Las 6 empresas B2B (con clientes D-XXX y CXC). Derivado de B2B_EMPRESA_KEYS
 * en empresa-mapping.ts (single source of truth) preservando el orden canónico.
 * Usado por /admin (CXC dashboard), /clientes (detalle), y todo flow CXC.
 */
export const B2B_COMPANIES: Company[] = B2B_EMPRESA_KEYS
  .map((k) => ALL_COMPANIES.find((c) => c.key === k))
  .filter((c): c is Company => c != null);

export function getCompany(key: string) {
  return ALL_COMPANIES.find((c) => c.key === key);
}

export function getCompanyDisplay(key: string | null | undefined): string {
  if (!key) return "";
  return getCompany(key)?.name ?? key;
}

/** Display names used across modules (cheques, caja, prestamos, ventas, guias) */
export const EMPRESAS = ALL_COMPANIES.map((c) => c.name);

export function getCompaniesForRole(role: string): Company[] {
  if (role === "admin") return ALL_COMPANIES; // admin ve las 7
  if (role === "vendedor") return ADMIN_COMPANIES;
  return ALL_COMPANIES;
}
