/**
 * Los guards de EGRESOS VARIOS, probados POR CONDUCTA — corriendo el sync de
 * verdad contra una base y un Switch de mentira.
 *
 * 🩸 POR QUÉ ESTE ARCHIVO EXISTE, Y ES LA LECCIÓN MÁS CARA DEL PR.
 * `sync-egresos-varios.test.ts` protegía los guards con un barrido de texto
 * (`expect(SYNC).toMatch(/vino vacío pero ya había/)`). Se verificó por mutación
 * y **el guard del cero silencioso se pudo desarmar sin que un solo test se
 * pusiera rojo**: cambiando su `if` por `if (false)` el MENSAJE seguía en el
 * archivo, así que el barrido se daba por satisfecho con la frase de un `throw`
 * inalcanzable. Es el mismo defecto que este repo ya documentó dos veces (un
 * candado que se cumple a sí mismo con un comentario). Un guard de plata se
 * prueba EJECUTÁNDOLO.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── El Switch de mentira ────────────────────────────────────────────────────
const fetchEgresosVarios = vi.fn();
const cerrarSesionWeb = vi.fn();
const loginSwitchWeb = vi.fn(async (empresaKey: string) => ({
  empresaKey,
  baseUrl: "https://x",
  cookies: new Map<string, string>(),
}));

vi.mock("@/lib/switch-api/web-client", () => ({
  loginSwitchWeb: (k: string) => loginSwitchWeb(k),
  fetchEgresosVarios: (...a: unknown[]) => fetchEgresosVarios(...a),
  cerrarSesionWeb: (...a: unknown[]) => cerrarSesionWeb(...a),
}));

// ── El log de sync de mentira ───────────────────────────────────────────────
const finishSwitchSyncLog = vi.fn();
vi.mock("@/lib/switch-api/sync-log", () => ({
  createSwitchSyncLog: vi.fn(async () => "log-1"),
  finishSwitchSyncLog: (...a: unknown[]) => finishSwitchSyncLog(...a),
}));

// ── El guard de montos: se calibra al piso y no manda Telegram ──────────────
vi.mock("@/lib/switch-api/monto-guard-io", () => ({
  calibrarUmbral: vi.fn(async () => 1_000_000),
  detallesDeRechazo: vi.fn(() => []),
  avisarMontosImposibles: vi.fn(async () => {}),
}));

// ── La base de mentira ──────────────────────────────────────────────────────
/** Cuántos renglones dice la base que ya tiene guardados de ese año. */
let yaGuardados = 0;
/** Llamadas a `egresos_reemplazar_mes`: (mes, renglones). */
let reemplazos: Array<{ mes: string; lineas: unknown[] }> = [];
let importacionesInsertadas: Array<Record<string, unknown>> = [];

const rpc = vi.fn(async (nombre: string, args: Record<string, unknown>) => {
  if (nombre === "egresos_reemplazar_mes") {
    reemplazos.push({
      mes: String(args.p_mes),
      lineas: (args.p_lineas as unknown[]) ?? [],
    });
  }
  return { error: null };
});

function from(tabla: string) {
  const api: Record<string, unknown> = {};
  const cadena = () => api;
  // Todo lo que encadena devuelve la misma cadena; los terminales resuelven.
  for (const m of ["select", "eq", "gte", "lte", "order", "range", "limit"]) {
    api[m] = vi.fn(cadena);
  }
  api.select = vi.fn((_cols: string, opts?: { count?: string; head?: boolean }) => {
    if (opts?.head) {
      // El COUNT del guard: cuántos renglones ya hay de ese año.
      const contador = { count: yaGuardados, error: null };
      const enc: Record<string, unknown> = {};
      for (const m of ["eq", "gte", "lte"]) enc[m] = vi.fn(() => enc);
      // Se resuelve como promesa cuando alguien le hace await.
      (enc as { then: unknown }).then = (res: (v: unknown) => unknown) => res(contador);
      return enc;
    }
    return api;
  });
  api.insert = vi.fn((fila: Record<string, unknown>) => {
    if (tabla === "egresos_importaciones") importacionesInsertadas.push(fila);
    return {
      select: () => ({ single: async () => ({ data: { id: "imp-1" }, error: null }) }),
    };
  });
  (api as { then: unknown }).then = (res: (v: unknown) => unknown) =>
    res({ data: [], error: null });
  return api;
}

vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: {
    from: (t: string) => from(t),
    rpc: (n: string, a: Record<string, unknown>) => rpc(n, a),
  },
}));

import { syncEmpresaEgresos } from "@/lib/switch-api/sync-egresos-varios";

// ── Utilidades del arnés ────────────────────────────────────────────────────
const CAB = "FECHA;N.INTERNO; CUENTA  CONTABLE ;SUCURSAL;PROVEEDOR;REFERENCIA;TOTAL";

/** Un CSV con `n` renglones de $10,00 cada uno, todos en enero. */
function csvCon(n: number, monto = "10.00"): string {
  const filas = Array.from(
    { length: n },
    (_, i) => `2026-01-${String((i % 28) + 1).padStart(2, "0")};120-${i};6.02.01.00.00;PRINCIPAL;;X;${monto}`,
  );
  return [CAB, ...filas].join("\n");
}

const responde = (csv: string) =>
  fetchEgresosVarios.mockResolvedValue({ csv, rutaUsada: "/caja/egresosvariosexportar", rondas: 1, archivo: "f.csv" });

beforeEach(() => {
  yaGuardados = 0;
  reemplazos = [];
  importacionesInsertadas = [];
  vi.clearAllMocks();
  loginSwitchWeb.mockResolvedValue({ empresaKey: "vistana", baseUrl: "https://x", cookies: new Map() });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 guard del CERO SILENCIOSO", () => {
  it("reporte vacío + año que YA tenía renglones → error, y NO se borra nada", async () => {
    yaGuardados = 378;
    responde(CAB);

    const r = await syncEmpresaEgresos("vistana", 2026);

    expect(r.ok).toBe(false);
    expect(r.error).toContain("vino vacío pero ya había 378");
    // Lo que de verdad importa: no se ejecutó ni un reemplazo de mes.
    expect(reemplazos).toEqual([]);
    expect(importacionesInsertadas).toEqual([]);
    expect(finishSwitchSyncLog).toHaveBeenCalledWith("log-1", "error", expect.anything());
  });

  it("reporte vacío + año SIN renglones → es legítimo, corre normal", async () => {
    // Hay empresas que no mueven caja: joystep tuvo 0 líneas de mayor en 2026.
    yaGuardados = 0;
    responde(CAB);

    const r = await syncEmpresaEgresos("joystep", 2026);

    expect(r.ok).toBe(true);
    expect(r.renglones).toBe(0);
    // Se recorren los 12 meses igual, para vaciar lo que haya quedado.
    expect(reemplazos).toHaveLength(12);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 guard del BARRIDO CORTO", () => {
  it("una descarga a medias (100 de 378) → error, y NO se borra nada", async () => {
    yaGuardados = 378;
    responde(csvCon(100));

    const r = await syncEmpresaEgresos("vistana", 2026);

    expect(r.ok).toBe(false);
    expect(r.error).toContain("descarga a medias");
    expect(reemplazos).toEqual([]);
  });

  it("una baja normal por anulaciones (370 de 378) SÍ pasa", async () => {
    // El 70% es holgado a propósito: perder un tercio de un año por
    // anulaciones no es un cambio de negocio plausible; perder 8 sí.
    yaGuardados = 378;
    responde(csvCon(370));

    const r = await syncEmpresaEgresos("vistana", 2026);

    expect(r.ok).toBe(true);
    expect(r.renglones).toBe(370);
  });

  it("justo en el borde del 70% pasa, y un renglón menos no", async () => {
    yaGuardados = 100;
    responde(csvCon(70));
    expect((await syncEmpresaEgresos("vistana", 2026)).ok).toBe(true);

    reemplazos = [];
    responde(csvCon(69));
    const r = await syncEmpresaEgresos("vistana", 2026);
    expect(r.ok).toBe(false);
    expect(reemplazos).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("el reemplazo de mes es lo que impide duplicar", () => {
  it("se reescriben los 12 meses, también los vacíos", async () => {
    responde(csvCon(5));
    await syncEmpresaEgresos("vistana", 2026);

    expect(reemplazos.map((r) => r.mes)).toEqual([
      "2026-01-01", "2026-02-01", "2026-03-01", "2026-04-01",
      "2026-05-01", "2026-06-01", "2026-07-01", "2026-08-01",
      "2026-09-01", "2026-10-01", "2026-11-01", "2026-12-01",
    ]);
    // Los 5 renglones van a enero; los otros 11 meses se vacían.
    expect(reemplazos[0].lineas).toHaveLength(5);
    expect(reemplazos.slice(1).every((r) => r.lineas.length === 0)).toBe(true);
  });

  it("correr el sync DOS veces con el mismo archivo no acumula", async () => {
    // La garantía es el DELETE + INSERT atómico de la RPC: la segunda corrida
    // manda exactamente los mismos 5 renglones al mismo mes, no 10.
    responde(csvCon(5));
    await syncEmpresaEgresos("vistana", 2026);
    const primera = reemplazos.find((r) => r.mes === "2026-01-01")!.lineas.length;

    reemplazos = [];
    yaGuardados = 5;
    await syncEmpresaEgresos("vistana", 2026);
    const segunda = reemplazos.find((r) => r.mes === "2026-01-01")!.lineas.length;

    expect(primera).toBe(5);
    expect(segunda).toBe(5);
  });

  it("los montos viajan en dólares con 2 decimales exactos, desde los centavos", async () => {
    responde(csvCon(1, "1234.56"));
    await syncEmpresaEgresos("vistana", 2026);
    const l = reemplazos.find((r) => r.mes === "2026-01-01")!.lineas[0] as Record<string, unknown>;
    expect(l.total).toBe("1234.56");
    expect(l.n_interno).toBe("120-0");
    expect(l.cuenta).toBe("6.02.01.00.00");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("el guard de MONTOS IMPOSIBLES rechaza la fila, no la corrida", () => {
  it("una cifra absurda no entra, y las buenas sí", async () => {
    const csv = [
      CAB,
      "2026-01-02;120-1;6.02.01.00.00;PRINCIPAL;;buena;100.00",
      "2026-01-03;120-2;6.02.01.00.00;PRINCIPAL;;absurda;1000000049.22",
      "2026-01-04;120-3;6.02.01.00.00;PRINCIPAL;;buena;200.00",
    ].join("\n");
    responde(csv);

    const r = await syncEmpresaEgresos("vistana", 2026);

    expect(r.ok).toBe(true);
    expect(r.montosImposibles).toBe(1);
    expect(r.renglones).toBe(2);
    expect(r.totalCent).toBe(30000);
    const enero = reemplazos.find((x) => x.mes === "2026-01-01")!.lineas as Array<Record<string, unknown>>;
    expect(enero.map((l) => l.referencia)).toEqual(["buena", "buena"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("la sesión de Switch", () => {
  it("se cierra SIEMPRE, también cuando la corrida falla", async () => {
    yaGuardados = 378;
    responde(CAB); // dispara el guard del cero silencioso

    await syncEmpresaEgresos("vistana", 2026);

    expect(cerrarSesionWeb).toHaveBeenCalledTimes(1);
  });

  it("se cierra también cuando la descarga revienta", async () => {
    fetchEgresosVarios.mockRejectedValue(new Error("Switch devolvió HTML"));
    const r = await syncEmpresaEgresos("vistana", 2026);
    expect(r.ok).toBe(false);
    expect(cerrarSesionWeb).toHaveBeenCalledTimes(1);
  });

  it("si el login falla no se abre nada que cerrar, y no revienta", async () => {
    loginSwitchWeb.mockRejectedValue(new Error("login no completó"));
    const r = await syncEmpresaEgresos("vistana", 2026);
    expect(r.ok).toBe(false);
    expect(cerrarSesionWeb).not.toHaveBeenCalled();
  });

  it("se le pide a Switch el AÑO ENTERO", async () => {
    responde(csvCon(1));
    await syncEmpresaEgresos("vistana", 2026);
    expect(fetchEgresosVarios).toHaveBeenCalledWith(
      expect.anything(),
      "2026-01-01",
      "2026-12-31",
    );
  });

  it("y con un rango explícito se le pide ESE (para certificar contra un archivo)", async () => {
    responde(csvCon(1));
    await syncEmpresaEgresos("vistana", 2026, { desde: "2026-01-01", hasta: "2026-08-13" });
    expect(fetchEgresosVarios).toHaveBeenCalledWith(
      expect.anything(),
      "2026-01-01",
      "2026-08-13",
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("un archivo ilegible NO se escribe como 'no hubo egresos'", () => {
  it("el HTML de excepción de Switch termina en error, no en un mes vacío", async () => {
    responde("<!DOCTYPE html><html>Whoops</html>");
    const r = await syncEmpresaEgresos("vistana", 2026);
    expect(r.ok).toBe(false);
    expect(reemplazos).toEqual([]);
  });
});
