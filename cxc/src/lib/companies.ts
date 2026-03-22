export interface Company {
  key: string;
  name: string;
  brand: string;
  vendedor?: string;
  vendedorPhone?: string;
}

export const COMPANIES: Company[] = [
  { key: "vistana", name: "Vistana International", brand: "Calvin Klein", vendedor: "Edwin", vendedorPhone: "50768344909" },
  { key: "fashion_shoes", name: "Fashion Shoes", brand: "Tommy Hilfiger Footwear" },
  { key: "fashion_wear", name: "Fashion Wear", brand: "Tommy Hilfiger Apparel" },
  { key: "active_shoes", name: "Active Shoes", brand: "Reebok Footwear" },
  { key: "active_wear", name: "Active Wear", brand: "Reebok Apparel" },
];

export function getCompany(key: string) {
  return COMPANIES.find((c) => c.key === key);
}
