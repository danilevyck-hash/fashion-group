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
  deleted_gastos?: CajaGasto[];
}

export interface CajaGasto {
  id: string;
  periodo_id: string;
  fecha: string;
  descripcion: string;
  proveedor: string;
  nro_factura: string;
  responsable: string;
  responsable_id?: string | null;
  categoria: string;
  empresa: string;
  subtotal: number;
  itbms: number;
  total: number;
  nombre?: string; // legacy
  // Populated when ?include_deleted=1 on the period endpoint
  deleted_by?: string | null;
  deleted_at?: string | null;
  deleted_by_name?: string | null;
}

export interface CajaResponsable {
  id: string;
  nombre: string;
  activo: boolean;
}

export type View = "list" | "detail" | "print";
