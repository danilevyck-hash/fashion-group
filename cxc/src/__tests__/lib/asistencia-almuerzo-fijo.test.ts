// ─────────────────────────────────────────────────────────────────────────────
// EL ALMUERZO ES SIEMPRE 30 MINUTOS — el candado
//
// Daniel, textual (13-ago-2026): *"todos 30 minutos de almuerzo (puedes quitar
// la opcion de elegir tiempo de almuerzo, siempre es fijo 30 mins)"*.
//
// 🔴 LO QUE SE PRUEBA ACÁ NO ES QUE EL BOTÓN DESAPARECIÓ. Esconder un control es
// cosmético: cualquiera manda un PUT con 60 y el almuerzo entra en la jornada
// con la que se valúa una ausencia, o sea en PLATA. Lo que se prueba es la
// CONDUCTA de la ruta —escribe 30 mire lo que mire el cuerpo— y que el almuerzo
// dejó de ser una perilla en las reglas del cálculo.
//
// ⚠️ Y la otra mitad: que la columna por persona SE SIGUE LEYENDO. Daniel pidió
// no borrarla, así que un horario guardado con otro valor tiene que seguir
// mandando sobre el cálculo — el que se retiró es el camino para escribirlo.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

/** Lo que la ruta le manda a la base. Es el único testigo que importa. */
const upserts: Array<Record<string, unknown>> = [];

vi.mock("@/lib/requireRole", () => ({
  requireRole: () => ({ role: "admin", userName: "test", userId: "1", sessionToken: "t" }),
}));
vi.mock("@/lib/supabase-server", () => ({
  HAS_SERVICE_ROLE: true,
  supabaseServer: {
    from: () => ({
      upsert: (fila: Record<string, unknown>) => {
        upserts.push(fila);
        return Promise.resolve({ error: null });
      },
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
    }),
  },
}));

import { PUT as putHorario } from "@/app/api/asistencia/horarios/route";
import {
  ALMUERZO_FIJO_MIN,
  REGLAS_DEFAULT,
  reglasDesdeFila,
  reglasHaciaFila,
  validarReglas,
} from "@/lib/asistencia/config";
import { ALMUERZO_DEFAULT_MIN, armarReporte, type Marcacion } from "@/lib/asistencia/reporte";

/** Un pedido a la ruta. `requireRole` está mockeado, así que no mira nada más. */
const pedido = (body: unknown) => ({ json: async () => body }) as never;

const marca = (hhmm: string): Marcacion => ({
  empleado_codigo: "6",
  empleado_nombre: null,
  ocurrio_en: `2026-07-13T${hhmm}:00-05:00`,
});

/** Un día con 4 marcas y UNA HORA de almuerzo tomada (12:00 → 13:00). */
const diaConUnaHoraDeAlmuerzo = (horarios: Array<Record<string, unknown>>) =>
  armarReporte({
    marcaciones: [marca("08:00"), marca("12:00"), marca("13:00"), marca("17:00")],
    horarios: horarios as never,
    justificaciones: [],
    feriados: new Map(),
    desde: "2026-07-13",
    hasta: "2026-07-13",
  })[0].dias[0];

beforeEach(() => {
  upserts.length = 0;
});

// ─────────────────────────────────────────────────────────────────────────────
describe("una sola fuente: 30 minutos", () => {
  it("el número vive en UN lugar y vale 30", () => {
    expect(ALMUERZO_FIJO_MIN).toBe(30);
    // El motor del reporte lo re-exporta, no lo vuelve a escribir.
    expect(ALMUERZO_DEFAULT_MIN).toBe(ALMUERZO_FIJO_MIN);
  });

  it("🔴 dejó de ser una regla configurable: no está en las reglas del cálculo", () => {
    expect("almuerzoDefaultMin" in REGLAS_DEFAULT).toBe(false);
    expect(Object.keys(reglasHaciaFila(REGLAS_DEFAULT))).not.toContain("almuerzo_default_min");
  });

  it("un cuerpo SIN el campo se guarda igual — el formulario ya no lo manda", () => {
    const cuerpo: Record<string, unknown> = {
      toleranciaTardanzaMin: "10", extraMinimoMin: "15",
      recargoExtraDiurno: "1.25", recargoExtraNocturno: "1.5",
      horaCorteNocturno: "18:00", recargoDomingoFeriado: "1.5",
      divisor40: "173.33", divisor48: "208",
      seguroSocialPct: "9.75", seguroEducativoPct: "1.25",
      excedenteHorasDia: "3", recargoExcedenteNocturnaMixta: "2.625",
    };
    const r = validarReglas(cuerpo);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect("almuerzoDefaultMin" in r.valor).toBe(false);
  });

  it("🔴 mandarlo a mano NO lo devuelve: se ignora, no se guarda", () => {
    const r = validarReglas({
      toleranciaTardanzaMin: "10", extraMinimoMin: "15", almuerzoDefaultMin: "60",
      recargoExtraDiurno: "1.25", recargoExtraNocturno: "1.5",
      horaCorteNocturno: "18:00", recargoDomingoFeriado: "1.5",
      divisor40: "173.33", divisor48: "208",
      seguroSocialPct: "9.75", seguroEducativoPct: "1.25",
      excedenteHorasDia: "3", recargoExcedenteNocturnaMixta: "2.625",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect("almuerzoDefaultMin" in r.valor).toBe(false);
  });

  it("🩸 una fila vieja de la base con otro valor NO se lee: la columna quedó muda", () => {
    // La columna sigue existiendo en `asistencia_reglas` (borrarla es
    // irreversible y no compra nada), pero ya no manda sobre nada.
    const reglas = reglasDesdeFila({ almuerzo_default_min: 60 });
    expect("almuerzoDefaultMin" in reglas).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("el cálculo, que es lo que se paga", () => {
  it("sin horario propio el almuerzo son 30 minutos", () => {
    // 60 tomados − 30 programados = 30 de exceso.
    expect(diaConUnaHoraDeAlmuerzo([]).excesoAlmuerzoMin).toBe(30);
  });

  it("mandar `almuerzoDefaultMin` por reglas ya no cambia el resultado", () => {
    const conRegla = armarReporte({
      marcaciones: [marca("08:00"), marca("12:00"), marca("13:00"), marca("17:00")],
      horarios: [], justificaciones: [], feriados: new Map(),
      desde: "2026-07-13", hasta: "2026-07-13",
      reglas: { almuerzoDefaultMin: 60 } as never,
    })[0].dias[0];
    expect(conRegla.excesoAlmuerzoMin).toBe(30);
  });

  it("⚠️ la columna POR PERSONA se sigue leyendo — Daniel pidió no borrarla", () => {
    const dia = diaConUnaHoraDeAlmuerzo([
      { empleado_codigo: "6", entrada: "08:00", salida: "17:00", almuerzo_minutos: 60 },
    ]);
    expect(dia.excesoAlmuerzoMin).toBe(0); // 60 tomados − 60 guardados
  });

  it("con los 30 que tienen las 33 personas reales, el resultado es el mismo de siempre", () => {
    const dia = diaConUnaHoraDeAlmuerzo([
      { empleado_codigo: "6", entrada: "08:00", salida: "17:00", almuerzo_minutos: 30 },
    ]);
    expect(dia.excesoAlmuerzoMin).toBe(30);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 EL CANDADO: la ruta escribe 30, mire lo que mire el cuerpo", () => {
  it("guarda 30 cuando el cuerpo NO trae almuerzo", async () => {
    const res = await putHorario(pedido({ codigo: "6", nombre: "Ángela", salida: "16:30" }));
    expect(res.status).toBe(200);
    expect(upserts).toHaveLength(1);
    expect(upserts[0].almuerzo_minutos).toBe(30);
    expect(upserts[0].salida).toBe("16:30");
  });

  it("🩸 guarda 30 AUNQUE el cuerpo pida 60 — esconder el botón no alcanzaba", async () => {
    const res = await putHorario(
      pedido({ codigo: "6", nombre: "Ángela", salida: "17:00", almuerzoMinutos: 60 }),
    );
    expect(res.status).toBe(200);
    expect(upserts[0].almuerzo_minutos).toBe(30);
  });

  it("tampoco entra un valor absurdo por la puerta de atrás", async () => {
    for (const intento of [0, -5, 240, 999, "60", null]) {
      upserts.length = 0;
      await putHorario(pedido({ codigo: "6", salida: "17:00", almuerzoMinutos: intento }));
      expect(upserts[0].almuerzo_minutos).toBe(30);
    }
  });

  it("lo que SÍ sigue validando es la hora de salida", async () => {
    const res = await putHorario(pedido({ codigo: "6", salida: "no es una hora" }));
    expect(res.status).toBe(400);
    expect(upserts).toHaveLength(0);
  });
});
