/**
 * Tipos para la integración con Switch Soft API.
 *
 * Convención de empresa: SWITCH_<EMPRESA_KEY>_API_* en env vars.
 * Ej: SWITCH_MULTIFASHION_API_URL, SWITCH_MULTIFASHION_API_USER, SWITCH_MULTIFASHION_API_PASSWORD.
 */

// ─── Envelopes ───────────────────────────────────────────────────────────────

/**
 * Switch envuelve toda respuesta en un objeto `{ data: ... }`.
 * El http_code interno es string ("200") y no siempre está presente; el HTTP
 * real lo da el status del fetch.
 */
export interface SwitchApiResponse<T> {
  data: T;
}

export interface SwitchPaginacion {
  porPagina: string | number;
  paginaActual: number;
  total: number;
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export interface SwitchAuthResponseData {
  token: string;
  sucursalId: number;
  sucursalCodigo: string;
  terminalCodigo: string;
  vendedorId: number;
  usuarioId: number;
  usuario: string;
  usuarioNombre: string;
  email: string;
  codigoPais: string;
  /** Segundos hasta expiración del token. Switch envía un valor inflado (~7884000),
   *  pero en la práctica el token vive ~60min. No confiar ciegamente. */
  expires_in: string;
  [key: string]: unknown;
}

export type SwitchAuthResponse = SwitchApiResponse<SwitchAuthResponseData>;

// ─── Sucursales ──────────────────────────────────────────────────────────────

export interface SwitchSucursal {
  id: number;
  nombre: string;
  codigo: string;
  tipo: string;
}

export interface SwitchSucursalesData {
  sucursales: SwitchSucursal[];
  paginacion: SwitchPaginacion;
}

// ─── Vendedores ──────────────────────────────────────────────────────────────

export interface SwitchVendedor {
  id: number;
  nombre: string;
  codigo: string;
  negocio: string | null;
  categoria: string | null;
}

export interface SwitchVendedoresData {
  vendedores: SwitchVendedor[];
  paginacion: SwitchPaginacion;
}

// ─── Clientes ────────────────────────────────────────────────────────────────

export interface SwitchCliente {
  id: number;
  codigo: string;
  nombre: string;
  razonsocial: string | null;
  email: string | null;
  identificacion: string | null;
  dv: string | null;
  telefono: string | null;
  celular: string | null;
  direccion: string | null;
  vendedorId: number | null;
  vendedor: string | null;
  [key: string]: unknown;
}

export interface SwitchClientesData {
  clientes: SwitchCliente[];
  paginacion: SwitchPaginacion;
}

// ─── Facturas ────────────────────────────────────────────────────────────────

/**
 * Item de /apifactura/lista. Switch devuelve montos como string con 4 decimales.
 * Convertir a number en la capa de sincronización, no en el cliente.
 */
export interface SwitchFactura {
  id: number;
  secuencial: string;
  tipoComprobante: "Factura" | "Tiquete" | string;
  /** "YYYY-MM-DD HH:mm:ss" (hora local de Switch, sin TZ explícito) */
  fecha: string;
  subTotal: string;
  descuento: string;
  subTotalDescuento: string;
  impuesto: string;
  total: string;
  condicionVenta: string;
  saldo: string;
  cliente: string;
  clienteId: number;
  clienteEmail: string;
  vendedor: string;
  vendedorId: number;
  sucursal: string;
  sucursalId: number;
  urlswitchpay: string;
}

export interface SwitchFacturasData {
  facturas: SwitchFactura[];
  paginacion: SwitchPaginacion;
}

/**
 * Filtros de /apifactura/lista. `desde` y `hasta` en formato YYYY-MM-DD.
 */
export interface ListFacturasParams {
  desde: string;
  hasta: string;
  sucursalId?: number;
  porPagina: number;
  paginaActual: number;
}

/**
 * /apifactura/info — shape no validado en POC porque no hubo facturaId
 * disponible al correr el discovery. Tipado conservador: aceptamos cualquier
 * cosa bajo `data` para que la sincronización lo pueda guardar en `raw_data`
 * y refinemos cuando lo probemos en vivo.
 */
export interface SwitchFacturaDetalle extends SwitchFactura {
  detalle?: unknown[];
  [key: string]: unknown;
}

// ─── Notas de Crédito / Débito ───────────────────────────────────────────────

/**
 * Item de /apinotacredito/lista (data.notascredito[]) y /apinotadebito/lista
 * (data.notasdebito[]). Mismo shape que SwitchFactura PERO sin tipoComprobante,
 * condicionVenta ni clienteEmail. Montos como string con coma de miles.
 *
 * OJO signos: las NCs llegan con total NEGATIVO desde la API (ej. "-497.00").
 * En storage se guardan POSITIVO (ABS); el signo lo aplica el cálculo de ventas
 * netas en query time (switch_ventas_netas_vw).
 */
export interface SwitchNota {
  id: number;
  secuencial: string;
  fecha: string;
  subTotal: string;
  descuento: string;
  subTotalDescuento: string;
  impuesto: string;
  total: string;
  saldo: string;
  cliente: string;
  clienteId: number;
  vendedor: string;
  vendedorId: number;
  sucursal: string;
  sucursalId: number;
  [key: string]: unknown;
}

export interface SwitchNotasCreditoData {
  notascredito: SwitchNota[];
  paginacion: SwitchPaginacion;
}

export interface SwitchNotasDebitoData {
  notasdebito: SwitchNota[];
  paginacion: SwitchPaginacion;
}

// ─── Reporte Total de Ventas (costo diario) ──────────────────────────────────

/**
 * /apireporte/totalventas?tipo=03 → data.totales es un objeto keyed por día
 * ("1".."31") con totales del mes EN CURSO. Único endpoint con costo completo
 * (incluye B2B). fecha es "DD-MM-YYYY". Montos string con coma de miles.
 */
export interface SwitchTotalVentasDia {
  total: string | number;
  costo: string | number;
  utilidad: string | number;
  etiqueta: number | string;
  fecha: string;
}

export interface SwitchTotalVentasData {
  totales: Record<string, SwitchTotalVentasDia>;
  totalventa: string | number;
  totalcosto: string | number;
  totalutilidad: string | number;
  [key: string]: unknown;
}

// ─── Estado de cuenta (CXC) ──────────────────────────────────────────────────

/**
 * Item de /apicliente/estadocuenta?clienteId=X (bajo data.estadocuenta.elements[]).
 * Montos llegan como string ("3,616.0000") o number según el campo; parsear con
 * parseAmount. fechaCreacion es "DD-MM-YYYY".
 */
export interface SwitchEstadoCuentaElement {
  ccteId: number;
  numeroOrden: string;
  secuencial: string;
  numeroFiscal: string;
  plazoCredito: string | number;
  total: string | number;
  saldo: string | number;
  tipoComprobante: string;
  abrev: string;
  tiporecibo: string | null;
  /** "DD-MM-YYYY" */
  fechaCreacion: string;
  dias: number;
  saldoConsecutivo: number;
  totalOriginal: string | number;
  saldoOriginal: string | number;
  debito: string | number;
  credito: string | number;
  [key: string]: unknown;
}

export interface SwitchEstadoCuentaData {
  estadocuenta: {
    elements: SwitchEstadoCuentaElement[];
  };
}

// ─── Errores ─────────────────────────────────────────────────────────────────

/**
 * Códigos conocidos de Switch que requieren re-auth. Verificados en vivo
 * (2026-05-30) probando la API real — el envelope de error es
 * { error: { code, message, http_code } }:
 *  - "0005" TOKEN EXPIRADO        (documentado)
 *  - "0008" NO SE HA ENCONTRADO UN TOKEN VALIDO  (token ausente → re-auth)
 *  - "0011" TOKEN INVALIDO        (verificado: token basura → HTTP 401 code 0011)
 *
 * NOTA: el code "0006" NO existe para token (auditoría 🟡-9). Los token-errors
 * llegan en HTTP 401, que el cliente ya re-autentica por fallback aunque el code
 * no esté en este set; el set importa para el caso "HTTP 200 con error en body".
 */
export const SWITCH_TOKEN_ERROR_CODES = new Set(["0005", "0008", "0011"]);
