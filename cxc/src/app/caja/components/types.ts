export interface CajaPeriodo {
  id: string;
  numero: number;
  fecha_apertura: string;
  fecha_cierre: string | null;
  fondo_inicial: number;
  estado: string;
  total_gastado: number;
  /** Cuántos recibos vivos tiene. Lo calcula el servidor, nunca la pantalla. */
  recibos?: number;
  /**
   * 🔴 La responsable es del PERÍODO y se reconoce por su `empleado_codigo` de
   * Asistencia (Angela = 7). El nombre NO se guarda aquí: lo lee el servidor de
   * Asistencia y lo manda en `responsable_nombre`.
   */
  responsable_empleado_codigo?: string | null;
  responsable_nombre?: string | null;
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
  categoria: string;
  subtotal: number;
  itbms: number;
  total: number;
  nombre?: string; // legacy
  /** Cuántas fotos del recibo tiene guardadas. */
  fotos?: number;
  // Populated when ?include_deleted=1 on the period endpoint
  deleted_by?: string | null;
  deleted_at?: string | null;
  deleted_by_name?: string | null;
}

export interface CajaResponsable {
  id: string;
  nombre: string;
  activo: boolean;
  /** `empleado_codigo` de Asistencia. La identidad es el CÓDIGO, no el nombre. */
  empleado_codigo?: string | null;
}

export type View = "list" | "detail" | "print";
