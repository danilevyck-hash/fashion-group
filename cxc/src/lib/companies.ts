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

// Director's extra 2 companies
export const DIRECTOR_EXTRA_COMPANIES: Company[] = [
  { key: "confecciones_boston", name: "Confecciones Boston", brand: "Confecciones Boston" },
  { key: "joystep", name: "Joystep", brand: "Joybees" },
];

// All 7 companies (for upload and director view)
export const ALL_COMPANIES: Company[] = [...ADMIN_COMPANIES, ...DIRECTOR_EXTRA_COMPANIES];

// Legacy export for backward compat
export const COMPANIES = ALL_COMPANIES;

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
  if (role === "director") return ALL_COMPANIES;
  if (role === "admin") return ADMIN_COMPANIES;
  if (role === "vendedor") return ADMIN_COMPANIES;
  return ALL_COMPANIES; // upload sees all for uploading
}
