/* 🔴 El aviso del reloj no suena en feriados ni fines de semana (11-nov-2026).
 * Daniel: «esos días [feriados] el aviso no me debería de llegar, que hace ruido» → «3. A».
 * Regla: hoy hábil del reloj + al menos UN día hábil COMPLETO sin leer. */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  VIGIA_SOLO_DIAS_HABILES,
  vigiaDebeAlertar,
  vigiaDebeAlertarEnDiasHabiles,
  type CalendarioDelReloj,
} from "@/lib/asistencia/agente";
import { diasLaborablesDeEmpresa } from "@/lib/asistencia/horario-configurable";

/** Hora de Panamá (UTC−5 fijo) → ms. */
const pa = (fecha: string, hora: string) => Date.parse(`${fecha}T${hora}:00-05:00`);
const iso = (fecha: string, hora: string) => new Date(pa(fecha, hora)).toISOString();
const BOSTON = diasLaborablesDeEmpresa("confecciones_boston");
const ACS = diasLaborablesDeEmpresa("american_classic");
const cal = (dias: readonly number[], feriados: string[] = []): CalendarioDelReloj => ({ dias, feriados: new Set(feriados) });
const fila = (leido: string) => ({ dispositivo: "reloj cboston", leido_ok_en: leido });

describe("vigía: solo días hábiles", () => {
  it("el interruptor está prendido", () => expect(VIGIA_SOLO_DIAS_HABILES).toBe(true));

  it("hoy feriado (martes 10-nov-2026): no avisa, aunque el lunes 9 entero estuvo mudo", () => {
    const f = fila(iso("2026-11-06", "17:00"));
    expect(vigiaDebeAlertarEnDiasHabiles(f, pa("2026-11-10", "10:00"), cal(BOSTON, ["2026-11-10"]))).toBe(false);
    expect(vigiaDebeAlertarEnDiasHabiles(f, pa("2026-11-10", "10:00"), cal(BOSTON))).toBe(true);
  });

  it("mudo desde el 2-nov 16:35 con 3, 5 y 10 feriados: el 4 aún no está completo, avisa el 6", () => {
    const f = fila(iso("2026-11-02", "16:35"));
    const c = cal(BOSTON, ["2026-11-03", "2026-11-05", "2026-11-10"]);
    expect(vigiaDebeAlertarEnDiasHabiles(f, pa("2026-11-04", "17:15"), c)).toBe(false);
    expect(vigiaDebeAlertarEnDiasHabiles(f, pa("2026-11-05", "10:00"), c)).toBe(false);
    expect(vigiaDebeAlertarEnDiasHabiles(f, pa("2026-11-06", "10:00"), c)).toBe(true);
  });

  it("Multifashion: el sábado mudo cuenta; Boston: el sábado no", () => {
    const f = fila(iso("2026-11-06", "18:00"));
    expect(vigiaDebeAlertarEnDiasHabiles(f, pa("2026-11-09", "10:00"), cal(ACS))).toBe(true);
    expect(vigiaDebeAlertarEnDiasHabiles(f, pa("2026-11-09", "10:00"), cal(BOSTON))).toBe(false);
    expect(vigiaDebeAlertarEnDiasHabiles(f, pa("2026-11-10", "10:00"), cal(BOSTON))).toBe(true);
  });

  it("el anti-repetición sigue: 2 h entre avisos", () => {
    const f = { ...fila(iso("2026-11-06", "17:00")), alertado_en: iso("2026-11-10", "09:00") };
    expect(vigiaDebeAlertarEnDiasHabiles(f, pa("2026-11-10", "10:00"), cal(BOSTON))).toBe(false);
    expect(vigiaDebeAlertarEnDiasHabiles(f, pa("2026-11-10", "15:00"), cal(BOSTON))).toBe(true);
  });

  it("interruptor apagado = las 24 horas de antes (sí avisaba en el feriado)", () => {
    const f = fila(iso("2026-11-06", "17:00"));
    expect(vigiaDebeAlertar(f, pa("2026-11-10", "10:00"))).toBe(true);
    const cron = fs.readFileSync(path.resolve(__dirname, "../../app/api/cron/asistencia-vigia/route.ts"), "utf8");
    expect(cron).toMatch(/if \(VIGIA_SOLO_DIAS_HABILES\)/);
    expect(cron).toMatch(/: vigiaDebeAlertar\(f, ahora, HORAS_PARA_VIGIA\)/);
  });
});
