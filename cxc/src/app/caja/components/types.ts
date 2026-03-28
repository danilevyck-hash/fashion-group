export interface CajaPeriodo {
  id: string;
  numero: number;
  fecha_apertura: string;
  fecha_cierre: string | null;
  fondo_inicial: number;
  estado: string;
  total_gastado: number;
  repuesto: boolean;
  repuesto_at: string | null;
  caja_gastos?: CajaGasto[];
}

export interface CajaGasto {
  id: string;
  periodo_id: string;
  fecha: string;
  descripcion: string;
  proveedor: string;
  nro_factura: string;
  responsable: string;
  categoria: string;
  empresa: string;
  subtotal: number;
  itbms: number;
  total: number;
  nombre?: string; // legacy
}

export type View = "list" | "detail" | "print";

export const CATEGORIAS_DEFAULT = [
  "Transporte",
  "Papelería",
  "Alimentación",
  "Limpieza",
  "Mensajería",
  "Servicios varios",
  "Otro",
];

export function loadCategorias(): string[] {
  if (typeof window === "undefined") return CATEGORIAS_DEFAULT;
  try {
    const stored = JSON.parse(
      localStorage.getItem("fg_categorias") || "[]"
    ) as string[];
    const deleted = JSON.parse(
      localStorage.getItem("fg_categorias_deleted") || "[]"
    ) as string[];
    const defaults = CATEGORIAS_DEFAULT.filter((c) => !deleted.includes(c));
    const merged = [
      ...defaults,
      ...stored.filter((s) => s && !defaults.includes(s)),
    ];
    if (merged.length === 0) {
      localStorage.removeItem("fg_categorias_deleted");
      return CATEGORIAS_DEFAULT;
    }
    return merged;
  } catch {
    return CATEGORIAS_DEFAULT;
  }
}
