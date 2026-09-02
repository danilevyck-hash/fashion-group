/**
 * 🩸 CANDADO DE CONDUCTA — UN RENGLÓN DESCARTADO NO PUEDE DESAPARECER EN SILENCIO.
 *
 * ─── EL DEFECTO, Y POR QUÉ ERA PEOR QUE EL INCIDENTE QUE LO DESTAPÓ ─────────
 *
 * El 1-sep-2026 Switch empezó a mandar el nombre de la cuenta pegado al código
 * y el sync de Egresos Varios murió en las cinco empresas que tienen gastos.
 * Se notó **por casualidad**: como falló el 100% de los renglones, el sync se
 * cortó entero y la corrida quedó en `error`.
 *
 * Si el cambio hubiera tocado 3 renglones de 378 en vez de los 378, esos tres
 * gastos se caían SIN UNA SOLA SEÑAL y la corrida se anotaba `success`:
 * `erroresParseo` viajaba solo en la respuesta HTTP del cron —que nadie lee—,
 * no iba a `switch_sync_log.skip_details`, no salía en pantalla y no avisaba.
 * Plata desaparecida en silencio.
 *
 * ─── POR QUÉ ESTE TEST CORRE EL SYNC DE VERDAD ─────────────────────────────
 *
 * Un barrido de texto (`expect(FUENTE).toContain("skipDetails")`) se satisface
 * con el comentario que explica el arreglo — este repo ya pagó ese candado
 * cuatro veces, y en ESTE MISMO módulo: el guard del cero silencioso se pudo
 * desarmar con un `if (false)` sin que nada se pusiera rojo. Acá se ejecuta
 * `syncEmpresaEgresos` contra un reporte con UN renglón ilegible y se mira todo
 * el camino: lo que se escribió en el log, lo que el lector saca de ahí, la
 * línea exacta que ve Daniel y el Telegram que sale (y el que NO sale).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── El Switch de mentira ────────────────────────────────────────────────────
const fetchEgresosVarios = vi.fn();
const cerrarSesionWeb = vi.fn();
const loginSwitchWeb = vi.fn();

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

// ── El catálogo de cuentas viaja en la misma sesión y no pinta acá ──────────
vi.mock("@/lib/switch-api/sync-cuentas-contables", () => ({
  syncCuentasContables: vi.fn(async () => ({ empresaKey: "vistana", ok: true, cuentas: 0 })),
}));

// ── El guard de MONTOS: al piso, sin Telegram. Lo que se prueba acá es la OTRA
//    clase de descarte, y tienen que poder convivir sin taparse. `clavesYa
//    AvisadasPorCampo` es la que comparten los dos anti-loops: se controla.
const clavesYaAvisadasPorCampo = vi.fn(async () => [] as string[]);
vi.mock("@/lib/switch-api/monto-guard-io", () => ({
  calibrarUmbral: vi.fn(async () => 1_000_000),
  detallesDeRechazo: vi.fn(() => []),
  avisarMontosImposibles: vi.fn(async () => {}),
  clavesYaAvisadasPorCampo: (...a: unknown[]) =>
    (clavesYaAvisadasPorCampo as unknown as (...x: unknown[]) => Promise<string[]>)(...a),
}));

// ── Telegram ────────────────────────────────────────────────────────────────
const enviarSistema = vi.fn(async () => {});
vi.mock("@/lib/alertas/canal", () => ({
  enviarSistema: (...a: unknown[]) => enviarSistema(...(a as [])),
  enviarNegocio: vi.fn(async () => {}),
}));

// ── La base de mentira ──────────────────────────────────────────────────────
let yaGuardados = 0;
let reemplazos: Array<{ mes: string; lineas: unknown[] }> = [];
/** Lo que `switch_sync_log` le devuelve al LECTOR de la pantalla. */
let logFilas: Array<{ empresa_key: string; started_at: string; skip_details: unknown }> = [];

const rpc = vi.fn(async (nombre: string, args: Record<string, unknown>) => {
  if (nombre === "egresos_reemplazar_mes") {
    reemplazos.push({ mes: String(args.p_mes), lineas: (args.p_lineas as unknown[]) ?? [] });
  }
  return { error: null };
});

function from(tabla: string) {
  const api: Record<string, unknown> = {};
  const cadena = () => api;
  for (const m of ["select", "eq", "gt", "gte", "lte", "in", "order", "range", "limit"]) {
    api[m] = vi.fn(cadena);
  }
  api.select = vi.fn((_cols: string, opts?: { count?: string; head?: boolean }) => {
    if (opts?.head) {
      const enc: Record<string, unknown> = {};
      for (const m of ["eq", "gte", "lte"]) enc[m] = vi.fn(() => enc);
      (enc as { then: unknown }).then = (res: (v: unknown) => unknown) =>
        res({ count: yaGuardados, error: null });
      return enc;
    }
    return api;
  });
  api.insert = vi.fn(() => ({
    select: () => ({ single: async () => ({ data: { id: "imp-1" }, error: null }) }),
  }));
  (api as { then: unknown }).then = (res: (v: unknown) => unknown) =>
    res({ data: tabla === "switch_sync_log" ? logFilas : [], error: null });
  return api;
}

vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: {
    from: (t: string) => from(t),
    rpc: (n: string, a: Record<string, unknown>) => rpc(n, a),
  },
}));

import { syncEmpresaEgresos } from "@/lib/switch-api/sync-egresos-varios";
import { CAMPO_ILEGIBLE } from "@/lib/switch-api/renglones-ilegibles";
import { lineaDeNoLeidos } from "@/lib/rechazos-de-switch";

// ── Utilidades del arnés ────────────────────────────────────────────────────
const CAB = "FECHA;N.INTERNO; CUENTA  CONTABLE ;SUCURSAL;PROVEEDOR;REFERENCIA;TOTAL";
const BUENO = (i: number) =>
  `2026-01-${String((i % 28) + 1).padStart(2, "0")};120-00000${i};6.02.01.00.00;PRINCIPAL;;X;10.00`;

/** El caso REAL de la 2ª ola, pero en UN renglón de N: el que se caía callado. */
const ILEGIBLE = "2026-01-05;120-000009999;6.03.98.00.00 GASTO;PRINCIPAL;;X;500.00";
/** Una celda que NINGÚN envoltorio salva: seis tramos. Es el ilegible del test. */
const ILEGIBLE_DE_VERDAD = "2026-01-05;120-000009999;6.03.98.00.00.00;PRINCIPAL;;X;500.00";

const responde = (csv: string) =>
  fetchEgresosVarios.mockResolvedValue({
    csv,
    rutaUsada: "/caja/egresosvariosexportar",
    rondas: 1,
    archivo: "f.csv",
  });

/** El `skipDetails` con el que terminó la corrida. */
const detallesEscritos = (): Array<Record<string, unknown>> =>
  ((finishSwitchSyncLog.mock.calls[0]?.[2] as { skipDetails?: unknown })?.skipDetails ??
    []) as Array<Record<string, unknown>>;

const estado = () => finishSwitchSyncLog.mock.calls[0]?.[1];
const skipped = () =>
  (finishSwitchSyncLog.mock.calls[0]?.[2] as { skipped?: number } | undefined)?.skipped;

beforeEach(() => {
  yaGuardados = 0;
  reemplazos = [];
  logFilas = [];
  vi.clearAllMocks();
  clavesYaAvisadasPorCampo.mockResolvedValue([]);
  loginSwitchWeb.mockResolvedValue({ empresaKey: "vistana", baseUrl: "https://x", cookies: new Map() });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("🩸 1 renglón ilegible de 10: los otros 9 entran y el descarte QUEDA ESCRITO", () => {
  const csv = [CAB, ...Array.from({ length: 9 }, (_, i) => BUENO(i)), ILEGIBLE_DE_VERDAD].join("\n");

  it("la corrida NO se cae: los 9 buenos se escriben igual", async () => {
    responde(csv);
    const r = await syncEmpresaEgresos("vistana", 2026);
    expect(r.ok).toBe(true);
    expect(r.renglones).toBe(9);
    expect(reemplazos.find((x) => x.mes === "2026-01-01")?.lineas).toHaveLength(9);
  });

  it("se anota `success` — y por eso el descarte TIENE que verse por otro lado", async () => {
    responde(csv);
    await syncEmpresaEgresos("vistana", 2026);
    expect(estado()).toBe("success");
    expect(skipped()).toBe(1);
  });

  it("🔴 el descarte va a `skip_details`, no solo al conteo", async () => {
    responde(csv);
    await syncEmpresaEgresos("vistana", 2026);
    expect(detallesEscritos()).toHaveLength(1);
    expect(detallesEscritos()[0].campo).toBe(CAMPO_ILEGIBLE);
  });

  it("🔴 el detalle trae el N. INTERNO del documento — con eso se busca en Switch", async () => {
    responde(csv);
    await syncEmpresaEgresos("vistana", 2026);
    expect(detallesEscritos()[0].secuencial).toBe("120-000009999");
  });

  it("🔴 y trae el MOTIVO, que es lo que dice qué mirar", async () => {
    responde(csv);
    await syncEmpresaEgresos("vistana", 2026);
    const crudo = detallesEscritos()[0].valorCrudo as { motivo: string; linea: number };
    expect(crudo.motivo).toContain("6.03.98.00.00.00");
    expect(crudo.motivo).toContain("No reconozco el código de cuenta");
    expect(crudo.linea).toBe(11);
  });

  it("cuando ni el N. INTERNO se pudo leer, la clave lo dice en vez de inventar una", async () => {
    responde([CAB, BUENO(0), "2026-01-05;;6.03.98.00.00.00;PRINCIPAL;;X;500.00"].join("\n"));
    await syncEmpresaEgresos("vistana", 2026);
    expect(String(detallesEscritos()[0].secuencial)).toContain("línea");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("de lo escrito a LA LÍNEA QUE VE DANIEL", () => {
  it("lo que quedó en el log alcanza para escribir la línea, sin adivinar nada", async () => {
    responde([CAB, ...Array.from({ length: 9 }, (_, i) => BUENO(i)), ILEGIBLE_DE_VERDAD].join("\n"));
    await syncEmpresaEgresos("vistana", 2026);

    // La corrida que acaba de terminar, tal como la leería la pantalla.
    logFilas = [
      {
        empresa_key: "vistana",
        started_at: new Date().toISOString(),
        skip_details: detallesEscritos(),
      },
    ];

    const linea = await lineaDeNoLeidos({ familias: ["egreso_vario"] });
    expect(linea).toContain("Vistana");
    expect(linea).toContain("1 renglón");
    expect(linea).toContain("120-000009999");
    expect(linea).toContain("No están sumados en el total");
  });

  it("🔴 con dos empresas, los renglones se cuentan POR EMPRESA y nunca en un solo número", async () => {
    // En Gastos las empresas se ven todas pero sus números no se juntan jamás.
    logFilas = [
      {
        empresa_key: "vistana",
        started_at: new Date().toISOString(),
        skip_details: [
          { campo: CAMPO_ILEGIBLE, secuencial: "120-1", valorCrudo: { motivo: "m", linea: 2 } },
          { campo: CAMPO_ILEGIBLE, secuencial: "120-2", valorCrudo: { motivo: "m", linea: 3 } },
        ],
      },
      {
        empresa_key: "fashion_wear",
        started_at: new Date().toISOString(),
        skip_details: [
          { campo: CAMPO_ILEGIBLE, secuencial: "130-1", valorCrudo: { motivo: "m", linea: 2 } },
        ],
      },
    ];
    const linea = (await lineaDeNoLeidos({ familias: ["egreso_vario"] })) ?? "";
    expect(linea).toContain("2 renglones");
    expect(linea).toContain("1 renglón");
    // El total juntado (3) no aparece por ningún lado.
    expect(linea).not.toContain("3 renglones");
  });

  it("CONTROL: sin descartes no se dibuja NADA", async () => {
    logFilas = [];
    expect(await lineaDeNoLeidos({ familias: ["egreso_vario"] })).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("el aviso de 🔧 SISTEMA", () => {
  const csv = [CAB, ...Array.from({ length: 9 }, (_, i) => BUENO(i)), ILEGIBLE_DE_VERDAD].join("\n");

  it("sale UNA vez, nombra el documento y dice qué pantalla mirar", async () => {
    responde(csv);
    await syncEmpresaEgresos("vistana", 2026);
    expect(enviarSistema).toHaveBeenCalledTimes(1);
    const msg = String(enviarSistema.mock.calls[0][0]);
    expect(msg).toContain("120-000009999");
    expect(msg).toContain("Gastos");
    expect(msg).toContain("Qué pasó:");
    expect(msg).toContain("Qué significa:");
    expect(msg).toContain("Qué hacer:");
  });

  it("dice cuántos SÍ entraron, para que se pueda medir el daño", async () => {
    responde(csv);
    await syncEmpresaEgresos("vistana", 2026);
    expect(String(enviarSistema.mock.calls[0][0])).toContain("9");
  });

  it("no filtra nombres de tabla ni jerga al celular de Daniel", async () => {
    responde(csv);
    await syncEmpresaEgresos("vistana", 2026);
    const msg = String(enviarSistema.mock.calls[0][0]);
    for (const jerga of ["egresos_varios", "switch_sync_log", "skip_details", "parse", "null"]) {
      expect(msg).not.toContain(jerga);
    }
  });

  it("🔴 ANTI-LOOP: el mismo renglón mañana NO vuelve a sonar", async () => {
    clavesYaAvisadasPorCampo.mockResolvedValue(["120-000009999"]);
    responde(csv);
    await syncEmpresaEgresos("vistana", 2026);
    expect(enviarSistema).not.toHaveBeenCalled();
    // …pero el descarte SÍ se sigue registrando: callar el aviso no es borrar
    // la evidencia, y la pantalla lo sigue diciendo.
    expect(detallesEscritos()).toHaveLength(1);
  });

  it("un aviso que revienta NO tumba una corrida que ya escribió bien", async () => {
    enviarSistema.mockRejectedValueOnce(new Error("telegram caído"));
    responde(csv);
    const r = await syncEmpresaEgresos("vistana", 2026);
    expect(r.ok).toBe(true);
    expect(estado()).toBe("success");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("CONTROL — un reporte SANO no inventa descartes ni ruido", () => {
  it("10 renglones buenos: sin detalle, sin skipped y sin Telegram", async () => {
    responde([CAB, ...Array.from({ length: 10 }, (_, i) => BUENO(i))].join("\n"));
    const r = await syncEmpresaEgresos("vistana", 2026);
    expect(r.ok).toBe(true);
    expect(r.renglones).toBe(10);
    expect(skipped()).toBe(0);
    expect(
      (finishSwitchSyncLog.mock.calls[0]?.[2] as { skipDetails?: unknown }).skipDetails,
    ).toBeUndefined();
    expect(enviarSistema).not.toHaveBeenCalled();
  });

  it("CONTROL: el formato NUEVO de la cuenta ya no es un descarte", async () => {
    // La 2ª ola entera: si esto se contara como ilegible, el arreglo 1 no sirve.
    responde([CAB, ILEGIBLE].join("\n"));
    const r = await syncEmpresaEgresos("vistana", 2026);
    expect(r.ok).toBe(true);
    expect(r.renglones).toBe(1);
    expect(skipped()).toBe(0);
    expect(enviarSistema).not.toHaveBeenCalled();
  });
});
