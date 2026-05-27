/**
 * Switch Soft API Discovery Script
 *
 * Prueba endpoints contra la instancia configurada y reporta cuáles están habilitados.
 * NO toca producción, NO toca Supabase, NO commitea nada.
 *
 * Uso:
 *   npx tsx scripts/switch-api-discovery.ts
 *
 * Convención multi-empresa de env vars: SWITCH_<EMPRESA_KEY>_API_*
 * Este script apunta a Multifashion:
 *   SWITCH_MULTIFASHION_API_URL
 *   SWITCH_MULTIFASHION_API_USER
 *   SWITCH_MULTIFASHION_API_PASSWORD
 *
 * Output:
 *   - Tabla en consola
 *   - scripts/switch-api-discovery-output.json (gitignored)
 */

import { config } from "dotenv";
import { resolve } from "path";
import { writeFileSync } from "fs";

config({ path: resolve(__dirname, "../.env.local") });

const API_URL = process.env.SWITCH_MULTIFASHION_API_URL;
const API_USER = process.env.SWITCH_MULTIFASHION_API_USER;
const API_PASSWORD = process.env.SWITCH_MULTIFASHION_API_PASSWORD;

const missing: string[] = [];
if (!API_URL) missing.push("SWITCH_MULTIFASHION_API_URL");
if (!API_USER) missing.push("SWITCH_MULTIFASHION_API_USER");
if (!API_PASSWORD) missing.push("SWITCH_MULTIFASHION_API_PASSWORD");
if (missing.length > 0) {
  console.error(
    `\nFaltan variables en .env.local: ${missing.join(", ")}\n` +
      `Agregalas y volve a correr.\n`,
  );
  process.exit(1);
}

const BASE = API_URL!.replace(/\/+$/, "");
const TIMEOUT_MS = 10_000;

type Status =
  | "success"
  | "vacio"
  | "no_habilitado"
  | "error_servidor"
  | "timeout"
  | "error_red"
  | "error_parse";

interface Result {
  phase: string;
  label: string;
  method: "GET" | "POST";
  endpoint: string;
  url: string;
  status: Status;
  http_code: number | null;
  notas: string;
  sample: string;
  full_response?: unknown;
  duration_ms: number;
}

const results: Result[] = [];

type BuildAuthRequest = (
  baseUrl: string,
  init: RequestInit & { headers: Record<string, string> },
) => { url: string; init: RequestInit };

interface AuthVariant {
  id: string;
  label: string;
  build: (token: string) => BuildAuthRequest;
}

const AUTH_VARIANTS: AuthVariant[] = [
  {
    id: "bearer",
    label: "Authorization: Bearer <token>",
    build: (token) => (url, init) => ({
      url,
      init: {
        ...init,
        headers: { ...init.headers, Authorization: `Bearer ${token}` },
      },
    }),
  },
  {
    id: "raw",
    label: "Authorization: <token>",
    build: (token) => (url, init) => ({
      url,
      init: {
        ...init,
        headers: { ...init.headers, Authorization: token },
      },
    }),
  },
  {
    id: "token-prefix",
    label: "Authorization: token <token>",
    build: (token) => (url, init) => ({
      url,
      init: {
        ...init,
        headers: { ...init.headers, Authorization: `token ${token}` },
      },
    }),
  },
  {
    id: "header-token",
    label: "token: <token>",
    build: (token) => (url, init) => ({
      url,
      init: {
        ...init,
        headers: { ...init.headers, token },
      },
    }),
  },
  {
    id: "x-token",
    label: "X-Token: <token>",
    build: (token) => (url, init) => ({
      url,
      init: {
        ...init,
        headers: { ...init.headers, "X-Token": token },
      },
    }),
  },
  {
    id: "auth-token",
    label: "auth-token: <token>",
    build: (token) => (url, init) => ({
      url,
      init: {
        ...init,
        headers: { ...init.headers, "auth-token": token },
      },
    }),
  },
  {
    id: "query",
    label: "?token=<token>",
    build: (token) => (url, init) => {
      const sep = url.includes("?") ? "&" : "?";
      return {
        url: `${url}${sep}token=${encodeURIComponent(token)}`,
        init,
      };
    },
  },
];

let currentAuthBuilder: BuildAuthRequest | null = null;
let currentAuthLabel: string = "(no detectado)";

function truncate(s: string, n = 500): string {
  if (s.length <= n) return s;
  return s.slice(0, n) + `... [truncado ${s.length - n} chars]`;
}

function summarizeBody(body: unknown): {
  status: Status;
  notas: string;
} {
  if (body === null || body === undefined) {
    return { status: "vacio", notas: "Respuesta vacia" };
  }
  if (Array.isArray(body)) {
    if (body.length === 0) return { status: "vacio", notas: "Array vacio" };
    return {
      status: "success",
      notas: `Array con ${body.length} items`,
    };
  }
  if (typeof body === "object") {
    const obj = body as Record<string, unknown>;
    const keys = Object.keys(obj);
    if (keys.length === 0) return { status: "vacio", notas: "Objeto vacio" };
    for (const arrayKey of ["data", "items", "lista", "resultados", "results"]) {
      if (Array.isArray(obj[arrayKey])) {
        const arr = obj[arrayKey] as unknown[];
        return {
          status: arr.length === 0 ? "vacio" : "success",
          notas: `${arrayKey}: ${arr.length} items (keys: ${keys.join(", ")})`,
        };
      }
    }
    return {
      status: "success",
      notas: `Objeto (keys: ${keys.slice(0, 8).join(", ")}${keys.length > 8 ? "..." : ""})`,
    };
  }
  return {
    status: "success",
    notas: `Primitivo: ${typeof body}`,
  };
}

async function call(opts: {
  phase: string;
  label: string;
  method: "GET" | "POST";
  endpoint: string;
  token?: string | null;
  body?: unknown;
}): Promise<Result> {
  const { phase, label, method, endpoint, token, body } = opts;
  let url = `${BASE}${endpoint}`;
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const t0 = Date.now();

  let init: RequestInit = {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: controller.signal,
  };

  if (token) {
    if (!currentAuthBuilder) {
      clearTimeout(timer);
      throw new Error(
        "authBuilder no inicializado — llamar a probeAuthHeaderFormat antes de hacer llamadas autenticadas",
      );
    }
    const built = currentAuthBuilder(url, { ...init, headers });
    url = built.url;
    init = built.init;
  }

  try {
    const res = await fetch(url, init);
    clearTimeout(timer);
    const duration_ms = Date.now() - t0;
    const http_code = res.status;
    const text = await res.text();

    let parsed: unknown = null;
    let parseErr = false;
    try {
      parsed = text.length > 0 ? JSON.parse(text) : null;
    } catch {
      parseErr = true;
    }

    if (http_code === 401 || http_code === 403) {
      return {
        phase,
        label,
        method,
        endpoint,
        url,
        status: "no_habilitado",
        http_code,
        notas: `${http_code} - sin permiso / no habilitado`,
        sample: truncate(text),
        full_response: parseErr ? text : parsed,
        duration_ms,
      };
    }
    if (http_code === 404) {
      return {
        phase,
        label,
        method,
        endpoint,
        url,
        status: "no_habilitado",
        http_code,
        notas: "404 - endpoint inexistente",
        sample: truncate(text),
        full_response: parseErr ? text : parsed,
        duration_ms,
      };
    }
    if (http_code >= 500) {
      return {
        phase,
        label,
        method,
        endpoint,
        url,
        status: "error_servidor",
        http_code,
        notas: `${http_code} - error servidor`,
        sample: truncate(text),
        full_response: parseErr ? text : parsed,
        duration_ms,
      };
    }
    if (http_code >= 400) {
      return {
        phase,
        label,
        method,
        endpoint,
        url,
        status: "error_red",
        http_code,
        notas: `${http_code} - request invalido`,
        sample: truncate(text),
        full_response: parseErr ? text : parsed,
        duration_ms,
      };
    }

    if (parseErr) {
      return {
        phase,
        label,
        method,
        endpoint,
        url,
        status: "error_parse",
        http_code,
        notas: "Respuesta no es JSON valido",
        sample: truncate(text),
        full_response: text,
        duration_ms,
      };
    }

    const { status, notas } = summarizeBody(parsed);
    return {
      phase,
      label,
      method,
      endpoint,
      url,
      status,
      http_code,
      notas,
      sample: truncate(text),
      full_response: parsed,
      duration_ms,
    };
  } catch (err: unknown) {
    clearTimeout(timer);
    const duration_ms = Date.now() - t0;
    const isAbort = err instanceof Error && err.name === "AbortError";
    return {
      phase,
      label,
      method,
      endpoint,
      url,
      status: isAbort ? "timeout" : "error_red",
      http_code: null,
      notas: isAbort
        ? `Timeout >${TIMEOUT_MS}ms`
        : `Error red: ${err instanceof Error ? err.message : String(err)}`,
      sample: "",
      duration_ms,
    };
  }
}

function pick<T = unknown>(obj: unknown, keys: string[]): T | null {
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  for (const k of keys) {
    if (o[k] !== undefined && o[k] !== null) return o[k] as T;
  }
  return null;
}

function pickNested<T = unknown>(
  obj: unknown,
  nestedKey: string,
  keys: string[],
): T | null {
  if (!obj || typeof obj !== "object") return null;
  const nested = (obj as Record<string, unknown>)[nestedKey];
  if (!nested || typeof nested !== "object") return null;
  return pick<T>(nested, keys);
}

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function yesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return ymd(d);
}

function firstDayOfMonth(): string {
  const d = new Date();
  return ymd(new Date(d.getFullYear(), d.getMonth(), 1));
}

function firstItem(body: unknown): Record<string, unknown> | null {
  if (Array.isArray(body) && body.length > 0) {
    return typeof body[0] === "object" ? (body[0] as Record<string, unknown>) : null;
  }
  if (body && typeof body === "object") {
    for (const k of ["data", "items", "lista", "resultados", "results"]) {
      const arr = (body as Record<string, unknown>)[k];
      if (Array.isArray(arr) && arr.length > 0) {
        return typeof arr[0] === "object" ? (arr[0] as Record<string, unknown>) : null;
      }
    }
  }
  return null;
}

function pickIdLike(item: Record<string, unknown> | null, keys: string[]): string | number | null {
  if (!item) return null;
  for (const k of keys) {
    const v = item[k];
    if (v !== undefined && v !== null && v !== "") {
      if (typeof v === "string" || typeof v === "number") return v;
    }
  }
  return null;
}

async function probeAuthHeaderFormat(
  token: string,
): Promise<
  | {
      variant: AuthVariant;
      buildAuthRequest: BuildAuthRequest;
    }
  | null
> {
  console.log(`\n--- Detectando formato de header de auth (/empresainfo) ---`);
  for (const variant of AUTH_VARIANTS) {
    const builder = variant.build(token);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const baseInit: RequestInit & { headers: Record<string, string> } = {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    };
    const { url, init } = builder(`${BASE}/empresainfo`, baseInit);

    try {
      const res = await fetch(url, init);
      clearTimeout(timer);
      const text = await res.text();
      let tokenInvalido = false;
      try {
        const parsed = text.length > 0 ? JSON.parse(text) : null;
        if (parsed && typeof parsed === "object") {
          const s = JSON.stringify(parsed);
          if (s.includes("TOKEN INVALIDO") || s.includes(`"code":"0011"`)) {
            tokenInvalido = true;
          }
        }
      } catch {
        // respuesta no es JSON, no afecta el chequeo
      }

      if (res.status === 200 && !tokenInvalido) {
        console.log(`  OK    ${variant.label}  →  HTTP 200`);
        return { variant, buildAuthRequest: builder };
      }

      const reason = tokenInvalido
        ? "TOKEN INVALIDO"
        : `HTTP ${res.status}`;
      console.log(`  FAIL  ${variant.label}  →  ${reason}`);
    } catch (err: unknown) {
      clearTimeout(timer);
      const isAbort = err instanceof Error && err.name === "AbortError";
      const reason = isAbort
        ? `timeout >${TIMEOUT_MS}ms`
        : err instanceof Error
          ? err.message
          : String(err);
      console.log(`  FAIL  ${variant.label}  →  ${reason}`);
    }
  }
  return null;
}

async function run() {
  console.log(`\n=== Switch Soft API Discovery ===`);
  console.log(`Base URL: ${BASE}`);
  console.log(`Usuario:  ${API_USER}`);
  console.log(``);

  // FASE A
  console.log(`--- FASE A: Auth y basicos ---`);

  results.push(
    await call({
      phase: "A",
      label: "validar (sin token)",
      method: "GET",
      endpoint: "/validar",
    }),
  );

  const authBody = { usuario: API_USER, password: API_PASSWORD };
  const authRes = await call({
    phase: "A",
    label: "autenticacion",
    method: "POST",
    endpoint: "/autenticacion",
    body: authBody,
  });
  results.push(authRes);

  if (authRes.status !== "success" && authRes.status !== "vacio") {
    console.error(
      `\nAuth fallo (${authRes.http_code}). No tiene sentido seguir.\n` +
        `Detalle: ${authRes.notas}\n` +
        `Sample: ${authRes.sample}\n`,
    );
    finalize();
    return;
  }

  const tokenKeys = ["token", "access_token", "accessToken", "jwt", "Token"];
  const token =
    pickNested<string>(authRes.full_response, "data", tokenKeys) ||
    pick<string>(authRes.full_response, tokenKeys) ||
    null;

  const authSucursalId =
    pickNested<string | number>(authRes.full_response, "data", [
      "sucursalId",
      "idSucursal",
      "sucursalCodigo",
      "codigoSucursal",
    ]) ||
    pick<string | number>(authRes.full_response, [
      "sucursalId",
      "idSucursal",
      "sucursalCodigo",
      "codigoSucursal",
    ]) ||
    null;

  if (!token) {
    console.error(
      `\nAuth respondio OK pero no encontre token en la respuesta.\n` +
        `Keys disponibles: ${
          authRes.full_response && typeof authRes.full_response === "object"
            ? Object.keys(authRes.full_response as object).join(", ")
            : "(no es objeto)"
        }\n` +
        `Sample: ${authRes.sample}\n`,
    );
    finalize();
    return;
  }
  console.log(`Token obtenido (${token.length} chars).`);

  const probe = await probeAuthHeaderFormat(token);
  if (!probe) {
    const triedList = AUTH_VARIANTS.map((v) => v.label).join(", ");
    console.error(
      `\nNo se encontró formato de header válido. ` +
        `Probadas: [${triedList}]. ` +
        `Revisar doc de Switch o contactar soporte.\n`,
    );
    finalize();
    return;
  }
  currentAuthBuilder = probe.buildAuthRequest;
  currentAuthLabel = probe.variant.label;
  console.log(`\nFormato de auth detectado: ${currentAuthLabel}\n`);

  results.push(
    await call({
      phase: "A",
      label: "empresainfo",
      method: "GET",
      endpoint: "/empresainfo",
      token,
    }),
  );

  const sucursalRes = await call({
    phase: "A",
    label: "apisucursal/lista",
    method: "GET",
    endpoint: "/apisucursal/lista",
    token,
  });
  results.push(sucursalRes);

  const firstSucursal = firstItem(sucursalRes.full_response);
  const sucursalId =
    pickIdLike(firstSucursal, [
      "sucursalId",
      "id",
      "idSucursal",
      "codigo",
      "codigoSucursal",
    ]) ?? authSucursalId;

  const fechaDesde = firstDayOfMonth();
  const fechaHasta = yesterday();

  // FASE B
  console.log(`--- FASE B: Lecturas core ---`);

  results.push(
    await call({
      phase: "B",
      label: "apicliente/lista",
      method: "GET",
      endpoint: "/apicliente/lista?porPagina=5",
      token,
    }),
  );
  results.push(
    await call({
      phase: "B",
      label: "apivendedor/lista",
      method: "GET",
      endpoint: "/apivendedor/lista?porPagina=5",
      token,
    }),
  );
  results.push(
    await call({
      phase: "B",
      label: "apiformapago/lista",
      method: "GET",
      endpoint: "/apiformapago/lista?comprobante=FACTURA",
      token,
    }),
  );
  results.push(
    await call({
      phase: "B",
      label: "apicliente/impuestos",
      method: "GET",
      endpoint: "/apicliente/impuestos",
      token,
    }),
  );
  results.push(
    await call({
      phase: "B",
      label: "apicliente/tiposcliente",
      method: "GET",
      endpoint: "/apicliente/tiposcliente",
      token,
    }),
  );

  // FASE C
  console.log(`--- FASE C: Reportes ---`);
  results.push(
    await call({
      phase: "C",
      label: "totalventas tipo=01 (hoy)",
      method: "GET",
      endpoint: "/apireporte/totalventas?tipo=01",
      token,
    }),
  );
  results.push(
    await call({
      phase: "C",
      label: "totalventas tipo=03 (mes)",
      method: "GET",
      endpoint: "/apireporte/totalventas?tipo=03",
      token,
    }),
  );
  results.push(
    await call({
      phase: "C",
      label: "totalventas tipo=04 (anio)",
      method: "GET",
      endpoint: "/apireporte/totalventas?tipo=04",
      token,
    }),
  );

  if (sucursalId !== null) {
    results.push(
      await call({
        phase: "C",
        label: "diarioventas",
        method: "GET",
        endpoint: `/apireporte/diarioventas?sucursalId=${encodeURIComponent(String(sucursalId))}&desde=${fechaDesde}&hasta=${fechaHasta}`,
        token,
      }),
    );
    results.push(
      await call({
        phase: "C",
        label: "ventasucursal",
        method: "GET",
        endpoint: `/apireporte/ventasucursal?sucursalId=${encodeURIComponent(String(sucursalId))}&fecha=${fechaHasta}&porPagina=5`,
        token,
      }),
    );
  } else {
    console.log(`(skip diarioventas/ventasucursal: no hay sucursalId disponible)`);
    results.push({
      phase: "C",
      label: "diarioventas",
      method: "GET",
      endpoint: "/apireporte/diarioventas",
      url: "(skipped)",
      status: "error_red",
      http_code: null,
      notas: "SKIP: no se obtuvo sucursalId en paso d",
      sample: "",
      duration_ms: 0,
    });
    results.push({
      phase: "C",
      label: "ventasucursal",
      method: "GET",
      endpoint: "/apireporte/ventasucursal",
      url: "(skipped)",
      status: "error_red",
      http_code: null,
      notas: "SKIP: no se obtuvo sucursalId en paso d",
      sample: "",
      duration_ms: 0,
    });
  }

  // FASE D
  console.log(`--- FASE D: Facturas y cobranza ---`);
  const facturaRes = await call({
    phase: "D",
    label: "apifactura/lista",
    method: "GET",
    endpoint: `/apifactura/lista?desde=${fechaDesde}&hasta=${fechaHasta}&porPagina=5`,
    token,
  });
  results.push(facturaRes);

  const firstFactura = firstItem(facturaRes.full_response);
  const facturaClienteId = pickIdLike(firstFactura, [
    "clienteId",
    "idCliente",
    "cliente_id",
    "id_cliente",
  ]);
  const facturaId = pickIdLike(firstFactura, [
    "facturaId",
    "id",
    "idFactura",
    "factura_id",
    "numeroFactura",
    "numero",
  ]);

  if (facturaClienteId !== null) {
    results.push(
      await call({
        phase: "D",
        label: "apicliente/estadocuenta",
        method: "GET",
        endpoint: `/apicliente/estadocuenta?clienteId=${encodeURIComponent(String(facturaClienteId))}`,
        token,
      }),
    );
    results.push(
      await call({
        phase: "D",
        label: "apicobranza/cliente",
        method: "GET",
        endpoint: `/apicobranza/cliente?clienteId=${encodeURIComponent(String(facturaClienteId))}&porPagina=5`,
        token,
      }),
    );
  } else {
    console.log(`(skip estadocuenta/cobranza: no hay clienteId desde factura)`);
    results.push({
      phase: "D",
      label: "apicliente/estadocuenta",
      method: "GET",
      endpoint: "/apicliente/estadocuenta",
      url: "(skipped)",
      status: "error_red",
      http_code: null,
      notas: "SKIP: no se obtuvo clienteId desde apifactura/lista",
      sample: "",
      duration_ms: 0,
    });
    results.push({
      phase: "D",
      label: "apicobranza/cliente",
      method: "GET",
      endpoint: "/apicobranza/cliente",
      url: "(skipped)",
      status: "error_red",
      http_code: null,
      notas: "SKIP: no se obtuvo clienteId desde apifactura/lista",
      sample: "",
      duration_ms: 0,
    });
  }

  if (facturaId !== null) {
    results.push(
      await call({
        phase: "D",
        label: "apifactura/info",
        method: "GET",
        endpoint: `/apifactura/info?facturaId=${encodeURIComponent(String(facturaId))}`,
        token,
      }),
    );
  } else {
    console.log(`(skip apifactura/info: no hay facturaId)`);
    results.push({
      phase: "D",
      label: "apifactura/info",
      method: "GET",
      endpoint: "/apifactura/info",
      url: "(skipped)",
      status: "error_red",
      http_code: null,
      notas: "SKIP: no se obtuvo facturaId desde apifactura/lista",
      sample: "",
      duration_ms: 0,
    });
  }

  // FASE E
  console.log(`--- FASE E: Inventario ---`);
  const articulosRes = await call({
    phase: "E",
    label: "apiarticulos/lista",
    method: "GET",
    endpoint: "/apiarticulos/lista?porPagina=5",
    token,
  });
  results.push(articulosRes);

  const firstArticulo = firstItem(articulosRes.full_response);
  const codigoBarra = pickIdLike(firstArticulo, [
    "codigoBarra",
    "codigo_barra",
    "barcode",
    "codigoBarras",
  ]);
  const articuloId = pickIdLike(firstArticulo, [
    "articuloId",
    "id",
    "idArticulo",
    "articulo_id",
    "codigo",
  ]);

  if (codigoBarra !== null) {
    results.push(
      await call({
        phase: "E",
        label: "apiarticulos/info",
        method: "GET",
        endpoint: `/apiarticulos/info?codigoBarra=${encodeURIComponent(String(codigoBarra))}`,
        token,
      }),
    );
  } else {
    console.log(`(skip apiarticulos/info: no hay codigoBarra)`);
    results.push({
      phase: "E",
      label: "apiarticulos/info",
      method: "GET",
      endpoint: "/apiarticulos/info",
      url: "(skipped)",
      status: "error_red",
      http_code: null,
      notas: "SKIP: no se obtuvo codigoBarra desde apiarticulos/lista",
      sample: "",
      duration_ms: 0,
    });
  }

  if (articuloId !== null) {
    results.push(
      await call({
        phase: "E",
        label: "apiarticulos/stock",
        method: "GET",
        endpoint: `/apiarticulos/stock?articuloId=${encodeURIComponent(String(articuloId))}`,
        token,
      }),
    );
  } else {
    console.log(`(skip apiarticulos/stock: no hay articuloId)`);
    results.push({
      phase: "E",
      label: "apiarticulos/stock",
      method: "GET",
      endpoint: "/apiarticulos/stock",
      url: "(skipped)",
      status: "error_red",
      http_code: null,
      notas: "SKIP: no se obtuvo articuloId desde apiarticulos/lista",
      sample: "",
      duration_ms: 0,
    });
  }

  finalize();
}

function statusIcon(s: Status): string {
  switch (s) {
    case "success":
      return "OK";
    case "vacio":
      return "VACIO";
    case "no_habilitado":
      return "NO";
    case "error_servidor":
      return "ERR500";
    case "timeout":
      return "TIMEOUT";
    case "error_red":
      return "ERR";
    case "error_parse":
      return "PARSE";
  }
}

function pad(s: string, n: number): string {
  if (s.length >= n) return s.slice(0, n);
  return s + " ".repeat(n - s.length);
}

function finalize() {
  console.log(`\n========================== RESULTADOS ==========================`);
  console.log(`Formato de auth detectado: ${currentAuthLabel}\n`);

  const headers = [
    pad("Fase", 5),
    pad("Endpoint", 32),
    pad("Status", 8),
    pad("HTTP", 5),
    "Notas",
  ];
  console.log(headers.join(" | "));
  console.log("-".repeat(110));

  for (const r of results) {
    console.log(
      [
        pad(r.phase, 5),
        pad(r.label, 32),
        pad(statusIcon(r.status), 8),
        pad(r.http_code === null ? "-" : String(r.http_code), 5),
        r.notas,
      ].join(" | "),
    );
  }

  const counts = results.reduce<Record<Status, number>>(
    (acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1;
      return acc;
    },
    {
      success: 0,
      vacio: 0,
      no_habilitado: 0,
      error_servidor: 0,
      timeout: 0,
      error_red: 0,
      error_parse: 0,
    },
  );

  console.log(`\nResumen:`);
  console.log(`  OK:        ${counts.success}`);
  console.log(`  VACIO:     ${counts.vacio}`);
  console.log(`  NO HAB:    ${counts.no_habilitado}`);
  console.log(`  ERR 500:   ${counts.error_servidor}`);
  console.log(`  TIMEOUT:   ${counts.timeout}`);
  console.log(`  ERR RED:   ${counts.error_red}`);
  console.log(`  PARSE:     ${counts.error_parse}`);

  const outFile = resolve(__dirname, "switch-api-discovery-output.json");
  const payload = {
    meta: {
      base_url: BASE,
      usuario: API_USER,
      timestamp: new Date().toISOString(),
      timeout_ms: TIMEOUT_MS,
      auth_format: currentAuthLabel,
    },
    summary: counts,
    results,
  };
  writeFileSync(outFile, JSON.stringify(payload, null, 2), "utf-8");
  console.log(`\nOutput completo: ${outFile}\n`);
}

run().catch((err) => {
  console.error("\nError fatal no manejado:", err);
  finalize();
  process.exit(1);
});
