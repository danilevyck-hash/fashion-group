/**
 * Renovación de token por `new_token` (PDF de Switch §4, pág. 6).
 *
 * Lo que se está protegiendo: Switch es SESIÓN ÚNICA por usuario — *"Solo habrá
 * un token válido a la vez por usuario"*. Cada `POST /autenticacion` tumba la
 * sesión que estuviera viva y le deja un `0006 TOKEN INVALIDO`. Cuando el token
 * vence, Switch nos REGALA uno nuevo dentro del propio 401 `0005`; usarlo es una
 * renovación que no consume el cupo de sesión. Re-autenticar en ese caso es
 * exactamente lo que provoca el 0006 que después hay que recuperar.
 *
 * Los 4 casos obligatorios están abajo, más el que documenta el LÍMITE real del
 * mecanismo (`no evita el login inicial`), que es lo que acota su impacto.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createSwitchClient } from "@/lib/switch-api/client";

const EMPRESA = "testco";
const BASE = "https://switch.test";

interface RespuestaFalsa {
  status: number;
  body: unknown;
}

/** Cola de respuestas; cada fetch consume la siguiente. */
let cola: RespuestaFalsa[] = [];
let llamadas: { url: string; auth: string | undefined }[] = [];

function encolar(...rs: RespuestaFalsa[]) {
  cola.push(...rs);
}

const OK_SUCURSALES = { status: 200, body: { data: { sucursales: [] } } };
const login = (token: string) => ({
  status: 200,
  body: { data: { token, expires_in: 60, expires_at: "2026-07-27 12:00:00 GMT-5" } },
});
/** 401 con code 0005 (TOKEN EXPIRADO). Con `newToken` = el caso que Switch documenta. */
const expirado = (newToken?: string) => ({
  status: 401,
  body: {
    error: {
      code: "0005",
      http_code: 401,
      message: "TOKEN EXPIRADO",
      ...(newToken ? { new_token: newToken, expires_in: 60 } : {}),
    },
  },
});
/** 401 con code 0006 (TOKEN INVALIDO): otro login nos sacó la sesión. */
const invalido = (extra: Record<string, unknown> = {}) => ({
  status: 401,
  body: { error: { code: "0006", http_code: 401, message: "TOKEN INVALIDO", ...extra } },
});

const logins = () => llamadas.filter((l) => l.url.includes("/autenticacion"));
const negocio = () => llamadas.filter((l) => !l.url.includes("/autenticacion"));

beforeEach(() => {
  cola = [];
  llamadas = [];
  process.env[`SWITCH_${EMPRESA.toUpperCase()}_API_URL`] = BASE;
  process.env[`SWITCH_${EMPRESA.toUpperCase()}_API_USER`] = "u";
  process.env[`SWITCH_${EMPRESA.toUpperCase()}_API_PASSWORD`] = "p";

  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});

  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    llamadas.push({ url: String(url), auth: headers["Authorization"] });
    const r = cola.shift();
    if (!r) throw new Error(`fetch inesperado (cola vacía): ${url}`);
    return {
      status: r.status,
      text: async () => JSON.stringify(r.body),
    } as unknown as Response;
  });

  // El cache de token vive en el módulo y sobrevive entre tests.
  createSwitchClient(EMPRESA).clearTokenCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  createSwitchClient(EMPRESA).clearTokenCache();
});

describe("0005 con new_token → renueva SIN re-autenticar", () => {
  it("no dispara /autenticacion y reintenta con el token regalado", async () => {
    encolar(login("TOKEN_A"), expirado("TOKEN_NUEVO"), OK_SUCURSALES);

    await createSwitchClient(EMPRESA).listSucursales();

    // El único login es el inicial (cache frío). La renovación NO agregó otro:
    // ahí está todo el punto — un 2º login habría tumbado la sesión de al lado.
    expect(logins()).toHaveLength(1);

    const deNegocio = negocio();
    expect(deNegocio).toHaveLength(2);
    expect(deNegocio[0].auth).toBe("TOKEN_A");
    expect(deNegocio[1].auth).toBe("TOKEN_NUEVO"); // usó el regalado, no uno nuevo
  });

  it("el token renovado queda cacheado: la llamada siguiente no re-loguea", async () => {
    encolar(login("TOKEN_A"), expirado("TOKEN_NUEVO"), OK_SUCURSALES, OK_SUCURSALES);

    const client = createSwitchClient(EMPRESA);
    await client.listSucursales();
    await client.listSucursales();

    expect(logins()).toHaveLength(1);
    expect(negocio().at(-1)?.auth).toBe("TOKEN_NUEVO");
  });
});

describe("0005 SIN new_token → cae al login de siempre", () => {
  it("re-autentica cuando Switch no adjunta token (pasaron los 15 min)", async () => {
    encolar(login("TOKEN_A"), expirado(), login("TOKEN_B"), OK_SUCURSALES);

    await createSwitchClient(EMPRESA).listSucursales();

    expect(logins()).toHaveLength(2); // fallback intacto
    expect(negocio().at(-1)?.auth).toBe("TOKEN_B");
  });
});

describe("0006 se maneja DISTINTO de 0005", () => {
  it("re-loguea (no hay token que renovar: la sesión nos la quitaron)", async () => {
    encolar(login("TOKEN_A"), invalido(), login("TOKEN_B"), OK_SUCURSALES);

    await createSwitchClient(EMPRESA).listSucursales();

    expect(logins()).toHaveLength(2);
    expect(negocio().at(-1)?.auth).toBe("TOKEN_B");
  });

  it("IGNORA un new_token que venga en un 0006 — 0005 sí lo usa, 0006 no", async () => {
    // Mismo cuerpo, distinto code: es la prueba de que la rama discrimina por
    // código y no por "¿hay un new_token?".
    encolar(
      login("TOKEN_A"),
      invalido({ new_token: "TOKEN_SOSPECHOSO" }),
      login("TOKEN_B"),
      OK_SUCURSALES,
    );

    await createSwitchClient(EMPRESA).listSucursales();

    expect(logins()).toHaveLength(2);
    expect(llamadas.some((l) => l.auth === "TOKEN_SOSPECHOSO")).toBe(false);
    expect(negocio().at(-1)?.auth).toBe("TOKEN_B");
  });
});

describe("fail-safe: un refresh fallido NO deja al cliente sin token", () => {
  it(
    "si el token renovado tampoco sirve, re-autentica y la llamada termina bien",
    async () => {
      encolar(
        login("TOKEN_A"),
        expirado("TOKEN_NUEVO"), // renueva…
        invalido(), // …y el renovado tampoco sirve (nos robaron la sesión)
        login("TOKEN_C"), // el retry externo limpia el cache y re-loguea
        OK_SUCURSALES,
      );

      await expect(
        createSwitchClient(EMPRESA).listSucursales(),
      ).resolves.toEqual({ sucursales: [] });

      expect(logins()).toHaveLength(2);
      expect(negocio().at(-1)?.auth).toBe("TOKEN_C");
    },
    15_000, // el retry externo duerme 2s antes del 2º intento
  );

  it("un new_token vacío o no-string se ignora y cae al login", async () => {
    encolar(
      login("TOKEN_A"),
      { status: 401, body: { error: { code: "0005", new_token: "   " } } },
      login("TOKEN_B"),
      OK_SUCURSALES,
    );

    await createSwitchClient(EMPRESA).listSucursales();

    expect(logins()).toHaveLength(2);
    expect(negocio().at(-1)?.auth).toBe("TOKEN_B");
  });
});

describe("LÍMITE del mecanismo (medido 27-jul-2026) — que nadie prometa de más", () => {
  it("NO evita el login inicial: con el cache frío siempre hay /autenticacion", async () => {
    // Cada corrida de cron arranca en frío (el cache vive en el proceso), así
    // que SIEMPRE abre con un login — y ese login es el que tumba la sesión del
    // panel web. `new_token` solo evita los re-logins de MITAD de corrida, y la
    // corrida mediana dura 8 segundos: nunca llega a vencer un token.
    // Por eso esto NO libera a Daniel de que se le caiga la sesión de Switch.
    encolar(login("TOKEN_A"), OK_SUCURSALES);

    await createSwitchClient(EMPRESA).listSucursales();

    expect(logins()).toHaveLength(1);
  });
});
