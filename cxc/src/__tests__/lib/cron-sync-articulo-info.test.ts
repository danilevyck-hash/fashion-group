// ─────────────────────────────────────────────────────────────────────────────
// Cron de `switch_articulo_info` (tab Ventas › Referencia) — candados.
//
// Daniel (10-ago-2026): *"es que debería ser ya automático"*. El sync existía
// desde el #448 pero solo corría con el botón del tab. Ahora hay cron diario, y
// estos tests protegen las tres cosas que más duele romper:
//
//   A. LAS EMPRESAS. El cron cubre EXACTAMENTE las 6 de Fashion Group
//      (B2B_EMPRESA_KEYS) y jamás a Boston ni American Classic — exclusión de
//      Daniel, la misma del tab.
//   B. EL CALENDARIO. Tres entradas de 2 empresas (NO una de 6: vistana sola
//      midió 155 s / 8.122 artículos — 6 así desbordan los 800 s del techo,
//      el caso Boston). Cada grupo a ≥50 min de cualquier otra entrada que
//      comparta empresa (regla de la casa para crons largos), y el ?empresas=
//      de vercel.json es EL MISMO del cronograma — el test general de choques
//      solo compara path+hora, así que sin esto un query desalineado vigilaría
//      un calendario que no es el real.
//   C. EL ROUTE. Serial (sesión única de Switch), una empresa caída no le quita
//      la corrida a la siguiente, heartbeat SOLO sin errores, y el fallo pasa
//      por alertSwitchCronErrors (política de 2 fallos seguidos) — nunca un
//      canal nuevo.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import { NextRequest } from "next/server";

vi.mock("@/lib/supabase-server", () => ({ supabaseServer: { from: vi.fn() } }));
vi.mock("@/lib/telegram", () => ({
  sendTelegramAlert: vi.fn(),
  shortError: (s: string) => s,
}));
vi.mock("@/lib/switch-api/sync-articulo-info", () => ({
  syncArticuloInfo: vi.fn(),
}));
vi.mock("@/lib/switch-api/client", () => ({
  logoutAllSwitchSessions: vi.fn(async () => {}),
}));
vi.mock("@/lib/switch-api/alert-policy", () => ({
  alertSwitchCronErrors: vi.fn(async () => {}),
}));
vi.mock("@/lib/cron-telemetry", async (orig) => {
  const real = await (orig() as Promise<Record<string, unknown>>);
  return { ...real, recordCronHeartbeat: vi.fn(async () => {}) };
});

import { GET } from "@/app/api/cron/sync-articulo-info/route";
import { syncArticuloInfo } from "@/lib/switch-api/sync-articulo-info";
import { logoutAllSwitchSessions } from "@/lib/switch-api/client";
import { alertSwitchCronErrors } from "@/lib/switch-api/alert-policy";
import {
  SWITCH_CRON_ENTRADAS,
  SEED_TOLERANT_CRONS,
  CRONS_FAIL_CLOSED,
  recordCronHeartbeat,
  distanciaCircularMin,
} from "@/lib/cron-telemetry";
import { B2B_EMPRESA_KEYS } from "@/lib/empresa-mapping";

const mockSync = vi.mocked(syncArticuloInfo);
const mockLogout = vi.mocked(logoutAllSwitchSessions);
const mockAlert = vi.mocked(alertSwitchCronErrors);
const mockHeartbeat = vi.mocked(recordCronHeartbeat);

const VERCEL: { crons: Array<{ path: string; schedule: string }> } = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "../../../vercel.json"), "utf8"),
);

const ENTRADAS = SWITCH_CRON_ENTRADAS.filter((e) => e.cron === "sync-articulo-info");

const okResult = (empresaKey: string) => ({
  empresaKey,
  tablaLista: true,
  renglones: 100,
  articulosUnicos: 100,
  filasEscritas: 100,
  rechazadasPorMonto: 0,
  syncedAt: "2026-08-10T04:30:00.000Z",
});

const reqCron = (query: string, auth = "Bearer test-secret") =>
  new NextRequest(`http://test.local/api/cron/sync-articulo-info${query}`, {
    headers: auth ? { authorization: auth } : {},
  });

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "test-secret";
  mockSync.mockImplementation(async (empresaKey: string) => okResult(empresaKey));
});

afterEach(() => {
  delete process.env.CRON_SECRET;
});

// ─────────────────────────────────────────────────────────────────────────────
describe("A. las empresas — exactamente las 6 FG, nunca Boston/ACS", () => {
  it("las 3 entradas cubren la unión EXACTA de B2B_EMPRESA_KEYS, sin repetir", () => {
    expect(ENTRADAS).toHaveLength(3);
    const union = ENTRADAS.flatMap((e) => [...e.empresas]);
    expect(union.length).toBe(new Set(union).size); // grupos disjuntos
    expect([...union].sort()).toEqual([...B2B_EMPRESA_KEYS].sort());
  });

  it("ni confecciones_boston ni american_classic aparecen en ningún grupo", () => {
    for (const e of ENTRADAS) {
      expect(e.empresas).not.toContain("confecciones_boston");
      expect(e.empresas).not.toContain("american_classic");
    }
  });

  it("cada grupo lleva 2 empresas — el barrido medido (155 s/empresa) no da para más de ~2 por entrada con margen", () => {
    for (const e of ENTRADAS) expect(e.empresas).toHaveLength(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("B. el calendario — banda libre y query alineado con el cronograma", () => {
  it("cada grupo queda a ≥50 min de TODA otra entrada que comparta empresa (regla de crons largos)", () => {
    // El test general de cron-calendario exige 15; este cron barre catálogos
    // completos (155 s medidos por empresa) y se colocó a propósito con el
    // margen de los crons largos. Si alguien lo arrima al bloque `all`, esto
    // se pone rojo antes de que Switch tumbe una sesión en producción.
    for (const mia of ENTRADAS) {
      for (const otra of SWITCH_CRON_ENTRADAS) {
        if (otra.cron === "sync-articulo-info") continue;
        if (!otra.empresas.some((e) => mia.empresas.includes(e))) continue;
        const gap = distanciaCircularMin(mia.hhmmUtc, otra.hhmmUtc);
        expect(
          gap,
          `${mia.cron} ${mia.hhmmUtc} vs ${otra.cron} ${otra.hhmmUtc} — ${gap} min`,
        ).toBeGreaterThanOrEqual(50);
      }
    }
  });

  it("el ?empresas= de cada entrada de vercel.json ES el del cronograma (mismo hhmm, misma lista)", () => {
    // cron-calendario.test.ts compara path+hora pero NO el query: sin este
    // candado, vercel.json podría correr unas empresas y el cronograma vigilar
    // otras — el mismo agujero que los slots cerraron para switch-sync.
    const enVercel = VERCEL.crons.filter((c) =>
      c.path.startsWith("/api/cron/sync-articulo-info"),
    );
    expect(enVercel).toHaveLength(ENTRADAS.length);
    for (const c of enVercel) {
      const [min, hora] = c.schedule.split(" ");
      const hhmm = `${hora.padStart(2, "0")}${min.padStart(2, "0")}`;
      const entrada = ENTRADAS.find((e) => e.hhmmUtc === hhmm);
      expect(entrada, `${c.path} (${hhmm}) sin entrada en SWITCH_CRON_ENTRADAS`).toBeTruthy();
      const query = new URLSearchParams(c.path.split("?")[1] ?? "").get("empresas") ?? "";
      expect(query.split(",").sort()).toEqual([...entrada!.empresas].sort());
    }
  });

  it("está registrado como SEED-TOLERANT (no fail-closed hasta llevar días sembrado)", () => {
    expect(SEED_TOLERANT_CRONS).toContain("sync-articulo-info");
    expect(CRONS_FAIL_CLOSED).not.toContain("sync-articulo-info");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("C. el route", () => {
  it("sin CRON_SECRET responde 500; con bearer malo 401 — y Switch no se toca", async () => {
    delete process.env.CRON_SECRET;
    expect((await GET(reqCron("?empresas=vistana"))).status).toBe(500);

    process.env.CRON_SECRET = "test-secret";
    expect((await GET(reqCron("?empresas=vistana", "Bearer otro"))).status).toBe(401);
    expect(mockSync).not.toHaveBeenCalled();
  });

  it("sin ?empresas= responde 400 — nada de correr las 6 en serie por accidente (desborde de maxDuration)", async () => {
    const res = await GET(reqCron(""));
    expect(res.status).toBe(400);
    expect(mockSync).not.toHaveBeenCalled();
  });

  it("Boston y American Classic se rechazan con 400 antes de tocar nada", async () => {
    for (const query of ["?empresas=confecciones_boston", "?empresas=vistana,american_classic", "?empresas=lo-que-sea"]) {
      const res = await GET(reqCron(query));
      expect(res.status, query).toBe(400);
    }
    expect(mockSync).not.toHaveBeenCalled();
  });

  it("corre SERIAL: la 2ª empresa no arranca hasta que la 1ª terminó (sesión única)", async () => {
    let resolver!: (v: ReturnType<typeof okResult>) => void;
    mockSync.mockImplementationOnce(
      () => new Promise((res) => { resolver = res; }),
    );
    const pendiente = GET(reqCron("?empresas=vistana,active_wear"));
    await Promise.resolve(); // deja arrancar el handler
    expect(mockSync).toHaveBeenCalledTimes(1);
    expect(mockSync).toHaveBeenCalledWith("vistana", "cron");
    resolver(okResult("vistana"));
    const res = await pendiente;
    expect(res.status).toBe(200);
    expect(mockSync.mock.calls.map((c) => c[0])).toEqual(["vistana", "active_wear"]);
  });

  it("grupo completo OK → heartbeat sync-articulo-info, sin alerta, triggered_by='cron'", async () => {
    const res = await GET(reqCron("?empresas=vistana,active_wear"));
    expect(res.status).toBe(200);
    expect(mockSync.mock.calls).toEqual([
      ["vistana", "cron"],
      ["active_wear", "cron"],
    ]);
    expect(mockHeartbeat).toHaveBeenCalledWith("sync-articulo-info");
    expect(mockAlert).not.toHaveBeenCalled();
  });

  it("una empresa caída NO le quita la corrida a la siguiente, NO deja heartbeat y avisa por la política de 2 fallos", async () => {
    mockSync.mockRejectedValueOnce(new Error("Auth fallo: HTTP 401"));
    const res = await GET(reqCron("?empresas=vistana,active_wear"));
    expect(res.status).toBe(207);
    // active_wear corrió aunque vistana falló:
    expect(mockSync.mock.calls.map((c) => c[0])).toEqual(["vistana", "active_wear"]);
    expect(mockHeartbeat).not.toHaveBeenCalled();
    expect(mockAlert).toHaveBeenCalledTimes(1);
    const [cronName, errores] = mockAlert.mock.calls[0];
    expect(cronName).toBe("sync-articulo-info");
    expect(errores).toEqual([
      { empresaKey: "vistana", syncType: "articulo_info", error: "Auth fallo: HTTP 401" },
    ]);
  });

  it("cierra las sesiones de Switch SIEMPRE (éxito, fallo y hasta 401)", async () => {
    await GET(reqCron("?empresas=vistana"));
    mockSync.mockRejectedValueOnce(new Error("x"));
    await GET(reqCron("?empresas=vistana"));
    await GET(reqCron("?empresas=vistana", "Bearer otro"));
    expect(mockLogout).toHaveBeenCalledTimes(3);
  });

  it("exports estáticos: force-dynamic y maxDuration 800 (2 empresas ≈ 5-7 min medidos)", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../app/api/cron/sync-articulo-info/route.ts"),
      "utf8",
    );
    expect(src).toContain('export const dynamic = "force-dynamic"');
    expect(src).toContain("export const maxDuration = 800");
    expect(src).toContain('const CRON_NAME = "sync-articulo-info"');
  });
});
