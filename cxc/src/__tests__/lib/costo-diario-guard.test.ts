/**
 * CANDADO — un costo IMPOSIBLE de Switch no se escribe, se avisa, y no arrastra
 * al resto del mes.
 *
 * Contexto (27-jul-2026): la certificación encontró en `switch_costo_diario` la
 * fila `confecciones_boston · 2026-07-14 · costo_total = $1,000,000,049.22`
 * contra una venta de $493.00. Viene tal cual de Switch (se pidió el reporte en
 * vivo) y `syncCostoDiario` no tenía NINGÚN guard: escribía lo que le dieran.
 *
 * Las cuatro reglas que se fijan acá:
 *   1. Un valor imposible se RECHAZA (no se escribe) y se AVISA.
 *   2. Un valor alto pero legítimo PASA — el umbral distingue "grande" de
 *      "imposible", y un mes fuerte no puede quedar bloqueado.
 *   3. Una fila mala NO tumba el sync: los demás días del mes se guardan igual.
 *   4. El aviso NO se repite en loop. El reporte trae el mes entero todos los
 *      días, así que un día mal cargado vuelve a llegar en cada corrida.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  umbralCostoDiario,
  esCostoDiarioImposible,
  fechasPorAvisar,
  COSTO_DIARIO_PISO,
  COSTO_DIARIO_FACTOR,
  COSTO_DIARIO_TECHO_HISTORIA,
} from "@/lib/switch-api/costo-guard";

// ═══════════════════════════════════════════════════════════════════════════
//   PARTE 1 — el umbral, como función pura
// ═══════════════════════════════════════════════════════════════════════════

describe("umbralCostoDiario", () => {
  it("sin historia (empresa nueva) cae en el piso absoluto", () => {
    expect(umbralCostoDiario([])).toBe(COSTO_DIARIO_PISO);
  });

  it("con historia chica sigue mandando el piso (no se vuelve agresivo)", () => {
    // confecciones_boston, medido: su día más caro real es ~$32,148.80.
    expect(umbralCostoDiario([210.37, 3245.23, 32_148.8])).toBe(COSTO_DIARIO_PISO);
  });

  it("con historia grande el umbral SUBE con la empresa (envejece bien)", () => {
    // active_wear, medido: récord real $141,707.12 → 20× = $2,834,142.40.
    const u = umbralCostoDiario([1900.8, 40_648.06, 141_707.12]);
    expect(u).toBeCloseTo(COSTO_DIARIO_FACTOR * 141_707.12, 6);
    expect(u).toBeGreaterThan(COSTO_DIARIO_PISO);
  });

  it("una fila ENVENENADA no puede levantar el umbral por encima de sí misma", () => {
    // Si la fila de mil millones contara como historia, 20× ella misma la
    // dejaría pasar para siempre y el guard quedaría desarmado.
    const conVeneno = umbralCostoDiario([32_148.8, 1_000_000_049.22]);
    expect(conVeneno).toBe(COSTO_DIARIO_PISO);
    expect(esCostoDiarioImposible(1_000_000_049.22, conVeneno)).toBe(true);
  });

  it("mide MAGNITUD: un histórico negativo (mes de devoluciones) cuenta igual", () => {
    expect(umbralCostoDiario([-141_707.12])).toBeCloseTo(COSTO_DIARIO_FACTOR * 141_707.12, 6);
  });

  it("ignora basura no numérica sin volverse NaN", () => {
    expect(umbralCostoDiario([NaN, Infinity, 141_707.12])).toBeCloseTo(
      COSTO_DIARIO_FACTOR * 141_707.12,
      6,
    );
  });

  it("el techo de historia deja fuera exactamente lo que dice", () => {
    expect(umbralCostoDiario([COSTO_DIARIO_TECHO_HISTORIA])).toBe(COSTO_DIARIO_PISO);
    expect(umbralCostoDiario([COSTO_DIARIO_TECHO_HISTORIA - 1])).toBeGreaterThan(COSTO_DIARIO_PISO);
  });
});

describe("esCostoDiarioImposible", () => {
  const umbralBoston = umbralCostoDiario([210.37, 3245.23, 32_148.8]);

  it("RECHAZA la fila real del incidente (boston, 14-jul-2026)", () => {
    expect(esCostoDiarioImposible(1_000_000_049.22, umbralBoston)).toBe(true);
  });

  it("DEJA PASAR todos los días reales medidos en producción", () => {
    // Los 15 costos diarios más altos de las 736 filas de la tabla (may-jul 2026),
    // cada uno contra el umbral de SU empresa. Ninguno puede quedar bloqueado.
    const casos: Array<[nombre: string, costo: number, historia: number[]]> = [
      ["active_wear 13-may", 141_707.12, [1900.8, 40_648.06]],
      ["fashion_wear 08-may", 89_124.13, [80.48, 26_283.49, 55_951.41]],
      ["active_shoes 09-jun", 82_240.23, [148.93, 26_355.31]],
      ["vistana 08-may", 48_102.82, [27.01, 14_222.82, 38_386.26]],
      ["fashion_shoes 21-may", 42_014.1, [11_098.37, 31_896.68]],
      ["confecciones_boston 10-jul", 32_148.8, [210.37, 3245.23]],
      ["american_classic pico", 9064.03, [942.43, 1826.32, 3659.41]],
      ["joystep pico", 4756.3, [0, 0, 3017.31]],
    ];
    for (const [nombre, costo, historia] of casos) {
      expect(esCostoDiarioImposible(costo, umbralCostoDiario(historia)), nombre).toBe(false);
    }
  });

  it("deja pasar un mes EXCEPCIONAL: 5× el récord del grupo entero", () => {
    // $700k de costo en UN día para UNA empresa — nunca pasó, pero es negocio
    // posible. Un guard que lo bloquee descarta datos buenos, que es peor.
    expect(esCostoDiarioImposible(700_000, umbralCostoDiario([]))).toBe(false);
  });

  it("un costo negativo imposible también se rechaza (día de devoluciones)", () => {
    expect(esCostoDiarioImposible(-1_000_000_049.22, umbralBoston)).toBe(true);
    expect(esCostoDiarioImposible(-25_000, umbralBoston)).toBe(false);
  });

  it("el borde exacto NO se rechaza (mayor estricto)", () => {
    expect(esCostoDiarioImposible(COSTO_DIARIO_PISO, COSTO_DIARIO_PISO)).toBe(false);
    expect(esCostoDiarioImposible(COSTO_DIARIO_PISO + 0.01, COSTO_DIARIO_PISO)).toBe(true);
  });

  it("un valor no finito se trata como imposible", () => {
    expect(esCostoDiarioImposible(NaN, umbralBoston)).toBe(true);
    expect(esCostoDiarioImposible(Infinity, umbralBoston)).toBe(true);
  });
});

describe("fechasPorAvisar (anti-loop)", () => {
  it("avisa por una fecha nueva", () => {
    expect(fechasPorAvisar(["2026-07-14"], [])).toEqual(["2026-07-14"]);
  });

  it("NO repite una fecha ya avisada", () => {
    expect(fechasPorAvisar(["2026-07-14"], ["2026-07-14"])).toEqual([]);
  });

  it("avisa solo por lo nuevo cuando el dato viejo sigue llegando", () => {
    expect(fechasPorAvisar(["2026-07-14", "2026-07-20"], ["2026-07-14"])).toEqual(["2026-07-20"]);
  });

  it("no duplica dentro de la misma corrida", () => {
    expect(fechasPorAvisar(["2026-07-14", "2026-07-14"], [])).toEqual(["2026-07-14"]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//   PARTE 2 — syncCostoDiario de punta a punta, con dobles
// ═══════════════════════════════════════════════════════════════════════════

interface FilaCosto {
  fecha: string;
  costo_total: number;
}

/** Lo que el reporte de Switch devuelve en esta corrida. */
let reporte: Record<string, { total: string; costo: string; utilidad: string; etiqueta: number; fecha: string }> = {};
/** Historia ya guardada de la empresa (lo que lee el calibrador del umbral). */
let historiaGuardada: FilaCosto[] = [];
/** skip_details de corridas anteriores (lo que lee el anti-loop). */
let corridasPrevias: Array<{ id: string; skip_details: unknown }> = [];
/** Filas que el sync efectivamente mandó a escribir. */
let upserted: Array<{ fecha: string; costo_total: number }> = [];
/** Estado final del switch_sync_log. */
let logFinal: Record<string, unknown> = {};
/** Mensajes que salieron al canal de sistema. */
const avisos: string[] = [];

vi.mock("@/lib/supabase-server", () => {
  const from = (tabla: string) => {
    const c: Record<string, unknown> = {};
    Object.assign(c, {
      select: () => c,
      eq: () => c,
      gte: () => c,
      lt: () => c,
      in: () => c,
      order: () => c,
      insert: () => ({
        select: () => ({ single: async () => ({ data: { id: "log-actual" }, error: null }) }),
      }),
      update: (patch: Record<string, unknown>) => {
        if (tabla === "switch_sync_log") logFinal = { ...logFinal, ...patch };
        return { eq: async () => ({ error: null }) };
      },
      upsert: async (filas: Array<{ fecha: string; costo_total: number }>) => {
        upserted.push(...filas);
        return { error: null };
      },
      // La lectura se resuelve con await sobre la cadena (thenable).
      then: (resolve: (v: unknown) => void) => {
        if (tabla === "switch_costo_diario") return resolve({ data: historiaGuardada, error: null });
        if (tabla === "switch_sync_log") return resolve({ data: corridasPrevias, error: null });
        return resolve({ data: [], error: null });
      },
    });
    return c;
  };
  return { supabaseServer: { from } };
});

vi.mock("@/lib/switch-api/client", () => ({
  createSwitchClient: () => ({
    getReporteMesActual: async () => ({ totales: reporte }),
  }),
  SwitchApiError: class extends Error {},
}));

vi.mock("@/lib/alertas/canal", () => ({
  enviarSistema: async (texto: string) => {
    avisos.push(texto);
    return true;
  },
}));

vi.mock("@/lib/switch-api/sync-log", () => ({ clearStaleRunning: async () => {} }));

const { syncCostoDiario } = await import("@/lib/switch-api/sync-empresa");

const dia = (fecha: string, costo: number, venta: number) => ({
  total: String(venta),
  costo: String(costo),
  utilidad: String(venta - costo),
  etiqueta: 1,
  fecha,
});

beforeEach(() => {
  reporte = {};
  historiaGuardada = [];
  corridasPrevias = [];
  upserted = [];
  logFinal = {};
  avisos.length = 0;
});

describe("syncCostoDiario — el guard en el sync real", () => {
  it("un valor imposible se rechaza, NO se escribe, y se avisa", async () => {
    // El reporte real de boston del 27-jul, reducido a lo que importa.
    reporte = {
      "1": dia("13-07-2026", 1500.0, 2100.0),
      "2": dia("14-07-2026", 1_000_000_049.22, 493.0),
      "3": dia("15-07-2026", 2800.5, 4000.0),
    };
    historiaGuardada = [{ fecha: "2026-06-10", costo_total: 32_148.8 }];

    const r = await syncCostoDiario("confecciones_boston", "cron");

    // No se escribió el día malo…
    expect(upserted.map((f) => f.fecha)).toEqual(["2026-07-13", "2026-07-15"]);
    expect(upserted.some((f) => f.costo_total > 1_000_000)).toBe(false);
    // …y SÍ se avisó.
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toContain("2026-07-14");
    expect(avisos[0]).toContain("Confecciones Boston");
    expect(r.dias).toBe(2);
  });

  it("una fila mala NO tumba el sync de los demás días", async () => {
    reporte = {
      "1": dia("01-07-2026", 1000, 1500),
      "2": dia("02-07-2026", 1_000_000_049.22, 493),
      "3": dia("03-07-2026", 2000, 2500),
      "4": dia("04-07-2026", 3000, 4000),
    };
    const r = await syncCostoDiario("confecciones_boston", "cron");
    expect(upserted).toHaveLength(3);
    expect(r.dias).toBe(3);
    expect(logFinal.status).toBe("success"); // la corrida no se marca error
    expect(logFinal.records_skipped).toBe(1);
  });

  it("un día alto pero legítimo se guarda igual (no hay falso positivo)", async () => {
    // El día real más caro del grupo: active_wear, 13-may-2026.
    reporte = { "1": dia("13-05-2026", 141_707.12, 181_650.0) };
    const r = await syncCostoDiario("active_wear", "cron");
    expect(upserted).toEqual([expect.objectContaining({ costo_total: 141_707.12 })]);
    expect(avisos).toHaveLength(0);
    expect(r.dias).toBe(1);
  });

  it("el aviso NO se repite si el dato malo sigue llegando todos los días", async () => {
    reporte = { "1": dia("14-07-2026", 1_000_000_049.22, 493) };
    // La corrida de ayer ya lo descartó y lo avisó.
    corridasPrevias = [
      {
        id: "log-de-ayer",
        skip_details: [{ facturaId: null, secuencial: "2026-07-14", campo: "costo_imposible", valorCrudo: {} }],
      },
    ];
    await syncCostoDiario("confecciones_boston", "cron");
    expect(upserted).toHaveLength(0); // se sigue rechazando, siempre
    expect(avisos).toHaveLength(0); // pero ya no se avisa
  });

  it("un día malo NUEVO sí vuelve a avisar aunque el viejo siga llegando", async () => {
    reporte = {
      "1": dia("14-07-2026", 1_000_000_049.22, 493),
      "2": dia("21-07-2026", 5_000_000_000, 800),
    };
    corridasPrevias = [
      {
        id: "log-de-ayer",
        skip_details: [{ facturaId: null, secuencial: "2026-07-14", campo: "costo_imposible", valorCrudo: {} }],
      },
    ];
    await syncCostoDiario("confecciones_boston", "cron");
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toContain("2026-07-21");
    expect(avisos[0]).not.toContain("2026-07-14");
  });

  it("el descarte queda REGISTRADO en el log, no en silencio", async () => {
    reporte = { "1": dia("14-07-2026", 1_000_000_049.22, 493) };
    await syncCostoDiario("confecciones_boston", "cron");
    const detalles = logFinal.skip_details as Array<{ campo: string; secuencial: string }>;
    expect(detalles).toHaveLength(1);
    expect(detalles[0].campo).toBe("costo_imposible");
    expect(detalles[0].secuencial).toBe("2026-07-14");
  });

  it("si el aviso a Telegram falla, la corrida sigue siendo success", async () => {
    const canal = await import("@/lib/alertas/canal");
    const spy = vi.spyOn(canal, "enviarSistema").mockRejectedValueOnce(new Error("Telegram caído"));
    reporte = {
      "1": dia("14-07-2026", 1_000_000_049.22, 493),
      "2": dia("15-07-2026", 2000, 3000),
    };
    const r = await syncCostoDiario("confecciones_boston", "cron");
    expect(r.dias).toBe(1);
    expect(logFinal.status).toBe("success");
    spy.mockRestore();
  });
});
