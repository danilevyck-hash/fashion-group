import type { GuiaItem } from "./types";

export const DEFAULT_TRANSPORTISTAS = ["RedNblue", "Mojica", "Transporte Sol", "Sanjur"];
export const DEFAULT_CLIENTES = [
  "City Mall",
  "La Frontera Duty Free",
  "Jerusalem de Panama",
  "Plaza Los Angeles",
  "Golden Mall",
  "Multi Fashion Holding",
  "Kheriddine",
  "Bouti S.A.",
  "Jerusalem Duty Free",
  "Outlet Duty Free N2",
  "Outlet Duty Free N3",
  "Sporting Shoes N4",
];
export const DEFAULT_DIRECCIONES = ["Paso Canoas", "David", "Santiago", "Guabito", "Changinola"];
export const DEFAULT_EMPRESAS = [
  "Vistana International",
  "Fashion Shoes",
  "Fashion Wear",
  "Active Shoes",
  "Active Wear",
  "Confecciones Boston",
  "Joystep",
  "MultiFashion Holding",
];

export function loadList(key: string, defaults: string[]): string[] {
  if (typeof window === "undefined") return defaults;
  try {
    const stored = JSON.parse(localStorage.getItem(key) || "[]") as string[];
    const merged = [...defaults];
    for (const s of stored) {
      if (s && !merged.includes(s)) merged.push(s);
    }
    return merged;
  } catch {
    return defaults;
  }
}

export function saveList(key: string, defaults: string[], list: string[]) {
  const custom = list.filter((s) => !defaults.includes(s));
  localStorage.setItem(key, JSON.stringify(custom));
}

export function emptyItem(orden: number): GuiaItem {
  return { orden, cliente: "", direccion: "", empresa: "", facturas: "", bultos: 0, numero_guia_transp: "" };
}

export function clientesSummary(items: GuiaItem[]): string {
  if (!items || items.length === 0) return "";
  const uniqueClientes = [...new Set(items.map((i) => i.cliente).filter(Boolean))];
  if (uniqueClientes.length === 0) return "";
  if (uniqueClientes.length === 1) return uniqueClientes[0];
  return `${uniqueClientes[0]} y ${uniqueClientes.length - 1} más`;
}

export function getMonthOptions(): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("es", { year: "numeric", month: "long" });
    options.push({ value, label: label.charAt(0).toUpperCase() + label.slice(1) });
  }
  return options;
}
