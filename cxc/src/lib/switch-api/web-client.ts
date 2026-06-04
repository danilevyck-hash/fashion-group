/**
 * Cliente WEB de Switch (reporte de utilidad por documento).
 *
 * A diferencia de `client.ts` (API JSON con token JWT), este cliente habla con
 * la APP WEB Laravel de Switch para leer el reporte "Listado de comprobantes"
 * (`/reportesventa/facturas`), que es la ÚNICA fuente de costo/utilidad por
 * documento. No existe endpoint JSON equivalente.
 *
 * Auth (descubierto en vivo 2026-06):
 *   1. GET  /users/login            → cookies (XSRF-TOKEN, switch_laravel_session) + `_token` (CSRF) del HTML.
 *   2. POST /users/login (multipart) → { _token, usuario, password, changesession: "SI" }.
 *        ⚠️ changesession DEBE ser "SI": con "NO" redirige a /users/opensession y NO
 *        autentica si ya hay sesión activa. "SI" toma la sesión → EXPULSA a quien esté
 *        logueado en la web de esa empresa (single-session). Correr off-hours.
 *      → 302 a /dashboard/vendedor (éxito) o de vuelta a /users/login (fallo).
 *   3. GET  /reportesventa/comprobantes → `_token` fresco para el DataTables POST.
 *   4. POST /reportesventa/facturas  → JSON DataTables { recordsTotal, data[] }.
 *
 * Credenciales por env: SWITCH_<ENVKEY>_WEB_USER / SWITCH_<ENVKEY>_WEB_PASSWORD
 * (ENVKEY = SWITCH_EMPRESA_ENV_MAP, ej. VISTANA_INTERNATIONAL).
 *
 * El flujo de login es inestable (a veces falla a mitad) → reintentos.
 */

import { resolveSwitchEnvKey } from "./empresas";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36";
const TIMEOUT_MS = 30_000;
const LOGIN_MAX_ATTEMPTS = 3;

export class SwitchWebError extends Error {
  readonly empresaKey: string;
  readonly step: string;
  constructor(empresaKey: string, step: string, message: string) {
    super(`[switch-web ${empresaKey}] ${step}: ${message}`);
    this.name = "SwitchWebError";
    this.empresaKey = empresaKey;
    this.step = step;
  }
}

/** Fila cruda del reporte, ya parseada (HTML limpiado, montos numéricos). */
export interface UtilidadRow {
  secuencial: string;
  fecha: string | null; // YYYY-MM-DD
  tipoComprobante: string; // 'Factura' | 'Nota de Crédito' | ...
  vendedor: string; // vendedor de la FACTURA (fallback de atribución)
  cliente: string;
  clienteSwitchId: number | null; // id del cliente (para join al maestro = cartera)
  subtotalConDescuento: number; // Facturas +, NC − (signo normalizado por tipo)
  costo: number;
  utilidad: number;
  pctUtilidad: number | null;
}

interface WebSession {
  empresaKey: string;
  baseUrl: string;
  cookies: Map<string, string>;
}

interface WebConfig {
  baseUrl: string;
  user: string;
  password: string;
}

function readWebConfig(empresaKey: string): WebConfig {
  const envKey = resolveSwitchEnvKey(empresaKey);
  // La URL web es la misma base que la del API (mismo host).
  const baseUrl = process.env[`SWITCH_${envKey}_API_URL`];
  const user = process.env[`SWITCH_${envKey}_WEB_USER`];
  const password = process.env[`SWITCH_${envKey}_WEB_PASSWORD`];
  const missing: string[] = [];
  if (!baseUrl) missing.push(`SWITCH_${envKey}_API_URL`);
  if (!user) missing.push(`SWITCH_${envKey}_WEB_USER`);
  if (!password) missing.push(`SWITCH_${envKey}_WEB_PASSWORD`);
  if (missing.length) {
    throw new SwitchWebError(empresaKey, "config", `faltan env vars: ${missing.join(", ")}`);
  }
  return { baseUrl: baseUrl!.replace(/\/+$/, ""), user: user!, password: password! };
}

// ─── HTTP helpers (cookie jar manual) ────────────────────────────────────────

function storeCookies(jar: Map<string, string>, res: Response): void {
  const setCookies =
    typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  for (const c of setCookies) {
    const m = c.match(/^([^=]+)=([^;]*)/);
    if (m) jar.set(m[1], m[2]);
  }
}

function cookieHeader(jar: Map<string, string>): string {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function webFetch(
  url: string,
  jar: Map<string, string>,
  init: RequestInit & { followRedirects?: number } = {},
): Promise<{ res: Response; text: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    let currentUrl = url;
    let hops = init.followRedirects ?? 0;
    // primera petición
    let res = await fetch(currentUrl, {
      ...init,
      redirect: "manual",
      signal: controller.signal,
      headers: { "User-Agent": UA, Cookie: cookieHeader(jar), ...(init.headers || {}) },
    });
    storeCookies(jar, res);
    // seguir redirects manualmente (para capturar cookies en cada hop)
    while (hops > 0 && res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      const loc = res.headers.get("location")!;
      currentUrl = loc.startsWith("http") ? loc : new URL(loc, currentUrl).toString();
      res = await fetch(currentUrl, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: { "User-Agent": UA, Cookie: cookieHeader(jar) },
      });
      storeCookies(jar, res);
      hops--;
    }
    const text = await res.text();
    return { res, text };
  } finally {
    clearTimeout(timer);
  }
}

function extractToken(html: string): string | null {
  return (
    // página de login: <input name="_token" value="...">
    html.match(/name="_token"[^>]*value="([^"]+)"/)?.[1] ??
    html.match(/<meta name="csrf-token" content="([^"]+)"/)?.[1] ??
    // página del reporte: var token = '...'
    html.match(/var\s+token\s*=\s*['"]([^'"]+)['"]/)?.[1] ??
    null
  );
}

// ─── Login ───────────────────────────────────────────────────────────────────

async function attemptLogin(empresaKey: string, cfg: WebConfig): Promise<WebSession> {
  const jar = new Map<string, string>();

  // 1) GET login → cookies + _token
  const { text: loginHtml } = await webFetch(`${cfg.baseUrl}/users/login`, jar, {
    headers: { Accept: "text/html" },
  });
  const token = extractToken(loginHtml);
  if (!token) throw new SwitchWebError(empresaKey, "login-get", "no se encontró _token");

  // 2) POST login (multipart). changesession=SI es obligatorio (toma la sesión).
  const fd = new FormData();
  fd.set("_token", token);
  fd.set("usuario", cfg.user);
  fd.set("password", cfg.password);
  fd.set("changesession", "SI");
  const { res } = await webFetch(`${cfg.baseUrl}/users/login`, jar, {
    method: "POST",
    body: fd,
    followRedirects: 4,
    headers: { Origin: cfg.baseUrl, Referer: `${cfg.baseUrl}/users/login` },
  });
  // tras seguir redirects, la URL final NO debe ser /users/login ni /users/opensession
  const finalUrl = res.url || "";
  if (/\/users\/(login|opensession)/.test(finalUrl)) {
    throw new SwitchWebError(empresaKey, "login-post", `login no completó (terminó en ${finalUrl})`);
  }

  // 3) confirmar autenticación cargando la página del reporte
  const { res: repRes } = await webFetch(`${cfg.baseUrl}/reportesventa/comprobantes`, jar, {
    headers: { Accept: "text/html" },
  });
  if (repRes.status !== 200) {
    throw new SwitchWebError(empresaKey, "login-verify", `no autenticado (status ${repRes.status})`);
  }

  return { empresaKey, baseUrl: cfg.baseUrl, cookies: jar };
}

/** Login con reintentos (el flujo Laravel es inestable). */
export async function loginSwitchWeb(empresaKey: string): Promise<WebSession> {
  const cfg = readWebConfig(empresaKey);
  let lastErr: unknown;
  for (let i = 1; i <= LOGIN_MAX_ATTEMPTS; i++) {
    try {
      return await attemptLogin(empresaKey, cfg);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new SwitchWebError(empresaKey, "login", "agotados los reintentos");
}

// ─── Parsing ─────────────────────────────────────────────────────────────────

const stripHtml = (h: unknown): string => String(h ?? "").replace(/<[^>]*>/g, "").trim();
const parseAmount = (v: unknown): number => {
  const n = parseFloat(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};
function parseFecha(s: unknown): string | null {
  // El reporte trae "DD-MM-YYYY HH:mm:ss" o "DD-MM-YYYY".
  const m = String(s ?? "").match(/(\d{2})-(\d{2})-(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

function mapRow(raw: Record<string, unknown>): UtilidadRow {
  const tipo = String(raw.tipoId ?? "").trim();
  const isNC = /cr[ée]dito/i.test(tipo);
  const mag = Math.abs(parseAmount(raw.subTotalConDescuento));
  const pctRaw = raw.porcentajeUtilidad;
  const cliIdMatch = String(raw.clienteId ?? "").match(/clientes\/mostrar\/(\d+)/);
  return {
    secuencial: stripHtml(raw.secuencial),
    fecha: parseFecha(raw.fechaCreacion),
    tipoComprobante: tipo,
    vendedor: stripHtml(raw.vendedorId),
    cliente: stripHtml(raw.clienteId),
    clienteSwitchId: cliIdMatch ? parseInt(cliIdMatch[1], 10) : null,
    // Signo normalizado: NC negativo, resto positivo.
    subtotalConDescuento: isNC ? -mag : mag,
    costo: parseAmount(raw.totalesCostos),
    utilidad: parseAmount(raw.utilidad),
    pctUtilidad:
      pctRaw === null || pctRaw === undefined || pctRaw === "" ? null : parseAmount(pctRaw),
  };
}

// ─── Fetch del reporte (un mes) ──────────────────────────────────────────────

/** Trae las filas del reporte de utilidad para un mes (desde..hasta inclusive). */
export async function fetchUtilidadMes(
  session: WebSession,
  year: number,
  month: number,
): Promise<UtilidadRow[]> {
  const { empresaKey, baseUrl, cookies } = session;
  // _token fresco de la página del reporte
  const { text: repHtml } = await webFetch(`${baseUrl}/reportesventa/comprobantes`, cookies, {
    headers: { Accept: "text/html" },
  });
  const token = extractToken(repHtml);
  if (!token) throw new SwitchWebError(empresaKey, "report-token", "no se encontró _token del reporte");

  const desde = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const hasta = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  const body = new URLSearchParams({
    draw: "1",
    start: "0",
    length: "1000",
    currentPage: "1",
    "order[0][column]": "0",
    "order[0][dir]": "desc",
    desde,
    hasta,
    tipoComprobante: "facturasnotas",
    tipoSeleccionado: "facturas",
    sucursalId: "1",
    vendedores: "[]",
    clientes: "[]",
    clienteindustria: "null",
    clientezona: "null",
    clientecategoria: "null",
    clientetamano: "null",
    crmleadreferencia: "null",
    pais: "null",
    _token: token,
  }).toString();

  const { res, text } = await webFetch(`${baseUrl}/reportesventa/facturas`, cookies, {
    method: "POST",
    body,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      Accept: "application/json",
      Origin: baseUrl,
      Referer: `${baseUrl}/reportesventa/comprobantes`,
    },
  });

  let json: { data?: unknown[] } | null = null;
  try {
    json = JSON.parse(text);
  } catch {
    throw new SwitchWebError(empresaKey, "report-fetch", `respuesta no-JSON (status ${res.status})`);
  }
  const rows = Array.isArray(json?.data) ? json!.data : [];
  return (rows as Record<string, unknown>[]).map(mapRow);
}
