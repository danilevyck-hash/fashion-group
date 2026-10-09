// ─────────────────────────────────────────────────────────────────────────────
// 🔴 COMPENSACIÓN DE TARDANZA APAGADA = LA PLANILLA DE HOY, CON UN MES REAL
//
// El fixture son las 3.320 marcas reales de septiembre de 2026 (código +
// instante; sin nombres ni sueldos) y lo que daba el motor de `origin/main`
// ANTES de este cambio, día por día y en plata (ficha de prueba $600 / 48 h).
// Con la casilla apagada —ausente, vacía, o prendida a alguien que no está—
// todo tiene que salir IDÉNTICO. Lo generó `scripts/_medir-repone-tardanza.ts`.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { armarReporte, type HorarioPersona, type Marcacion } from "@/lib/asistencia/reporte";
import { armarLinea, jornadaDiariaMin, medirHoras, MANUALES_CERO } from "@/lib/asistencia/planilla";
import type { ReglasAsistencia } from "@/lib/asistencia/config";

const F = JSON.parse(readFileSync(join(__dirname, "..", "fixtures", "asistencia-mes-real-2026-09.json"), "utf8")) as {
  desde: string; hasta: string; reglas: ReglasAsistencia; horarios: HorarioPersona[];
  feriados: [string, string][]; diasLaborables: [string, number[]][];
  marcaciones: [string, string, string | null][];
  esperado: [string, (string | number)[][]][];
  dineroEsperado: [string, number[]][];
};
const horarioDe = new Map(F.horarios.map((h) => [h.empleado_codigo, h]));

function correr(reponeTardanza?: ReadonlySet<string>) {
  return armarReporte({
    marcaciones: F.marcaciones.map(([c, t, d]): Marcacion => ({ empleado_codigo: c, empleado_nombre: null, ocurrio_en: t, dispositivo: d })),
    horarios: F.horarios, justificaciones: [], feriados: new Map(F.feriados),
    desde: F.desde, hasta: F.hasta, reglas: F.reglas, incluirNoHabiles: true, diaEnCurso: null,
    diasLaborables: new Map(F.diasLaborables),
    ...(reponeTardanza ? { reponeTardanza } : {}),
  });
}
const minutos = (r: ReturnType<typeof correr>) =>
  r.map((p) => [p.codigo, p.dias.map((d) => [d.fecha, d.tardeMin, d.extraMin, d.salidaTempranaMin, d.excesoAlmuerzoMin, d.trabajadoMin])]);
const plata = (r: ReturnType<typeof correr>) => r.map((p) => {
  const d = armarLinea({ codigo: p.codigo, nombre: null, salarioMensual: 600, jornadaSemanal: 48, empresa: "boston" },
    medirHoras(p, F.reglas, jornadaDiariaMin(horarioDe.get(p.codigo))), MANUALES_CERO, F.reglas).dinero!;
  return [p.codigo, [d.tardanzas, d.ausencias, d.extraDiurno, d.extraNocturno, d.salidaTemprana, d.netoPagar]];
});

describe("🔴 septiembre de 2026 real, con la casilla apagada, da lo de hoy al centavo", () => {
  it("el fixture tiene el mes entero", () => {
    expect(F.marcaciones.length).toBe(3320);
    expect(F.esperado.length).toBeGreaterThan(40);
  });

  for (const [nombre, set] of [
    ["sin el parámetro", undefined],
    ["con el conjunto vacío", new Set<string>()],
    ["prendida a un código que no marcó", new Set(["no-existe"])],
  ] as const) {
    it(`${nombre}: minutos día por día y plata por colaborador idénticos`, () => {
      const r = correr(set);
      expect(minutos(r)).toEqual(F.esperado);
      expect(plata(r)).toEqual(F.dineroEsperado);
    });
  }

  it("prendida a todos, nadie gana tardanza ni extra: solo baja (control de dirección)", () => {
    const todos = correr(new Set(F.esperado.map(([c]) => c)));
    const viejo = new Map(F.esperado);
    let cambian = 0;
    for (const p of todos) {
      p.dias.forEach((d, i) => {
        const [, tarde, extra] = viejo.get(p.codigo)![i] as [string, number, number];
        expect(d.tardeMin).toBeLessThanOrEqual(tarde);
        expect(d.extraMin).toBeLessThanOrEqual(extra);
        if (d.tardeMin !== tarde || d.extraMin !== extra) cambian++;
      });
    }
    expect(cambian).toBeGreaterThan(0);
  });
});
