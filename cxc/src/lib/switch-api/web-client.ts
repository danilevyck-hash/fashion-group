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
// El reconocedor del CSV de egresos vive con SU parser, no acá: acá solo se
// baja el archivo. Una segunda copia de "¿esto es el CSV bueno?" es una que
// alguien corrige y otra que se queda vieja.
import { pareceCsvDeEgresos } from "@/lib/egresos/parser";

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

export interface WebSession {
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

// ─── Reporte de ANTIGÜEDAD (cartera completa de una empresa) ─────────────────
//
// Es el mismo reporte que Daniel baja a mano desde `Reportes → Estado de cuenta
// → Antigüedad`. Descubierto en vivo el 30-jul-2026 contra el panel de Boston:
//
//   1. GET  /estadodecuenta            → HTML con `var token = '…'`.
//      ⚠️ La ruta es `/estadodecuenta`, NO `/estadocuenta`: esta última no
//      existe y devuelve la página de excepción de Switch con HTTP 200.
//   2. POST /estadodecuenta/obtener    → JSON.
//      Se llama en RONDAS: mientras responde `{response: true}` (y nada más),
//      el servidor sigue acumulando y hay que volver a pedir con `key += chunk`.
//      La ronda que responde `response: false` trae el reporte entero.
//
// ⚠️ Los filtros geográficos van en CADENA VACÍA, no en la palabra "null".
// Con `pais: "null"` el endpoint responde 200 con `recordsTotal: 0` — o sea, una
// cartera vacía perfectamente creíble. Es el modo de fallo más peligroso de este
// reporte: no da error, da CERO. Por eso `syncCarteraWeb` se niega a escribir
// (y sobre todo a reconciliar) cuando el reporte viene vacío.
//
// ⚠️ `fechaHasta` NO sirve para pedir un corte histórico de la antigüedad: con
// una fecha anterior a hoy el endpoint devuelve los saldos a esa fecha pero SIN
// `elements`, o sea sin un solo documento. La antigüedad es siempre "al día de
// hoy" (verificado con 2026-06-30 y 2026-01-31: 0 documentos en ambas).

/** Máximo de rondas del acumulador. 500 clientes por ronda; Boston tiene ~4.900
 *  con ficha y 400 con saldo, así que 60 rondas (30.000) es techo de sobra y a
 *  la vez frena un bucle infinito si el endpoint nunca dijera `response:false`. */
const ANTIGUEDAD_MAX_RONDAS = 60;
const ANTIGUEDAD_CHUNK = 500;

export interface CarteraAntiguedad {
  /** Clientes con su `elements[]` (los documentos abiertos). */
  clientes: Record<string, unknown>[];
  /** Totales por tramo que publica el propio Switch — la contraparte con la que
   *  se cuadra lo que calculamos nosotros documento por documento. */
  saldosTotales: Array<{ title: string; saldo: string | number }>;
  saldoTotalGlobal: number;
  recordsTotal: number;
  fechaReporte: string | null;
  /** Cuántas rondas hicieron falta (telemetría, para ver si el reporte crece). */
  rondas: number;
}

/** Fecha de hoy en `YYYY-MM-DD`, que es el formato que usa la página
 *  (`var today = '2026-07-30'`). */
function hoyISO(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** Trae la cartera completa (todos los clientes con saldo y sus documentos). */
export async function fetchCarteraAntiguedad(
  session: WebSession,
  now: Date = new Date(),
): Promise<CarteraAntiguedad> {
  const { empresaKey, baseUrl, cookies } = session;

  const { res: pgRes, text: pgHtml } = await webFetch(`${baseUrl}/estadodecuenta`, cookies, {
    headers: { Accept: "text/html" },
  });
  if (pgRes.status !== 200) {
    throw new SwitchWebError(empresaKey, "cartera-page", `/estadodecuenta devolvió ${pgRes.status}`);
  }
  const token = extractToken(pgHtml);
  if (!token) {
    throw new SwitchWebError(empresaKey, "cartera-token", "no se encontró el _token del reporte");
  }

  const fechaHasta = hoyISO(now);
  let key = 0;
  for (let ronda = 1; ronda <= ANTIGUEDAD_MAX_RONDAS; ronda++) {
    const body = new URLSearchParams({
      chunk: String(ANTIGUEDAD_CHUNK),
      key: String(key),
      sucursalId: "1",
      saldomayora: "",
      chkSaldo0: "false",
      clientesInactivo: "false",
      clientes: "[]",
      vendedores: "[]",
      fechaHasta,
      // ⚠️ vacías, no "null" — ver el comentario de arriba.
      pais: "",
      provincia: "",
      distrito: "",
      corregimiento: "",
      clienteindustria: "null",
      clientezona: "null",
      clientecategoria: "null",
      clientetamano: "null",
      crmleadreferencia: "null",
      _token: token,
    }).toString();

    const { res, text } = await webFetch(`${baseUrl}/estadodecuenta/obtener`, cookies, {
      method: "POST",
      body,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
        Accept: "application/json",
        Origin: baseUrl,
        Referer: `${baseUrl}/estadodecuenta`,
      },
    });

    let json: Record<string, unknown>;
    try {
      json = JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new SwitchWebError(
        empresaKey,
        "cartera-fetch",
        `respuesta no-JSON en la ronda ${ronda} (status ${res.status})`,
      );
    }

    // `response: true` = "seguí pidiendo": el servidor está acumulando.
    if (json.response === true) {
      key += ANTIGUEDAD_CHUNK;
      continue;
    }

    return {
      clientes: Array.isArray(json.data) ? (json.data as Record<string, unknown>[]) : [],
      saldosTotales: Array.isArray(json.saldosTotales)
        ? (json.saldosTotales as Array<{ title: string; saldo: string | number }>)
        : [],
      saldoTotalGlobal: Number(json.saldoTotalGlobal ?? 0),
      recordsTotal: Number(json.recordsTotal ?? 0),
      fechaReporte: typeof json.fechaReporte === "string" ? json.fechaReporte : null,
      rondas: ronda,
    };
  }
  throw new SwitchWebError(
    empresaKey,
    "cartera-fetch",
    `el reporte no terminó en ${ANTIGUEDAD_MAX_RONDAS} rondas`,
  );
}

// ─── MAYOR CONTABLE — RETIRADO (13-ago-2026) ────────────────────────────────
//
// Daniel: *"y entonces borra Mayor contable en el sistema"*. Con él se fueron de
// este archivo `MAYOR_PAGINA` / `MAYOR_LISTA` / `MAYOR_EXPORT` / `MAYOR_CHUNK` /
// `MAYOR_MAX_RONDAS` / `MAYOR_HEADER_ESPERADO`, `pareceCsvDelMayor`,
// `MayorDescarga` y `fetchMayorAsientos`.
//
// ⚠️ ESTE ARCHIVO ES COMPARTIDO Y NO SE TOCÓ DE MÁS. El login web, el token
// CSRF, `/cierresesion`, `fetchEgresosVarios` y `fetchCatalogoCuentas` son de
// Egresos Varios y del catálogo de cuentas: los dos siguen vivos. Lo único que
// se quitó es lo que SOLO el mayor llamaba.
//
// 🔑 La lección del mecanismo NO se pierde, porque vale para el reporte que
// queda: el rango de fechas viaja en un POST previo y el servidor se lo guarda
// EN LA SESIÓN, así que saltarse ese paso devuelve un CSV perfecto del período
// EQUIVOCADO, sin un solo error que lo delate. Está escrito en el bloque de
// EGRESOS VARIOS, que hace exactamente lo mismo.
//
// Cómo volver a encenderlo: `git revert` del PR "retirar el mayor contable".

/** La página que entrega el `_token` del reporte. */
const EGRESOS_PAGINA = "/caja/listaegresosvarios";
/** El acumulador que arma el CSV, y que LLEVA EL RANGO. */
const EGRESOS_EXPORT = "/caja/egresosvariosexportar";
/** Lo que manda el JS de la página. No se toca: es el tamaño que el servidor espera. */
const EGRESOS_CHUNK = 500;
/** Techo del acumulador — frena un bucle infinito si nunca dijera `response:false`. */
const EGRESOS_MAX_RONDAS = 4000;

export interface EgresosDescarga {
  csv: string;
  /** Qué ruta entregó el archivo — queda registrada en `switch_sync_log`. */
  rutaUsada: string;
  /** Cuántas rondas del acumulador hicieron falta (telemetría). */
  rondas: number;
  /** Nombre del archivo que armó Switch (`listadoegresovario_…csv`). */
  archivo: string;
}

/**
 * Baja los egresos varios de un rango de fechas (inclusive), como CSV crudo.
 * NO parsea: de eso se encarga `src/lib/egresos/parser.ts`, que es puro y
 * testeado contra el archivo real.
 */
export async function fetchEgresosVarios(
  session: WebSession,
  desde: string, // YYYY-MM-DD
  hasta: string, // YYYY-MM-DD
): Promise<EgresosDescarga> {
  const { empresaKey, baseUrl, cookies } = session;

  // ── 1) la página, que trae el `_token` ────────────────────────────────────
  const { res: pgRes, text: pgHtml } = await webFetch(`${baseUrl}${EGRESOS_PAGINA}`, cookies, {
    headers: { Accept: "text/html" },
  });
  if (pgRes.status !== 200) {
    throw new SwitchWebError(
      empresaKey,
      "egresos-pagina",
      `${EGRESOS_PAGINA} devolvió ${pgRes.status}`,
    );
  }
  const token = extractToken(pgHtml);
  if (!token) {
    throw new SwitchWebError(empresaKey, "egresos-token", "no se encontró el _token del reporte");
  }

  // ── 2) el acumulador (con el rango adentro) ───────────────────────────────
  let key = 0;
  let file = "";
  let ronda = 0;
  while (ronda < EGRESOS_MAX_RONDAS) {
    ronda++;
    const body = new URLSearchParams({
      chunk: String(EGRESOS_CHUNK),
      key: String(key),
      file,
      // Vacío = todas las sucursales. Ver el comentario de arriba.
      sucursal: "",
      desde,
      hasta,
      searchInput: "",
      comprascategoria: "",
      comprassubcategoria: "",
      _token: token,
    }).toString();

    const { res, text } = await webFetch(`${baseUrl}${EGRESOS_EXPORT}`, cookies, {
      method: "POST",
      body,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
        Accept: "application/json",
        Origin: baseUrl,
        Referer: `${baseUrl}${EGRESOS_PAGINA}`,
      },
    });

    let j: { response?: boolean; file?: string };
    try {
      j = JSON.parse(text) as { response?: boolean; file?: string };
    } catch {
      throw new SwitchWebError(
        empresaKey,
        "egresos-descarga",
        `${EGRESOS_EXPORT} respondió algo que no es JSON en la ronda ${ronda} (status ${res.status})`,
      );
    }
    if (j.file) file = j.file;
    if (j.response === true) {
      key += EGRESOS_CHUNK;
      continue;
    }
    break;
  }
  if (!file) {
    throw new SwitchWebError(empresaKey, "egresos-descarga", "el servidor nunca devolvió un archivo");
  }
  if (ronda >= EGRESOS_MAX_RONDAS) {
    throw new SwitchWebError(
      empresaKey,
      "egresos-descarga",
      `el reporte no terminó en ${EGRESOS_MAX_RONDAS} rondas; no se usa un archivo a medias`,
    );
  }

  // ── 3) recoger el archivo ─────────────────────────────────────────────────
  const { res: dlRes, text: csv } = await webFetch(`${baseUrl}/log/${file}`, cookies, {
    headers: { Accept: "text/csv,application/octet-stream,*/*" },
  });
  if (dlRes.status !== 200 || !pareceCsvDeEgresos(csv)) {
    throw new SwitchWebError(
      empresaKey,
      "egresos-descarga",
      `/log/${file} devolvió ${dlRes.status} y ${csv.length} bytes que no son el CSV de egresos varios`,
    );
  }

  return { csv, rutaUsada: EGRESOS_EXPORT, rondas: ronda, archivo: file };
}

// ─── CATÁLOGO DE CUENTAS (Contabilidad → Catálogo de cuentas) ───────────────
//
// Es lo que le pone NOMBRE a los códigos que trae Egresos Varios (que manda el
// código pelado). Ver `src/lib/cuentas/catalogo.ts` para el porqué.
//
// ─── EL MECANISMO, SACADO DEL JS PÚBLICO DE LA PROPIA PÁGINA ────────────────
// `/assets/js/cuentacontable/cuentacontable.js` es un asset PÚBLICO: se lee sin
// sesión, así que descubrirlo no costó ni una expulsión del panel (la misma
// puerta por la que se descubrieron el mayor y los egresos). Ahí está:
//
//     $.get(BASEURL+'cuentacontable/cuentas', {})
//       → {response: true, contacuentacontable: [{cuenta, nombreCuenta, nivel, …}]}
//
// 🔑 **ACÁ ES UN SOLO GET, SIN `_token` Y SIN ACUMULADOR — y esa es la
// diferencia con el mayor y con los egresos.** Los dos reportes arman un archivo
// por rondas (`chunk`/`key`/`file`) porque son un REPORTE de un rango; el
// catálogo de cuentas es una lista fija y la página se la trae entera de una.
// Copiar el acumulador acá sería llamar a un endpoint que no hace falta.
//
// La página también ofrece `POST /cuentacontable/exportcuentas`, que SÍ es el
// acumulador de siempre y deja un CSV en `/log/<file>`. **No se usa**: sería
// bajar un archivo, parsearlo y adivinar su encabezado para conseguir lo mismo
// que ya viene en JSON con los campos nombrados.
//
// ⚠️ Sin sesión, `/cuentacontable/cuentas` responde **302 a `/users`**; una ruta
// inexistente responde 200 con el HTML de excepción de Switch. Por eso el código
// de estado no alcanza para validar nada y lo que se mira es el CONTENIDO.

/** El endpoint del catálogo. */
const CUENTAS_LISTA = "/cuentacontable/cuentas";

export interface CatalogoCuentasDescarga {
  /** Los nodos crudos, tal como los mandó Switch. Normalizarlos es de
   *  `lib/cuentas/catalogo.ts`, que es puro y testeado. */
  nodos: unknown[];
  /** Qué ruta entregó los datos — queda en `switch_sync_log`. */
  rutaUsada: string;
}

/**
 * Baja el catálogo de cuentas de una empresa. NO parsea ni valida el contenido
 * de cada nodo: sólo que la respuesta sea la del catálogo y no otra cosa.
 */
export async function fetchCatalogoCuentas(
  session: WebSession,
): Promise<CatalogoCuentasDescarga> {
  const { empresaKey, baseUrl, cookies } = session;

  const { res, text } = await webFetch(`${baseUrl}${CUENTAS_LISTA}`, cookies, {
    headers: {
      "X-Requested-With": "XMLHttpRequest",
      Accept: "application/json",
      Referer: `${baseUrl}/cuentacontable`,
    },
  });

  let json: { response?: unknown; contacuentacontable?: unknown };
  try {
    json = JSON.parse(text) as typeof json;
  } catch {
    // Un 302 a /users (sesión caída) y el HTML de excepción llegan los dos acá.
    throw new SwitchWebError(
      empresaKey,
      "cuentas-fetch",
      `${CUENTAS_LISTA} respondió algo que no es JSON (status ${res.status}, ${text.length} bytes)`,
    );
  }
  if (!Array.isArray(json.contacuentacontable)) {
    throw new SwitchWebError(
      empresaKey,
      "cuentas-fetch",
      `${CUENTAS_LISTA} devolvió JSON sin la lista de cuentas (response=${String(json.response)})`,
    );
  }

  return { nodos: json.contacuentacontable, rutaUsada: CUENTAS_LISTA };
}

// ─── INGRESO DE MERCANCÍA (Stock → Reportes → Reporte ingreso mercancía) ─────
//
// Es la ÚNICA fuente del "Compré" de Ventas › Referencia. El API JSON no sirve:
// `/apiingresomercancia/lista` e `/info` responden 200 pero traen 10 campos
// escalares y CERO líneas por artículo — saben que entraron $542,08 de
// mercancía, no de QUÉ artículo. Ver el encabezado de `ingresos-mercancia.ts`.
//
// ─── EL REPORTE TIENE DOS BOTONES Y SE BAJAN LOS DOS ────────────────────────
// "Descargar Detalle" (una fila por artículo) es el dato; "Descargar" (una fila
// por documento) es la PRUEBA de que no se perdió nada. Se bajan en la MISMA
// sesión: son dos POST, no dos logins, y cada login expulsa a Daniel del panel.
//
// ─── EL MECANISMO, SACADO DEL JS DE LA PROPIA PÁGINA ────────────────────────
// `/assets/js/reportes/ingresomercancia.js`, funciones `descargarreporte` y
// `descargardetallereporte`. Mismo acumulador de `fetchEgresosVarios`: mientras
// la respuesta traiga `response:true` hay que volver a pedir con `key += chunk`
// y el `file` que devolvió; la ronda que contesta `response:false` deja el
// archivo en `GET /log/<file>`.
//
// 🔑 **El rango de fechas viaja en el POST, no en la sesión.** A diferencia del
// mayor retirado, acá `desde`/`hasta` van en cada ronda del acumulador, así que
// no hay un paso previo que se pueda saltear en silencio.
//
// ⚠️ La página se identifica por una CONSTANTE, no rastreando el menú. El script
// manual sí rastrea (`--descubrir`), y ese rastreo fue lo que la encontró
// —medido el 24-ago-2026 contra vistana: `/menu/stockreportes` la lista—, pero
// un cron que se adapta solo al menú es un cron que un día baja OTRO reporte sin
// avisar. Si Switch la mueve, esto tiene que ponerse ROJO y que lo mire alguien.
/** La página que entrega el `_token` del reporte. */
const INGRESOS_PAGINA = "/reportes/ingresomercancia";
/** El acumulador del botón "Descargar Detalle" — una fila por ARTÍCULO. */
const INGRESOS_EXPORT_DETALLE = "/reportes/stockingresomercanciadetalle";
/** El acumulador del botón "Descargar" — una fila por DOCUMENTO. Solo cuadra. */
const INGRESOS_EXPORT_RESUMEN = "/reportes/stockingresomercancia";
/** Lo que manda el JS de la página. No se toca: es el tamaño que el servidor espera. */
const INGRESOS_CHUNK = 500;
/** Techo del acumulador — frena un bucle infinito si nunca dijera `response:false`. */
const INGRESOS_MAX_RONDAS = 4000;

export interface IngresosDescarga {
  /** CSV crudo de "Descargar Detalle". NO se parsea acá. */
  detalleCsv: string;
  /** CSV crudo de "Descargar" (resumen). Solo sirve para cuadrar. */
  resumenCsv: string;
  /** Rondas que hizo falta acumular en cada uno (telemetría). */
  rondas: { detalle: number; resumen: number };
  /** Nombres de los archivos que armó Switch. */
  archivos: { detalle: string; resumen: string };
}

/** ¿Esto que volvió es el CSV del reporte y no una página HTML? El HTML de
 *  excepción de Switch llega con HTTP 200, así que el status no alcanza. */
function pareceCsvDeIngresos(csv: string): boolean {
  const primera = csv.split(/\r?\n/)[0] ?? "";
  return primera.includes(";") && /FECHA/i.test(primera) && /N\.?INTERNO/i.test(primera);
}

/** Corre UNO de los dos acumuladores y devuelve su CSV. */
async function acumularIngresos(
  session: WebSession,
  ruta: string,
  token: string,
  desde: string,
  hasta: string,
  que: "detalle" | "resumen",
): Promise<{ csv: string; rondas: number; archivo: string }> {
  const { empresaKey, baseUrl, cookies } = session;
  let key = 0;
  let file = "";
  let ronda = 0;

  while (ronda < INGRESOS_MAX_RONDAS) {
    ronda++;
    const body = new URLSearchParams({
      chunk: String(INGRESOS_CHUNK),
      key: String(key),
      file,
      // Vacíos = "Todas"/"Todos", tal como vienen los <select> de la página.
      sucursalId: "",
      proveedorId: "",
      search: "",
      articulos: "[]",
      marcas: "[]",
      rubros: "[]",
      subrubros: "[]",
      desde,
      hasta,
      _token: token,
    }).toString();

    const { res, text } = await webFetch(`${baseUrl}${ruta}`, cookies, {
      method: "POST",
      body,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
        Accept: "application/json",
        Origin: baseUrl,
        Referer: `${baseUrl}${INGRESOS_PAGINA}`,
      },
    });

    let j: { response?: boolean; file?: string };
    try {
      j = JSON.parse(text) as { response?: boolean; file?: string };
    } catch {
      throw new SwitchWebError(
        empresaKey,
        `ingresos-${que}`,
        `${ruta} respondió algo que no es JSON en la ronda ${ronda} (status ${res.status})`,
      );
    }
    if (j.file) file = j.file;
    if (j.response === true) {
      key += INGRESOS_CHUNK;
      continue;
    }
    break;
  }

  if (!file) {
    throw new SwitchWebError(empresaKey, `ingresos-${que}`, `${ruta} nunca devolvió un archivo`);
  }
  if (ronda >= INGRESOS_MAX_RONDAS) {
    throw new SwitchWebError(
      empresaKey,
      `ingresos-${que}`,
      `${ruta} no terminó en ${INGRESOS_MAX_RONDAS} rondas; no se usa un archivo a medias`,
    );
  }

  const { res: dlRes, text: csv } = await webFetch(`${baseUrl}/log/${file}`, cookies, {
    headers: { Accept: "text/csv,application/octet-stream,*/*" },
  });
  if (dlRes.status !== 200 || !pareceCsvDeIngresos(csv)) {
    throw new SwitchWebError(
      empresaKey,
      `ingresos-${que}`,
      `/log/${file} devolvió ${dlRes.status} y ${csv.length} bytes que no son el CSV de ${que}`,
    );
  }
  return { csv, rondas: ronda, archivo: file };
}

/**
 * Baja los DOS CSV del reporte de ingreso de mercancía para un rango de fechas
 * (inclusive), en UNA sola sesión. NO parsea: de eso se encarga el módulo PURO
 * `ingresos-mercancia.ts`, testeado contra las líneas reales del archivo.
 */
export async function fetchIngresosMercancia(
  session: WebSession,
  desde: string, // YYYY-MM-DD
  hasta: string, // YYYY-MM-DD
): Promise<IngresosDescarga> {
  const { empresaKey, baseUrl, cookies } = session;

  // ── 1) la página, que trae el `_token` ────────────────────────────────────
  const { res: pgRes, text: pgHtml } = await webFetch(`${baseUrl}${INGRESOS_PAGINA}`, cookies, {
    headers: { Accept: "text/html" },
  });
  if (pgRes.status !== 200) {
    throw new SwitchWebError(
      empresaKey,
      "ingresos-pagina",
      `${INGRESOS_PAGINA} devolvió ${pgRes.status}`,
    );
  }
  const token = extractToken(pgHtml);
  if (!token) {
    throw new SwitchWebError(empresaKey, "ingresos-token", "no se encontró el _token del reporte");
  }

  // ── 2) los dos acumuladores, en la MISMA sesión ───────────────────────────
  // El DETALLE primero: es el dato. Si falla, no gastamos el resumen.
  const detalle = await acumularIngresos(session, INGRESOS_EXPORT_DETALLE, token, desde, hasta, "detalle");
  const resumen = await acumularIngresos(session, INGRESOS_EXPORT_RESUMEN, token, desde, hasta, "resumen");

  return {
    detalleCsv: detalle.csv,
    resumenCsv: resumen.csv,
    rondas: { detalle: detalle.rondas, resumen: resumen.rondas },
    archivos: { detalle: detalle.archivo, resumen: resumen.archivo },
  };
}

/**
 * Cierra la sesión web. El login usa `changesession=SI`, que EXPULSA a quien
 * esté trabajando en el panel de esa empresa; dejar la sesión abierta alarga ese
 * despojo sin necesidad. Best-effort: nunca lanza — el trabajo ya está hecho y
 * un fallo al cerrar no puede convertir una corrida buena en una fallida.
 */
export async function cerrarSesionWeb(session: WebSession): Promise<void> {
  try {
    await webFetch(`${session.baseUrl}/users/logout`, session.cookies, {
      headers: { Accept: "text/html" },
    });
  } catch {
    /* best-effort */
  }
}
