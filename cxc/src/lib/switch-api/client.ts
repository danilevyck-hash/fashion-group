/**
 * Cliente reutilizable para Switch Soft API.
 *
 * Convención de env vars: SWITCH_<EMPRESA_KEY>_API_*
 *   - SWITCH_<EMPRESA_KEY>_API_URL
 *   - SWITCH_<EMPRESA_KEY>_API_USER
 *   - SWITCH_<EMPRESA_KEY>_API_PASSWORD
 *
 * Hardcoded por la API (descubierto en POC, contradice doc oficial):
 *   - Header de auth: `Authorization: <token>` (SIN "Bearer")
 *   - Body de /autenticacion: { usuario, password } JSON
 *   - Token JWT viene en response.data.token
 *   - Token expira ~60min aunque expires_in diga otra cosa
 *
 * Cache de token: en memoria del proceso, por empresaKey. No persiste en DB.
 * Re-auth automático en 401 con code 0005 (TOKEN EXPIRADO) o 0011 (TOKEN INVALIDO).
 */

import {
  ListFacturasParams,
  SWITCH_TOKEN_ERROR_CODES,
  SwitchApiResponse,
  SwitchAuthResponseData,
  SwitchClientesData,
  SwitchEstadoCuentaData,
  SwitchFacturaDetalle,
  SwitchFacturasData,
  SwitchNotasCreditoData,
  SwitchNotasDebitoData,
  SwitchPaginacion,
  SwitchSucursalesData,
  SwitchTotalVentasData,
  SwitchVendedoresData,
} from "./types";
import { resolveSwitchEnvKey } from "./empresas";

// ─── Errores ─────────────────────────────────────────────────────────────────

export class SwitchApiError extends Error {
  readonly code: string | null;
  readonly httpCode: number | null;
  readonly empresaKey: string;
  readonly endpoint: string;

  constructor(opts: {
    message: string;
    code: string | null;
    httpCode: number | null;
    empresaKey: string;
    endpoint: string;
  }) {
    super(opts.message);
    this.name = "SwitchApiError";
    this.code = opts.code;
    this.httpCode = opts.httpCode;
    this.empresaKey = opts.empresaKey;
    this.endpoint = opts.endpoint;
  }
}

// ─── Token cache (proceso) ───────────────────────────────────────────────────

interface TokenEntry {
  token: string;
  /** epoch ms en que el token deja de ser confiable. Usamos 55min para tener
   *  margen sobre el límite real (~60min) y caer en re-auth proactivo. */
  expiresAt: number;
}

// 🟢-17 (auditoría del sync): decisión deliberada de NO persistir el token fuera
// del proceso (ej. tabla con expiry). El cache en memoria ya evita re-auths
// DENTRO de un run (1 auth por empresa, reusada en todas sus páginas) — el 99%
// del costo. Persistir solo ahorraría 1 POST liviano por empresa por cold start,
// y como los crons corren ~1×/día (>55min entre corridas) un token persistido
// casi siempre estaría expirado al arrancar → re-auth igual (hit-rate ≈ 0). No
// compensa la complejidad ni el riesgo de guardar un JWT de sesión en reposo.
// Reconsiderar solo si el sync pasa a correr muchas veces por hora.
const tokenCache = new Map<string, TokenEntry>();
const TOKEN_TTL_MS = 55 * 60 * 1000;

// ─── Reintentos ante fallos transitorios de Switch ───────────────────────────
//
// Switch flaquea de forma intermitente de tres maneras observadas en producción
// (switch_sync_log, 5-jun-2026): (1) `/autenticacion` con timeout >30s,
// (2) `TOKEN INVALIDO` a media paginación cuando otra invocación a la MISMA
// empresa mata la sesión única (single-session), (3) 5xx upstream. El cliente
// ya hace UN re-auth dentro de authedCall, pero si el 2do token también muere
// (colisión de sesión) o si el propio /autenticacion expira, la corrida fallaba
// sin reintento → la empresa quedaba stale un día entero (caso active_shoes /
// active_wear). Este es el mismo patrón "robusto" de los backfills de FASE C:
// re-auth + reintentos con backoff. Solo se activa ante errores TRANSITORIOS:
// fallo de RED (fetch failed / ECONNRESET / ETIMEDOUT / ENOTFOUND → httpCode null),
// timeout, o 5xx upstream. Los errores HTTP de negocio de Switch (config/env
// faltante, 4xx de datos) NO se reintentan — se manejan como hoy.
// Backoff: 2s tras el 1er fallo, 4s tras el 2do (RETRY_BASE_DELAY_MS × intento).
const MAX_AUTH_ATTEMPTS = 3;
const MAX_CALL_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 2_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientSwitchError(err: unknown): boolean {
  if (!(err instanceof SwitchApiError)) return false;
  if (err.endpoint === "(config)") return false;            // env var faltante → no reintentar
  if (err.httpCode === null) return true;                   // timeout / error de red
  if (err.httpCode >= 500) return true;                     // 5xx upstream
  if (err.httpCode === 401 || err.httpCode === 403) return true;
  if (err.code !== null && SWITCH_TOKEN_ERROR_CODES.has(err.code)) return true; // token inválido en body 200
  return false;
}

// ─── Config por empresa ──────────────────────────────────────────────────────

interface EmpresaConfig {
  url: string;
  user: string;
  password: string;
}

function readConfig(empresaKey: string): EmpresaConfig {
  // Resuelve la empresa_key canónica (american_classic, vistana, ...) al
  // namespace de env vars que armó Daniel (MULTIFASHION, VISTANA_INTERNATIONAL,
  // ...). Acepta también un env key directo ("multifashion") por compat.
  const upper = resolveSwitchEnvKey(empresaKey);
  const url = process.env[`SWITCH_${upper}_API_URL`];
  const user = process.env[`SWITCH_${upper}_API_USER`];
  const password = process.env[`SWITCH_${upper}_API_PASSWORD`];

  const missing: string[] = [];
  if (!url) missing.push(`SWITCH_${upper}_API_URL`);
  if (!user) missing.push(`SWITCH_${upper}_API_USER`);
  if (!password) missing.push(`SWITCH_${upper}_API_PASSWORD`);

  if (missing.length > 0) {
    throw new SwitchApiError({
      message: `Faltan env vars para empresa "${empresaKey}": ${missing.join(", ")}`,
      code: null,
      httpCode: null,
      empresaKey,
      endpoint: "(config)",
    });
  }

  return { url: url!.replace(/\/+$/, ""), user: user!, password: password! };
}

// ─── HTTP helpers ────────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 30_000;

interface CallOptions {
  empresaKey: string;
  endpoint: string;
  method: "GET" | "POST";
  body?: unknown;
  token?: string;
  timeoutMs?: number;
}

interface CallResult {
  httpCode: number;
  text: string;
  parsed: unknown;
}

async function rawCall(
  cfg: EmpresaConfig,
  opts: CallOptions,
): Promise<CallResult> {
  const url = `${cfg.url}${opts.endpoint}`;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.token) headers["Authorization"] = opts.token;

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );

  try {
    const res = await fetch(url, {
      method: opts.method,
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
    });
    const text = await res.text();
    let parsed: unknown = null;
    if (text.length > 0) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = null;
      }
    }
    return { httpCode: res.status, text, parsed };
  } catch (err: unknown) {
    const isAbort = err instanceof Error && err.name === "AbortError";
    // El "fetch failed" de undici trae la causa real (ECONNRESET/ETIMEDOUT/ENOTFOUND)
    // en err.cause.code — la incluimos para diagnóstico (no cambia la clasificación:
    // todo fallo de red queda httpCode null = transitorio → reintenta authenticate/authedCall).
    const cause = (err as { cause?: { code?: unknown } } | null)?.cause;
    const causeCode = cause && typeof cause === "object" && typeof (cause as { code?: unknown }).code === "string"
      ? ` (${(cause as { code: string }).code})` : "";
    throw new SwitchApiError({
      message: isAbort
        ? `Timeout >${opts.timeoutMs ?? DEFAULT_TIMEOUT_MS}ms en ${opts.endpoint}`
        : `Error de red en ${opts.endpoint}: ${err instanceof Error ? err.message : String(err)}${causeCode}`,
      code: null,
      httpCode: null,
      empresaKey: opts.empresaKey,
      endpoint: opts.endpoint,
    });
  } finally {
    clearTimeout(timer);
  }
}

function extractCode(parsed: unknown): string | null {
  if (!parsed || typeof parsed !== "object") return null;
  const p = parsed as Record<string, unknown>;
  if (typeof p.code === "string") return p.code;
  // Switch entrega los errores como { error: { code, message, http_code } }
  // (verificado en vivo: token inválido → {"error":{"code":"0011",...}}). Sin
  // leer error.code, el código de error quedaba invisible en respuestas que no
  // fueran 401/403 — incluido el caso "200 con error en el body".
  if (p.error && typeof p.error === "object") {
    const e = p.error as Record<string, unknown>;
    if (typeof e.code === "string") return e.code;
  }
  if (p.data && typeof p.data === "object") {
    const d = p.data as Record<string, unknown>;
    if (typeof d.code === "string") return d.code;
  }
  return null;
}

function extractMessage(parsed: unknown, fallback: string): string {
  if (!parsed || typeof parsed !== "object") return fallback;
  const p = parsed as Record<string, unknown>;
  if (typeof p.message === "string") return p.message;
  if (p.error && typeof p.error === "object") {
    const e = p.error as Record<string, unknown>;
    if (typeof e.message === "string") return e.message;
  }
  if (p.data && typeof p.data === "object") {
    const d = p.data as Record<string, unknown>;
    if (typeof d.message === "string") return d.message;
  }
  return fallback;
}

function isTokenInvalidResponse(httpCode: number, parsed: unknown): boolean {
  if (httpCode !== 401 && httpCode !== 403) {
    // Switch a veces devuelve 200 con code de error en el body.
    const code = extractCode(parsed);
    return code !== null && SWITCH_TOKEN_ERROR_CODES.has(code);
  }
  const code = extractCode(parsed);
  if (code !== null) return SWITCH_TOKEN_ERROR_CODES.has(code);
  // 401/403 sin code explícito → asumir token inválido.
  return true;
}

// ─── Auth ────────────────────────────────────────────────────────────────────

async function authenticateOnce(
  empresaKey: string,
  cfg: EmpresaConfig,
): Promise<string> {
  const result = await rawCall(cfg, {
    empresaKey,
    endpoint: "/autenticacion",
    method: "POST",
    body: { usuario: cfg.user, password: cfg.password },
  });

  if (result.httpCode !== 200) {
    throw new SwitchApiError({
      message: `Auth fallo: HTTP ${result.httpCode} — ${extractMessage(result.parsed, result.text.slice(0, 200))}`,
      code: extractCode(result.parsed),
      httpCode: result.httpCode,
      empresaKey,
      endpoint: "/autenticacion",
    });
  }

  const parsed = result.parsed as SwitchApiResponse<SwitchAuthResponseData> | null;
  const token = parsed?.data?.token;
  if (!token || typeof token !== "string") {
    throw new SwitchApiError({
      message: `Auth respondió 200 pero sin token: ${result.text.slice(0, 200)}`,
      code: null,
      httpCode: 200,
      empresaKey,
      endpoint: "/autenticacion",
    });
  }

  tokenCache.set(empresaKey, {
    token,
    expiresAt: Date.now() + TOKEN_TTL_MS,
  });
  return token;
}

// Re-auth con reintentos ante fallo de RED / timeout / 5xx del propio
// /autenticacion (3 intentos, backoff 2s/4s). Un error HTTP de negocio de Switch
// (4xx de datos) NO se reintenta — sale al primer intento, como hoy.
async function authenticate(
  empresaKey: string,
  cfg: EmpresaConfig,
): Promise<string> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_AUTH_ATTEMPTS; attempt++) {
    try {
      return await authenticateOnce(empresaKey, cfg);
    } catch (err) {
      lastErr = err;
      if (!isTransientSwitchError(err) || attempt === MAX_AUTH_ATTEMPTS) throw err;
      console.warn(`[switch ${empresaKey}] auth intento ${attempt}/${MAX_AUTH_ATTEMPTS} falló (${err instanceof Error ? err.message : err}); reintentando`);
      await sleep(RETRY_BASE_DELAY_MS * attempt);
    }
  }
  throw lastErr;
}

async function getToken(
  empresaKey: string,
  cfg: EmpresaConfig,
): Promise<string> {
  const cached = tokenCache.get(empresaKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.token;
  }
  return authenticate(empresaKey, cfg);
}

// ─── Llamada autenticada con re-auth automático ──────────────────────────────

async function authedCallOnce<T>(
  empresaKey: string,
  cfg: EmpresaConfig,
  endpoint: string,
  method: "GET" | "POST",
  body?: unknown,
): Promise<T> {
  let token = await getToken(empresaKey, cfg);

  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await rawCall(cfg, {
      empresaKey,
      endpoint,
      method,
      body,
      token,
    });

    if (
      attempt === 0 &&
      isTokenInvalidResponse(result.httpCode, result.parsed)
    ) {
      tokenCache.delete(empresaKey);
      token = await authenticate(empresaKey, cfg);
      continue;
    }

    if (result.httpCode < 200 || result.httpCode >= 300) {
      throw new SwitchApiError({
        message: `${endpoint} → HTTP ${result.httpCode}: ${extractMessage(result.parsed, result.text.slice(0, 200))}`,
        code: extractCode(result.parsed),
        httpCode: result.httpCode,
        empresaKey,
        endpoint,
      });
    }

    if (!result.parsed || typeof result.parsed !== "object") {
      throw new SwitchApiError({
        message: `${endpoint} → respuesta no es JSON válido`,
        code: null,
        httpCode: result.httpCode,
        empresaKey,
        endpoint,
      });
    }

    const envelope = result.parsed as { data?: T };
    if (envelope.data === undefined) {
      throw new SwitchApiError({
        message: `${endpoint} → respuesta sin envelope data`,
        code: null,
        httpCode: result.httpCode,
        empresaKey,
        endpoint,
      });
    }
    return envelope.data;
  }

  // Inalcanzable — el loop sale por return o throw.
  throw new SwitchApiError({
    message: `${endpoint} → loop de re-auth agotado`,
    code: null,
    httpCode: null,
    empresaKey,
    endpoint,
  });
}

// Retry externo con backoff ante fallos transitorios que sobreviven al re-auth
// inmediato de authedCallOnce (timeout, token muerto por colisión de sesión,
// 5xx). Entre intentos limpiamos el token cacheado para forzar una sesión
// fresca — es justo lo que destraba el "TOKEN INVALIDO" de single-session.
async function authedCall<T>(
  empresaKey: string,
  cfg: EmpresaConfig,
  endpoint: string,
  method: "GET" | "POST",
  body?: unknown,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_CALL_ATTEMPTS; attempt++) {
    try {
      return await authedCallOnce<T>(empresaKey, cfg, endpoint, method, body);
    } catch (err) {
      lastErr = err;
      if (!isTransientSwitchError(err) || attempt === MAX_CALL_ATTEMPTS) throw err;
      tokenCache.delete(empresaKey); // sesión fresca en el próximo intento
      console.warn(`[switch ${empresaKey}] ${endpoint} intento ${attempt}/${MAX_CALL_ATTEMPTS} falló (${err instanceof Error ? err.message : err}); reintentando`);
      await sleep(RETRY_BASE_DELAY_MS * attempt);
    }
  }
  throw lastErr;
}

// ─── API pública ─────────────────────────────────────────────────────────────

export interface SwitchClient {
  empresaKey: string;
  listFacturas(params: ListFacturasParams): Promise<SwitchFacturasData>;
  /** Notas de crédito del rango. Total llega NEGATIVO (reducen ventas). */
  listNotasCredito(params: ListFacturasParams): Promise<SwitchNotasCreditoData>;
  /** Notas de débito del rango. Total positivo (suman a ventas). */
  listNotasDebito(params: ListFacturasParams): Promise<SwitchNotasDebitoData>;
  getFactura(facturaId: number | string): Promise<SwitchFacturaDetalle>;
  listSucursales(): Promise<SwitchSucursalesData>;
  listVendedores(params: {
    porPagina: number;
    paginaActual: number;
  }): Promise<SwitchVendedoresData>;
  listClientes(params: {
    porPagina: number;
    paginaActual: number;
  }): Promise<SwitchClientesData>;
  /** Estado de cuenta (CXC) de un cliente: facturas/NC abiertas con saldo y aging. */
  getEstadoCuenta(clienteId: number | string): Promise<SwitchEstadoCuentaData>;
  /** Reporte "Total de ventas" del mes EN CURSO (tipo=03): totales diarios con
   *  costo completo (incluye B2B). Único endpoint con costo recuperable. */
  getReporteMesActual(): Promise<SwitchTotalVentasData>;
  /** Ventas por sucursal/dia/articulo con costo (/apireporte/ventasucursal). Por
   *  UN dia. NC vienen POSITIVAS; firmar por tipo al leer. Sin ND. Paginacion 50. */
  getVentaSucursal(params: { fecha: string; sucursalId: number; porPagina: number; paginaActual: number }): Promise<SwitchVentaSucursalData>;
  /** Reporte de recibos (cobros) del rango. Un row por recibo. Paginación de 50. */
  listRecibos(params: ListFacturasParams): Promise<SwitchRecibosData>;
  /** Directorio de proveedores. Paginación de 50. (/apiproveedor/lista) */
  listProveedores(params: { porPagina: number; paginaActual: number }): Promise<SwitchProveedoresData>;
  /** Estado de cuenta CxP de un proveedor: saldo total, aging bucketizado y ledger
   *  (facturas + pagos). Endpoint NO documentado (/apiproveedor/info) — devuelve 200
   *  incluso en error (página HTML); validar el SHAPE de la respuesta, no el status. */
  getProveedorInfo(proveedorId: number | string): Promise<SwitchProveedorInfoData>;
  /** Maestro de artículos (catálogo de productos con precio + disponibilidad).
   *  Paginación de 50 (/apiarticulos/lista). Un row por artículo (codigo único).
   *  OJO: trae `disponible` pero NO `saldo` (existencia física) — eso vive en
   *  getStock. */
  getArticulos(params: { porPagina: number; paginaActual: number; filtro?: string }): Promise<SwitchArticulosData>;
  /** Stock por sucursal de UN artículo (/apiarticulos/stock?articuloId=X). Trae
   *  `saldo` (existencia física) y `disponible` (disponibilidad). Una llamada por
   *  artículo — usar con moderación (no hay bulk). */
  getStock(articuloId: number | string): Promise<SwitchStockData>;
  /** Talla y color de UN artículo por sucursal (/apiarticulos/tallacolor, doc
   *  pág 38). Devuelve el codigoBarraId de cada combinación talla/color con
   *  saldo/disponible por sucursal. `sucursalId` opcional (de /apisucursal/lista)
   *  filtra la info a una sucursal específica. */
  apiarticulosTallaColor(params: {
    articuloId: number | string;
    sucursalId?: number | string;
  }): Promise<SwitchTallaColorData>;
  /** Detalle de un pedido (/apipedido/info?pedidoId=X, doc págs 50-51):
   *  data.pedido (cabecera con cliente/vendedor/impuestos/urlswitchpay) +
   *  data.detalle[] (líneas con codigoBarraId, cantidad, precio, descuentos). */
  apipedidoInfo(pedidoId: number | string): Promise<SwitchPedidoInfoData>;
  /** Crea un pedido (POST /apipedido/terminar, doc págs 51-53). PRIMER endpoint
   *  POST de negocio del cliente (hasta ahora el único POST era /autenticacion).
   *  Los valores de articulos[] van como STRING con decimales (ej. cantidad
   *  "1.0000", descuento "0.00"). Descuentos: primero por línea, luego el global
   *  ($100 −5% = $95 −20% = $76, doc pág 51). */
  apipedidoTerminar(
    params: SwitchPedidoTerminarParams,
  ): Promise<SwitchPedidoTerminarData>;
  /** Cierre diario de caja (/apireporte/diarioventas, doc pág 17): totales de
   *  ventas/NC/impuestos/descuentos + desglose por forma de pago. VERIFICADO EN
   *  VIVO (4-jul-2026, MULTI): `hasta` es EXCLUSIVO — para el día D pasar
   *  desde=D, hasta=D+1 (con desde=hasta responde todo en cero). El corte de
   *  día es hora LOCAL (Panamá); granTotal cuadró al centavo con
   *  switch_facturas 3 días seguidos. OJO: totalDescuentos trae valores no
   *  confiables (≈ granTotal) — mostrar con reserva. */
  getDiarioVentas(params: {
    sucursalId: number;
    desde: string;
    hasta: string;
  }): Promise<SwitchDiarioVentasData>;
  /** POST /apipermiso?proceso=NNNN — ¿el usuario del token puede realizar el
   *  proceso? (0001=cambiar precio, 0002=descuento, doc pág 11). Verificado en
   *  vivo 5-jul: responde {permiso:true|false}. */
  verificarPermiso(proceso: string): Promise<boolean>;
  /** POST /cierresesion best-effort: cierra la sesión única de Switch para no
   *  dejar un token vivo que mate el login del próximo cron (code 0006).
   *  NUNCA lanza. Solo actúa si hay token cacheado — loguearse solo para
   *  desloguearse crearía justo la colisión que se quiere evitar. */
  logout(): Promise<void>;
  /** Limpia el token cacheado de esta empresa (fuerza re-auth en la próxima llamada). */
  clearTokenCache(): void;
}

/** Respuesta (data.diarioDeVentas) de /apireporte/diarioventas. Montos como
 *  strings numéricos salvo granTotal (number). totalNotasCredito llega
 *  NEGATIVA (NC nativas negativas, mismo quirk que /apinotacredito). */
export interface SwitchDiarioVentas {
  fecha: string;                       // "2026-07-03 / 2026-07-03"
  ultimaVenta: string;
  fechaUltimaVenta: string;            // DD-MM-YYYY
  horaUltimaVenta: string;
  totalVentasEmitidas: string;         // count de facturas
  totalVentas: string;
  totalImpuestoVenta: string;
  totalNotaCreditoEmitidas: string;
  totalNotasCredito: string;
  totalImpuestoNotaCredito: string;
  totalDescuentos: string;
  granTotal: number;
  totalProductos: string | number;
  formasDePago: Array<{ nombre: string; total: string }>;
}

export interface SwitchDiarioVentasData {
  diarioDeVentas: SwitchDiarioVentas;
}

/** Row de /apiarticulos/stock (data.stock[]). `saldo` = existencia física,
 *  `disponible` = disponibilidad (existencia − comprometido). Strings numéricos. */
export interface SwitchStockRow {
  articuloCodigo: string;
  sucursalId: number;
  sucursal: string;
  saldo: string | null;
  disponible: string | null;
  costo: string | null;
}

export interface SwitchStockData {
  stock: SwitchStockRow[];
}

/** Item de /apiarticulos/lista (data.articulos[]). `precio`/`disponible`/`costo`
 *  llegan como STRING ("83.9000", "-8.0000"); parsear con parseFloat. `talla`/
 *  `color` son null para Reebok (sin variantes). `disponible` puede ser negativo. */
export interface SwitchArticulo {
  id: number;
  codigo: string;
  descripcion: string | null;
  /** ID interno del código de barra en Switch (numérico; distinto del EAN `codigoBarra`). */
  codigoBarraId: number | null;
  costo: string | null;
  disponible: string | null;
  precio: string | null;
  talla: string | null;
  color: string | null;
  marcaId: number | null;
  proveedor: string | null;
}

export interface SwitchArticulosData {
  articulos: SwitchArticulo[];
}

/** Item de /apiproveedor/lista (data.proveedores[]). */
export interface SwitchProveedor {
  id: number;
  nombre: string;
  identificacion: string | null;
  dv: string | null;
  direccion: string | null;
  contacto: string | null;
  telefono: string | null;
  celular: string | null;
  email: string | null;
  tipoproveedor: string | null;
  [key: string]: unknown;
}
export interface SwitchProveedoresData {
  proveedores: SwitchProveedor[];
  paginacion: SwitchPaginacion;
}

/** Bucket de aging de estadodecuenta.saldos[] (lo calcula Switch). */
export interface SwitchProveedorSaldoBucket {
  title: string;            // "0-30" | "31-60" | ... | "Mas de 365"
  saldo: number | string;
}
/** Fila del ledger estadodecuenta.elements[]. */
export interface SwitchProveedorElement {
  ccteId: number;
  numeroOrden: string | null;
  numeroComprobante: string | null;
  secuencial: string | null;
  total: number | string;
  saldo: number | string;
  tipoComprobante: string;  // "Factura" | "Pago a proveedores" | ...
  abrev: string;            // "FA" | "PP" | ...
  // YYYY-MM-DD. Decía "DD-MM-YYYY" (copiado del estado de cuenta de CXC, que sí
  // usa ese formato) y el parser del sync le creyó: 821/821 renglones reales
  // vienen en YYYY-MM-DD. Ver src/lib/proveedores-derivados.ts.
  fechaCreacion: string;
  dias: number;             // días transcurridos, en VALOR ABSOLUTO (un doc futuro también da positivo)
  saldoConsecutivo: number | string; // acumulado corrido, NO el monto del documento
  credito: number | string; // cargos: es el SALDO abierto del documento, no su total
  debito: number | string;  // pagos y notas de crédito: saldo abierto, no el total
  [key: string]: unknown;
}
/** Respuesta de /apiproveedor/info. */
export interface SwitchProveedorInfoData {
  proveedor: {
    id: number;
    codigo?: string | null;
    nombre: string;
    identificacion?: string | null;
    dv?: string | null;
    direccion?: string | null;
    contacto?: string | null;
    telefono?: string | null;
    celular?: string | null;
    email?: string | null;
    tipoproveedor?: string | null;
    tipoIdentificacion?: string | null;
    [key: string]: unknown;
  };
  estadodecuenta: {
    saldoTotal: number | string;
    saldos: SwitchProveedorSaldoBucket[];
    proveedor: { proveedorId: number; codigo?: string | null; nombre: string };
    elements: SwitchProveedorElement[];
  };
}

/** Item de /apireporte/recibos (data.recibos[]). Sin id/secuencial de recibo. */
export interface SwitchReciboReporte {
  fechaCreacion: string;
  vendedorId: number | null;
  vendedor: string | null;
  clienteId: number | null;
  clienteCodigo: string | null;
  clienteNombre: string | null;
  total: string | number;
  [key: string]: unknown;
}
export interface SwitchRecibosData {
  recibos: SwitchReciboReporte[];
  paginacion: SwitchPaginacion;
}

/** Item de /apireporte/ventasucursal (data.ventasucursal[]). Agregado por
 *  articulo x dia x tipo. ventatotal/costototal son MAGNITUD (NC viene positiva). */
export interface SwitchArticuloVenta {
  fecha: string;
  articuloId: number;
  codigo: string | null;
  descripcion: string | null;
  unidadmedidaId: number | null;
  tipo: string;                 // FA | NC | CNF | ...
  totalcomprobantes: number;
  cantidadtotal: string | number;
  ventatotal: string | number;
  costototal: string | number;
  [key: string]: unknown;
}
export interface SwitchVentaSucursalData {
  ventasucursal: SwitchArticuloVenta[];
  paginacion?: SwitchPaginacion;
}

// ─── Pedidos (/apipedido/*) y talla-color ────────────────────────────────────

/** Row de /apiarticulos/tallacolor (data.tallacolor[], doc pág 38). Un row por
 *  combinación talla/color × sucursal. `saldo` = existencia física del artículo
 *  para esa talla/color, `disponible` = disponibilidad. Strings numéricos. */
export interface SwitchTallaColorRow {
  codigoBarraId: number;
  codigoBarra: string | null;
  color: string | null;
  talla: string | null;
  saldo: string | number | null;
  disponible: string | number | null;
  sucursalId: number;
  sucursal: string;
  [key: string]: unknown;
}

export interface SwitchTallaColorData {
  tallacolor: SwitchTallaColorRow[];
}

/** Línea de `articulos` para POST /apipedido/terminar. TODOS los valores van
 *  como STRING con decimales — el mismo formato con que el API devuelve montos
 *  (4 decimales): cantidad "1.0000", precio "20.50", descuento "0.00". Ejemplo
 *  de la doc (pág 52): {"codigoBarraId":"123","cantidad":"120.0000",
 *  "precio":"20.50","descuento":"10.00"}. */
export interface SwitchPedidoLineaInput {
  /** Id del código de barra (de apiarticulosTallaColor / apiarticulos). */
  codigoBarraId: string;
  cantidad: string;
  precio: string;
  /** Porcentaje de descuento por línea ("0.00" si no aplica). */
  descuento: string;
  /** Opcional: vendedor por línea; si no se envía, Switch usa el vendedor
   *  principal del pedido. */
  vendedorId?: string;
}

export interface SwitchPedidoTerminarParams {
  vendedorId: number;
  clienteId: number;
  articulos: SwitchPedidoLineaInput[];
  /** Porcentaje de descuento global del pedido (opcional). Se aplica DESPUÉS
   *  del descuento por línea. String con decimales, ej. "5.00". */
  descuentoGlobal?: string;
}

/** Respuesta (data) de POST /apipedido/terminar. */
export interface SwitchPedidoTerminarData {
  mensaje: string;
  numeroInterno: string | number;
  pedidoId: number | string;
  clienteEmail: string | null;
  urlswitchpay: string | null;
  [key: string]: unknown;
}

/** Cabecera de /apipedido/info (data.pedido). Impuestos (doc pág 51): si
 *  clienteImpuestoCodigo ≠ "R", cada línea usa el MENOR entre clienteImpuesto y
 *  articuloImpuesto; si es "R" usa siempre articuloImpuesto. */
export interface SwitchPedidoInfo {
  clienteId: number;
  pedidoId: number;
  cliente: string;
  clienteEmail: string | null;
  vendedorId: number;
  vendedor: string;
  clienteImpuesto: string | number | null;
  clienteImpuestoCodigo: string | null;
  urlswitchpay: string | null;
  [key: string]: unknown;
}

/** Línea de /apipedido/info (data.detalle[]). Montos como strings numéricos;
 *  descuento/descuentoGlobal son PORCENTAJES, no montos. */
export interface SwitchPedidoDetalleLinea {
  codigoBarraId: number;
  codigobarra: string | null;
  articuloId: number;
  codigoArticulo: string | null;
  imagen: string | null;
  cantidad: string | number;
  precio: string | number;
  descuento: string | number;
  descuentoGlobal: string | number | null;
  vendedorId: number | null;
  articuloImpuesto: string | number | null;
  articuloImpuestoCodigo: string | null;
  descripcion: string | null;
  tipoArticulo: string | null;
  [key: string]: unknown;
}

export interface SwitchPedidoInfoData {
  pedido: SwitchPedidoInfo;
  detalle: SwitchPedidoDetalleLinea[];
}

/** Cierra (best-effort, POST /cierresesion) TODAS las sesiones de Switch que
 *  este proceso abrió — itera el token cache, así que cierra exactamente lo que
 *  se autenticó en esta invocación y nada más (no-op si no hubo logins).
 *  Para el `finally` de cada cron: sin esto el token queda vivo ~60min y mata
 *  el login del próximo cron que toque la MISMA empresa (sesión única, code
 *  0006). NUNCA lanza — la higiene de sesión jamás debe romper un cron. */
export async function logoutAllSwitchSessions(): Promise<void> {
  for (const key of [...tokenCache.keys()]) {
    try {
      await createSwitchClient(key).logout();
    } catch {
      // readConfig puede lanzar por env faltante — best-effort, seguir.
    }
  }
}

export function createSwitchClient(empresaKey: string): SwitchClient {
  const cfg = readConfig(empresaKey);

  return {
    empresaKey,

    async listFacturas(params) {
      const qs = new URLSearchParams({
        desde: params.desde,
        hasta: params.hasta,
        porPagina: String(params.porPagina),
        paginaActual: String(params.paginaActual),
      });
      if (params.sucursalId !== undefined) {
        qs.set("sucursalId", String(params.sucursalId));
      }
      return authedCall<SwitchFacturasData>(
        empresaKey,
        cfg,
        `/apifactura/lista?${qs.toString()}`,
        "GET",
      );
    },

    async listNotasCredito(params) {
      const qs = new URLSearchParams({
        desde: params.desde,
        hasta: params.hasta,
        porPagina: String(params.porPagina),
        paginaActual: String(params.paginaActual),
      });
      if (params.sucursalId !== undefined) qs.set("sucursalId", String(params.sucursalId));
      return authedCall<SwitchNotasCreditoData>(
        empresaKey,
        cfg,
        `/apinotacredito/lista?${qs.toString()}`,
        "GET",
      );
    },

    async listNotasDebito(params) {
      const qs = new URLSearchParams({
        desde: params.desde,
        hasta: params.hasta,
        porPagina: String(params.porPagina),
        paginaActual: String(params.paginaActual),
      });
      if (params.sucursalId !== undefined) qs.set("sucursalId", String(params.sucursalId));
      return authedCall<SwitchNotasDebitoData>(
        empresaKey,
        cfg,
        `/apinotadebito/lista?${qs.toString()}`,
        "GET",
      );
    },

    async getFactura(facturaId) {
      const qs = new URLSearchParams({ facturaId: String(facturaId) });
      return authedCall<SwitchFacturaDetalle>(
        empresaKey,
        cfg,
        `/apifactura/info?${qs.toString()}`,
        "GET",
      );
    },

    async listSucursales() {
      return authedCall<SwitchSucursalesData>(
        empresaKey,
        cfg,
        "/apisucursal/lista",
        "GET",
      );
    },

    async listVendedores(params) {
      const qs = new URLSearchParams({
        porPagina: String(params.porPagina),
        paginaActual: String(params.paginaActual),
      });
      return authedCall<SwitchVendedoresData>(
        empresaKey,
        cfg,
        `/apivendedor/lista?${qs.toString()}`,
        "GET",
      );
    },

    async listClientes(params) {
      const qs = new URLSearchParams({
        porPagina: String(params.porPagina),
        paginaActual: String(params.paginaActual),
      });
      return authedCall<SwitchClientesData>(
        empresaKey,
        cfg,
        `/apicliente/lista?${qs.toString()}`,
        "GET",
      );
    },

    async getEstadoCuenta(clienteId) {
      const qs = new URLSearchParams({ clienteId: String(clienteId) });
      return authedCall<SwitchEstadoCuentaData>(
        empresaKey,
        cfg,
        `/apicliente/estadocuenta?${qs.toString()}`,
        "GET",
      );
    },

    async getReporteMesActual() {
      return authedCall<SwitchTotalVentasData>(
        empresaKey,
        cfg,
        `/apireporte/totalventas?tipo=03`,
        "GET",
      );
    },

    async getVentaSucursal(params) {
      const qs = new URLSearchParams({
        sucursalId: String(params.sucursalId),
        fecha: params.fecha,
        porPagina: String(params.porPagina),
        paginaActual: String(params.paginaActual),
      });
      return authedCall<SwitchVentaSucursalData>(
        empresaKey,
        cfg,
        `/apireporte/ventasucursal?${qs.toString()}`,
        "GET",
      );
    },

    async getArticulos(params) {
      const qs = new URLSearchParams({
        porPagina: String(params.porPagina),
        paginaActual: String(params.paginaActual),
      });
      if (params.filtro) qs.set("filtro", params.filtro);
      return authedCall<SwitchArticulosData>(
        empresaKey,
        cfg,
        `/apiarticulos/lista?${qs.toString()}`,
        "GET",
      );
    },

    async getStock(articuloId) {
      const qs = new URLSearchParams({ articuloId: String(articuloId) });
      return authedCall<SwitchStockData>(
        empresaKey,
        cfg,
        `/apiarticulos/stock?${qs.toString()}`,
        "GET",
      );
    },

    async listRecibos(params) {
      const qs = new URLSearchParams({
        desde: params.desde,
        hasta: params.hasta,
        porPagina: String(params.porPagina),
        paginaActual: String(params.paginaActual),
      });
      if (params.sucursalId !== undefined) qs.set("sucursalId", String(params.sucursalId));
      return authedCall<SwitchRecibosData>(
        empresaKey,
        cfg,
        `/apireporte/recibos?${qs.toString()}`,
        "GET",
      );
    },

    async listProveedores(params) {
      const qs = new URLSearchParams({
        porPagina: String(params.porPagina),
        paginaActual: String(params.paginaActual),
      });
      return authedCall<SwitchProveedoresData>(
        empresaKey,
        cfg,
        `/apiproveedor/lista?${qs.toString()}`,
        "GET",
      );
    },

    async getProveedorInfo(proveedorId) {
      const qs = new URLSearchParams({ proveedorId: String(proveedorId) });
      return authedCall<SwitchProveedorInfoData>(
        empresaKey,
        cfg,
        `/apiproveedor/info?${qs.toString()}`,
        "GET",
      );
    },

    async apiarticulosTallaColor(params) {
      const qs = new URLSearchParams({ articuloId: String(params.articuloId) });
      if (params.sucursalId !== undefined) {
        qs.set("sucursalId", String(params.sucursalId));
      }
      return authedCall<SwitchTallaColorData>(
        empresaKey,
        cfg,
        `/apiarticulos/tallacolor?${qs.toString()}`,
        "GET",
      );
    },

    async apipedidoInfo(pedidoId) {
      const qs = new URLSearchParams({ pedidoId: String(pedidoId) });
      return authedCall<SwitchPedidoInfoData>(
        empresaKey,
        cfg,
        `/apipedido/info?${qs.toString()}`,
        "GET",
      );
    },

    async apipedidoTerminar(params) {
      // Body como JSON (igual que /autenticacion). La doc NO especifica
      // content-type para este POST: si Switch rechaza el body JSON, el
      // fallback a probar en el piloto es form-urlencoded con `articulos`
      // como string JSON (la doc pág 52 muestra articulos como "JSON").
      const body: Record<string, unknown> = {
        vendedorId: params.vendedorId,
        clienteId: params.clienteId,
        articulos: params.articulos,
      };
      if (params.descuentoGlobal !== undefined) {
        body.descuentoGlobal = params.descuentoGlobal;
      }
      return authedCall<SwitchPedidoTerminarData>(
        empresaKey,
        cfg,
        "/apipedido/terminar",
        "POST",
        body,
      );
    },

    async getDiarioVentas(params) {
      const qs = new URLSearchParams({
        sucursalId: String(params.sucursalId),
        desde: params.desde,
        hasta: params.hasta,
      });
      return authedCall<SwitchDiarioVentasData>(
        empresaKey,
        cfg,
        `/apireporte/diarioventas?${qs.toString()}`,
        "GET",
      );
    },

    async verificarPermiso(proceso) {
      const data = await authedCall<{ permiso: boolean | string }>(
        empresaKey,
        cfg,
        `/apipermiso?proceso=${encodeURIComponent(proceso)}`,
        "POST",
      );
      return data.permiso === true || data.permiso === "true" || data.permiso === "TRUE";
    },

    async logout() {
      const cached = tokenCache.get(empresaKey);
      if (!cached) return;
      tokenCache.delete(empresaKey);
      try {
        await rawCall(cfg, {
          empresaKey,
          endpoint: "/cierresesion",
          method: "POST",
          token: cached.token,
          timeoutMs: 10_000,
        });
      } catch {
        // Best-effort: el token expira solo en ~60min de todas formas.
      }
    },

    clearTokenCache() {
      tokenCache.delete(empresaKey);
    },
  };
}
