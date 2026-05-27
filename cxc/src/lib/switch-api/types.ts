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

// ─── Errores ─────────────────────────────────────────────────────────────────

/**
 * Códigos conocidos de Switch que requieren re-auth:
 *  - "0005" TOKEN EXPIRADO
 *  - "0011" TOKEN INVALIDO
 */
export const SWITCH_TOKEN_ERROR_CODES = new Set(["0005", "0011"]);
