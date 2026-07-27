// ============================================================================
// Marketing module — TypeScript types
// Alineado con supabase/migrations/marketing.sql
// ============================================================================

export const EMPRESA_CODIGOS = [
  "vistana",
  "fashion_wear",
  "fashion_shoes",
  "active_shoes",
  "active_wear",
  "confecciones_boston",
  "joystep",
] as const;

export type EmpresaCodigo = (typeof EMPRESA_CODIGOS)[number];

// Estados de la UI: solo abierto / cerrado.
// 'cerrado' es el valor nuevo (CHECK ampliado). Los proyectos legacy en
// 'enviado'/'cobrado' siguen en DB y se LEEN como 'cerrado' vía
// normalizarEstadoProyecto() (nunca se reescriben). Al cerrar desde la UI se
// escribe 'cerrado'; al reabrir, 'abierto'.
export type EstadoProyecto = "abierto" | "cerrado";

// Estado de pago a nivel FACTURA (registro de gastos). Reemplaza en la UI al
// workflow de cobranza del proyecto (abierto/enviado/cobrado), que se conserva
// en DB pero ya no se muestra ni se opera.
export type EstadoPagoFactura = "creado" | "pagado";

// Tipo de marca:
//   'externa' — hay contraparte (Tommy, Calvin, Reebok) con quien compartir 50/50.
//   'interna' — Fashion Group absorbe 100% del gasto (ej: Joybees).
// Las marcas internas no se mezclan con externas en un mismo proyecto/factura.
export type TipoMarca = "externa" | "interna";

export type TipoAdjunto =
  | "pdf_factura"
  | "foto_proyecto"
  | "foto_factura"
  | "otro";

// ----------------------------------------------------------------------------
// Filas base (una tabla → una interface)
// ----------------------------------------------------------------------------

export interface MkMarca {
  id: string;
  nombre: string;
  codigo: string;
  empresa_codigo: EmpresaCodigo;
  tipo: TipoMarca; // Default 'externa' si la columna aún no existe en DB.
  activo: boolean;
  created_at: string;
}

export interface MkProyecto {
  id: string;
  nombre: string | null;
  tienda: string;
  // Código del directorio (clientes_master) D-XXX. null = "sin vincular"
  // (el texto libre de `tienda` se conserva siempre como display).
  tienda_codigo: string | null;
  fecha_inicio: string; // DATE ISO "YYYY-MM-DD"
  fecha_cierre: string | null;
  estado: EstadoProyecto;
  // Timestamps de transición (migrados desde mk_cobranzas al refactor)
  fecha_enviado: string | null;
  fecha_cobrado: string | null;
  notas: string | null;
  anulado_en: string | null;
  anulado_motivo: string | null;
  created_at: string;
  updated_at: string;
}

export interface MkProyectoMarca {
  id: string;
  proyecto_id: string;
  marca_id: string;
  porcentaje: number;
}

export interface MkFacturaMarca {
  id: string;
  factura_id: string;
  marca_id: string;
  porcentaje: number;
  created_at: string;
}

export interface MkFactura {
  id: string;
  proyecto_id: string;
  numero_factura: string;
  fecha_factura: string;
  proveedor: string;
  concepto: string;
  subtotal: number;
  itbms: number;
  total: number;
  // Zona libre: si true, total = subtotal × 1.15 (ITBMS forzado a 0).
  // Si false, total = subtotal + itbms (comportamiento clásico).
  tiene_importacion: boolean;
  // Registro de gastos: Pendiente (default) / Pagado. Independiente del estado
  // de cobranza del proyecto (legacy, oculto en UI).
  estado_pago: EstadoPagoFactura;
  // Rediseño por marca: las facturas existentes (Tommy/Calvin) quedan legacy=true
  // (card "Gastos Tommy y Calvin", congelada); las nuevas nacen false y se agrupan
  // por marca. Default false en DB. Opcional en el tipo porque varios payloads
  // arman el objeto sin este campo (se trata como false si falta).
  grupo_legacy?: boolean;
  // Impulsadoras: gasto suelto (sin proyecto). impulsadora_id apunta al
  // catálogo mk_impulsadoras; impulsadora_mes = mes cubierto (DATE día 1).
  // Ambos NULL para facturas normales de proyecto.
  impulsadora_id?: string | null;
  impulsadora_mes?: string | null;
  // Período trabajado que cubre el gasto (quincenas). Opcional: los pagos
  // mensuales viejos NO lo tienen y se leen como el mes completo de
  // impulsadora_mes (ver lib/marketing/periodo.ts → periodoEfectivo).
  // Opcional también en el tipo porque la migración 20260727140000 puede no
  // estar corrida todavía.
  periodo_desde?: string | null;
  periodo_hasta?: string | null;
  anulado_en: string | null;
  anulado_motivo: string | null;
  created_at: string;
  updated_at: string;
}

// ----------------------------------------------------------------------------
// Impulsadoras — catálogo con pago fijo mensual imputado a marca(s)
// ----------------------------------------------------------------------------
export interface MkImpulsadora {
  id: string;
  nombre: string;
  monto_mensual: number;
  activa: boolean;
  created_at: string;
  updated_at: string;
}

export interface MkImpulsadoraMarca {
  id: string;
  impulsadora_id: string;
  marca_id: string;
  porcentaje: number;
}

export interface MkAdjunto {
  id: string;
  proyecto_id: string | null;
  factura_id: string | null;
  tipo: TipoAdjunto;
  url: string;
  nombre_original: string | null;
  size_bytes: number | null;
  created_at: string;
}

// ----------------------------------------------------------------------------
// Tipos compuestos (joins + agregados)
// ----------------------------------------------------------------------------

export interface MarcaConPorcentaje {
  marca: MkMarca;
  porcentaje: number;
  // Empresa interna del grupo que paga el otro 50% (mk_factura_marcas).
  // null para marcas internas (Joybees) o filas legacy sin backfill.
  // Ausente para mk_proyecto_marcas (legacy) — esa tabla no tiene la columna.
  empresa_pagadora_codigo?: string | null;
}

export interface ProyectoConMarcas extends MkProyecto {
  marcas: MarcaConPorcentaje[];
}

export interface FacturaConAdjuntos extends MkFactura {
  adjuntos: MkAdjunto[];
}

// Factura con adjuntos + marcas embebidas. GET /proyectos/[id] ya devuelve las
// marcas por factura, así que la UI las consume directo (sin re-fetch por
// factura). `marcas` es opcional para tolerar fuentes que no las embeben.
export interface FacturaConAdjuntosYMarcas extends FacturaConAdjuntos {
  marcas?: MarcaConPorcentaje[];
}


export interface ProyectoResumen extends MkProyecto {
  marcas: MarcaConPorcentaje[];
  total_facturado: number;
  total_cobrable_marca: number; // monto cobrable a la marca filtrada (si aplica)
  conteo_facturas: number;
  conteo_fotos: number;
}

export interface AnuladoItem {
  tipo: "proyecto" | "factura";
  id: string;
  nombre: string;
  anulado_en: string;
  anulado_motivo: string | null;
}

// ----------------------------------------------------------------------------
// Inputs DTO (para mutations)
// ----------------------------------------------------------------------------

export interface MarcaPorcentajeInput {
  marcaId: string;
  porcentaje: number;
  // Empresa interna del grupo que paga el otro 50% (override del default
  // mk_marcas.empresa_codigo). Marcas internas (Joybees) lo ignoran.
  empresaPagadoraCodigo?: string | null;
}

export interface CreateProyectoInput {
  tienda: string;
  // Código del directorio (D-XXX) si la tienda se eligió del typeahead; null/
  // omitido = "sin vincular" (texto libre).
  tiendaCodigo?: string | null;
  nombre?: string;
  notas?: string;
  // Legacy: las marcas a nivel proyecto (mk_proyecto_marcas) se retiraron del
  // flujo de creación; se asignan por factura. Opcional y ya no se consume.
  marcas?: MarcaPorcentajeInput[];
}

export interface UpdateProyectoInput {
  tienda?: string;
  tiendaCodigo?: string | null;
  nombre?: string | null;
  fecha_inicio?: string; // "YYYY-MM-DD"
  notas?: string | null;
  estado?: EstadoProyecto;
}

export interface CreateFacturaInput {
  proyectoId: string;
  numeroFactura: string;
  fechaFactura: string;
  proveedor: string;
  concepto: string;
  subtotal: number;
  itbms?: number;
  tieneImportacion?: boolean;
  estadoPago?: EstadoPagoFactura;
}

export interface UpdateFacturaInput {
  numeroFactura?: string;
  fechaFactura?: string;
  proveedor?: string;
  concepto?: string;
  subtotal?: number;
  itbms?: number;
  tieneImportacion?: boolean;
  estadoPago?: EstadoPagoFactura;
}

export interface CreateAdjuntoInput {
  proyectoId?: string;
  facturaId?: string;
  tipo: TipoAdjunto;
  url: string;
  nombreOriginal?: string;
  sizeBytes?: number;
}

// ----------------------------------------------------------------------------
// Impulsadoras — inputs + tipos compuestos (para el catálogo y el pago mensual)
// ----------------------------------------------------------------------------

// Split de una impulsadora: marca + % (la suma debe dar 100).
export interface ImpulsadoraMarcaInput {
  marcaId: string;
  porcentaje: number;
}

export interface CreateImpulsadoraInput {
  nombre: string;
  montoMensual: number;
  marcas: ImpulsadoraMarcaInput[];
}

// Comprobante ya subido a Storage (path + metadatos). El pago NO se guarda sin
// esto (validación server-side).
export interface ComprobanteInput {
  path: string;
  tipo: "pdf_factura" | "foto_factura";
  nombreOriginal?: string;
  sizeBytes?: number;
}

export interface RegistrarPagoImpulsadoraInput {
  // Período trabajado que cubre el pago. Puede ser una quincena, un mes
  // completo o un solo día (desde = hasta).
  desde: string; // "YYYY-MM-DD" inclusive
  hasta: string; // "YYYY-MM-DD" inclusive
  monto: number; // total del pago (editable; default = monto_mensual)
  comprobante: ComprobanteInput;
}

// Marca del split con nombre/código resueltos, para la UI.
export interface ImpulsadoraMarcaResuelta {
  marca: MkMarca;
  porcentaje: number;
}

// Estado de pago de un mes concreto para una impulsadora. Con quincenas un mes
// puede quedar A MEDIAS, así que no alcanza un booleano: `estado` distingue
// pagado / parcial / pendiente y `faltan` dice qué días quedaron sin pagar
// ("16–31"). `pagado` se conserva = (estado === "pagado").
export interface PagoMesEstado {
  mes: string; // "YYYY-MM-01"
  pagado: boolean;
  estado: "pagado" | "parcial" | "pendiente";
  faltan: string;
}

// Fila del catálogo de impulsadoras que consume la UI (lista + chips).
export interface ImpulsadoraConEstado extends MkImpulsadora {
  marcas: ImpulsadoraMarcaResuelta[];
  mesAnterior: PagoMesEstado;
  mesActual: PagoMesEstado;
  /** Períodos pagados más recientes, ya formateados ("1–15 jul 2026"). */
  ultimosPeriodos: string[];
  /**
   * Cuántos PAGOS tiene registrados (períodos distintos, sin contar anulados).
   * Un pago repartido en 3 marcas son 3 filas en mk_facturas pero UN pago: acá
   * va el número que entiende una persona, porque es el que se le muestra
   * antes de eliminarla ("tiene 3 pagos registrados").
   */
  pagosRegistrados: number;
}

/**
 * Qué pasó al eliminar una impulsadora. Son dos desenlaces distintos y el de
 * arriba NO es un caso raro del otro: sin pagos la fila se borra de verdad;
 * con pagos se oculta, porque borrarla se llevaría por delante el historial de
 * gastos (y la FK de mk_facturas la protege igual).
 */
export type ResultadoEliminarImpulsadora =
  | { accion: "eliminada"; nombre: string }
  | { accion: "ocultada"; nombre: string; pagos: number };

// ----------------------------------------------------------------------------
// Inventario de muebles + entregas por proyecto
// ----------------------------------------------------------------------------
// Modelo plano: productos con stock_total disponible (no histórico). Cada
// entrega tiene N items (una fila por producto entregado) con un array
// `reparto` de tuplas (marca_id, empresa_codigo, cantidad).
//
// Reglas de reparto:
//   - Marca externa (Tommy/Calvin/Reebok): 50/50 entre marca y empresa_codigo
//     pagadora interna. La empresa default = mk_marcas.empresa_codigo pero
//     se puede override por entrega/item.
//   - Marca interna (Joybees): 100% va a la marca, empresa interna no aplica.
// El monto de la entrega se SUMA al total del proyecto sin línea separada.

export interface MkInventarioProducto {
  id: string;
  nombre: string;
  precio: number;
  stock_total: number; // unidades disponibles ahora mismo (no histórico).
  created_at: string;
  updated_at: string;
}

// Tupla en jsonb `reparto`: marca + empresa pagadora interna + cantidad.
// `empresa` es codigo string ('fashion_wear', 'vistana', etc.) o null si
// la marca es interna (no aplica empresa pagadora).
export interface RepartoItemEntry {
  marca_id: string;
  empresa: string | null;
  cantidad: number;
}

export interface MkEntregaItem {
  id: string;
  entrega_id: string;
  producto_id: string;
  reparto: RepartoItemEntry[];
  // DERIVADO al mapear desde la DB: agrega cantidades por marca_id.
  // No persiste en la tabla (la columna fue eliminada en el schema 2026-05).
  // Existe solo como compat para callers que aún leen el shape viejo.
  cantidad_por_marca: Record<string, number>;
  precio_unitario: number;
  created_at: string;
}

export interface MkEntregaMuebles {
  id: string;
  proyecto_id: string | null; // NULLABLE: entregas pendientes sin asignar
  total: number;
  // {"<marca_id>": <monto>} — claves son marca_id (uuid string).
  // Marcas externas reciben 50% de su parte; Joybees recibe 100%.
  total_por_marca: Record<string, number>;
  // {"<empresa_codigo>": <monto>} — claves son empresa_codigo (text key
  // de companies.ts). Suma del 50% interno de cada item externo.
  // Joybees no contribuye aquí (su 100% va completo a total_por_marca).
  total_por_empresa_interna: Record<string, number>;
  notas: string | null;
  created_at: string;
  updated_at: string;
}

export interface EntregaConItems extends MkEntregaMuebles {
  items: MkEntregaItem[];
}

// Inputs (mutations)
// Cada item viene con un array de tuplas {marcaId, empresa, cantidad}.
// `empresa` puede ser null (Joybees) o un codigo string para overrides
// (ej: marca Tommy con empresa "fashion_shoes" en vez del default).
// Si `empresa` es undefined, el backend lo deriva de marca.empresa_codigo.
export interface RepartoItemInput {
  marcaId: string;
  empresa?: string | null;
  cantidad: number;
}

export interface EntregaItemInput {
  productoId: string;
  // Modelo nuevo (registro de gastos, marca por %): unidades totales del
  // producto en la entrega. La marca/% vive a nivel entrega (`marcas`), no por
  // item. `reparto` queda como legacy (back-compat) — la UI ya no lo emite.
  cantidad?: number;
  reparto?: RepartoItemInput[];
}

export interface CreateEntregaInput {
  proyectoId?: string | null;
  items: EntregaItemInput[];
  // Marcas con % entre ellas (suma 100). 1 marca = 100%. El monto total de la
  // entrega se reparte por estos %. Sin empresa interna (se retiró el 50/50).
  marcas?: MarcaPorcentajeInput[];
  notas?: string | null;
}

export interface UpdateEntregaInput {
  items: EntregaItemInput[];
  marcas?: MarcaPorcentajeInput[];
  notas?: string | null;
}

export interface CreateProductoInput {
  nombre: string;
  precio: number;
  stockTotal: number;
}

export interface UpdateProductoInput {
  nombre?: string;
  precio?: number;
  stockTotal?: number;
}

