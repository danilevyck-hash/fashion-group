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

const tokenCache = new Map<string, TokenEntry>();
const TOKEN_TTL_MS = 55 * 60 * 1000;

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
    throw new SwitchApiError({
      message: isAbort
        ? `Timeout >${opts.timeoutMs ?? DEFAULT_TIMEOUT_MS}ms en ${opts.endpoint}`
        : `Error de red en ${opts.endpoint}: ${err instanceof Error ? err.message : String(err)}`,
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

async function authenticate(
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

async function authedCall<T>(
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
  /** Limpia el token cacheado de esta empresa (fuerza re-auth en la próxima llamada). */
  clearTokenCache(): void;
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

    clearTokenCache() {
      tokenCache.delete(empresaKey);
    },
  };
}
