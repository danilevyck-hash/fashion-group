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

// ─── MAYOR CONTABLE (Contabilidad → Listado de Asientos → "Descargar") ───────
//
// Es el mismo reporte que Daniel baja a mano. Devuelve un CSV con una fila por
// LÍNEA de asiento, separador `;`, fecha DD-MM-YYYY, y el nombre del archivo con
// la forma `listaasientos_<sucursalId>_<ddmmyyyyhhmmss>.csv`.
//
// ─── EL MECANISMO, MEDIDO CONTRA SWITCH (11-ago-2026) ───────────────────────
// Salió del JS de la propia página, `/assets/js/asientos/asientos.js` — que es
// un asset PÚBLICO: se lee sin sesión, así que descubrirlo no costó ni una
// expulsión del panel. Son TRES pasos y los tres hacen falta:
//
//   1. GET  /asientos                → HTML con el `_token`.
//   2. POST /asientos/lista          → el DataTables. **ACÁ VIAJA EL RANGO**
//      (`desde`/`hasta`), y el servidor se lo guarda EN LA SESIÓN.
//   3. POST /asientos/exportasientos → ACUMULADOR, igual que
//      `/estadodecuenta/obtener` y que el reporte de ingreso de mercancía:
//      solo `{chunk:500, key, file, _token}`; mientras responda
//      `response:true` se repide con `key += chunk`, y la ronda que responde
//      `response:false` deja el archivo en `GET /log/<file>`.
//
// 🔴 EL PASO 2 NO ES OPCIONAL Y ES EL QUE SE PRESTA AL ERROR CARO. La descarga
// NO lleva fechas: las lee de la sesión. Saltárselo devuelve un CSV perfecto
// del rango por defecto (el mes en curso) — un reporte válido del período
// EQUIVOCADO, sin un solo error que lo delate. Por eso `fetchMayorAsientos`
// hace los tres pasos en orden y `sync-mayor` no puede pedir un rango sin
// fijarlo antes.
//
// ⚠️ Ninguno de los candidatos que se habían DEDUCIDO existía
// (`/asientos/descargar`, `/asientos/exportar`, `/reportecontable/…`): Switch
// contesta HTTP 200 con su HTML de excepción para toda ruta inexistente, así
// que el código de estado no sirve para descartar — hay que mirar el contenido
// (`pareceCsvDelMayor`).
//
// CERTIFICADO: el CSV que baja este código para vistana 2026-01-01 → 2026-12-31
// es IDÉNTICO (SHA-256) al que Daniel bajó a mano del panel.

/** La página que entrega el `_token` del reporte. */
const MAYOR_PAGINA = "/asientos";
/** El DataTables que FIJA el rango de fechas en la sesión (paso 2). */
const MAYOR_LISTA = "/asientos/lista";
/** El acumulador que arma el CSV (paso 3). */
const MAYOR_EXPORT = "/asientos/exportasientos";
/** Lo que manda el JS de la página. No se toca: es el tamaño que el servidor espera. */
const MAYOR_CHUNK = 500;
/** Techo del acumulador — frena un bucle infinito si nunca dijera `response:false`. */
const MAYOR_MAX_RONDAS = 4000;

/** El encabezado del CSV real, ya normalizado (dobles espacios colapsados). */
const MAYOR_HEADER_ESPERADO = ["asiento", "descripcion", "fecha", "nombre cuenta", "cuenta"];

/**
 * ¿Esto que volvió es el CSV del mayor y no un HTML de error / una página vacía?
 *
 * Switch responde HTTP 200 con el HTML de excepción cuando la ruta no existe, y
 * 200 con cuerpo vacío en otros casos: el código de estado NO alcanza para
 * distinguir. Lo único confiable es mirar el contenido.
 */
export function pareceCsvDelMayor(texto: string): boolean {
  const primera = texto.replace(/^\uFEFF/, "").split(/\r\n|\n|\r/)[0] ?? "";
  if (primera.includes("<") || /<!DOCTYPE|<html/i.test(texto.slice(0, 400))) return false;
  const cols = primera
    .split(";")
    .map((c) => c.replace(/\s+/g, " ").trim().toLowerCase());
  return MAYOR_HEADER_ESPERADO.every((c) => cols.includes(c));
}

export interface MayorDescarga {
  csv: string;
  /** Qué ruta entregó el archivo — queda registrada en `switch_sync_log`. */
  rutaUsada: string;
  /** Cuántos asientos declaró el DataTables para ese rango (telemetría). */
  asientosDeclarados: number | null;
  /** Cuántas rondas del acumulador hicieron falta (telemetría). */
  rondas: number;
}

/**
 * Baja el mayor de un rango de fechas (inclusive), como CSV crudo.
 * NO parsea: de eso se encarga `src/lib/mayor/parser.ts`, que es puro y testeado.
 */
export async function fetchMayorAsientos(
  session: WebSession,
  desde: string, // YYYY-MM-DD
  hasta: string, // YYYY-MM-DD
): Promise<MayorDescarga> {
  const { empresaKey, baseUrl, cookies } = session;

  // ── 1) la página, que trae el `_token` ────────────────────────────────────
  const { res: pgRes, text: pgHtml } = await webFetch(`${baseUrl}${MAYOR_PAGINA}`, cookies, {
    headers: { Accept: "text/html" },
  });
  if (pgRes.status !== 200) {
    throw new SwitchWebError(empresaKey, "mayor-pagina", `${MAYOR_PAGINA} devolvió ${pgRes.status}`);
  }
  const token = extractToken(pgHtml);
  if (!token) {
    throw new SwitchWebError(empresaKey, "mayor-token", "no se encontró el _token del reporte");
  }

  // ── 2) FIJAR EL RANGO EN LA SESIÓN ────────────────────────────────────────
  // Ver el encabezado: sin esto el CSV sale del rango por defecto y NADA lo
  // delata. Las columnas van con los mismos nombres que manda el DataTables.
  const listaBody = new URLSearchParams({
    draw: "1",
    start: "0",
    length: "10",
    currentPage: "1",
    searchInput: "",
    "order[0][column]": "1",
    "order[0][dir]": "desc",
    "columns[0][data]": "",
    "columns[1][data]": "numeroAsiento",
    "columns[2][data]": "descripcion",
    "columns[3][data]": "fecha",
    "columns[4][data]": "totalDebitos",
    "columns[5][data]": "totalCreditos",
    "columns[6][data]": "detalle",
    "columns[7][data]": "asientoId",
    desde,
    hasta,
    _token: token,
  }).toString();

  const { res: lisRes, text: lisText } = await webFetch(`${baseUrl}${MAYOR_LISTA}`, cookies, {
    method: "POST",
    body: listaBody,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      Accept: "application/json",
      Origin: baseUrl,
      Referer: `${baseUrl}${MAYOR_PAGINA}`,
    },
  });
  let asientosDeclarados: number | null = null;
  try {
    const j = JSON.parse(lisText) as { recordsTotal?: number; recordsFiltered?: number };
    const n = Number(j.recordsTotal ?? j.recordsFiltered);
    asientosDeclarados = Number.isFinite(n) ? n : null;
  } catch {
    throw new SwitchWebError(
      empresaKey,
      "mayor-rango",
      `${MAYOR_LISTA} no devolvió JSON (status ${lisRes.status}); el rango no quedó fijado`,
    );
  }

  // ── 3) el acumulador ──────────────────────────────────────────────────────
  let key = 0;
  let file = "";
  let ronda = 0;
  while (ronda < MAYOR_MAX_RONDAS) {
    ronda++;
    const body = new URLSearchParams({
      chunk: String(MAYOR_CHUNK),
      key: String(key),
      file,
      _token: token,
    }).toString();

    const { res, text } = await webFetch(`${baseUrl}${MAYOR_EXPORT}`, cookies, {
      method: "POST",
      body,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
        Accept: "application/json",
        Origin: baseUrl,
        Referer: `${baseUrl}${MAYOR_PAGINA}`,
      },
    });

    let j: { response?: boolean; file?: string };
    try {
      j = JSON.parse(text) as { response?: boolean; file?: string };
    } catch {
      throw new SwitchWebError(
        empresaKey,
        "mayor-descarga",
        `${MAYOR_EXPORT} respondió algo que no es JSON en la ronda ${ronda} (status ${res.status})`,
      );
    }
    if (j.file) file = j.file;
    if (j.response === true) {
      key += MAYOR_CHUNK;
      continue;
    }
    break;
  }
  if (!file) {
    throw new SwitchWebError(empresaKey, "mayor-descarga", "el servidor nunca devolvió un archivo");
  }
  if (ronda >= MAYOR_MAX_RONDAS) {
    throw new SwitchWebError(
      empresaKey,
      "mayor-descarga",
      `el reporte no terminó en ${MAYOR_MAX_RONDAS} rondas; no se usa un archivo a medias`,
    );
  }

  // ── 4) recoger el archivo ─────────────────────────────────────────────────
  const { res: dlRes, text: csv } = await webFetch(`${baseUrl}/log/${file}`, cookies, {
    headers: { Accept: "text/csv,application/octet-stream,*/*" },
  });
  if (dlRes.status !== 200 || !pareceCsvDelMayor(csv)) {
    throw new SwitchWebError(
      empresaKey,
      "mayor-descarga",
      `/log/${file} devolvió ${dlRes.status} y ${csv.length} bytes que no son el CSV del mayor`,
    );
  }

  return { csv, rutaUsada: MAYOR_EXPORT, asientosDeclarados, rondas: ronda };
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
