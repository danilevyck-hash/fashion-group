// 🔴 CANDADO — el aviso del reloj solo dentro del horario de la PC (29-sep-2026).
// 🩸 A las 6:20 p.m. salía en ámbar «Reloj de Multifashion y Reloj de Boston sin
// señal hace 1 hora»: Multifashion abre hasta las 18:30, pero la PC que empuja
// las marcas de los dos cierra con la oficina (lun–vie 08:00–17:00).
import { describe, it, expect } from "vitest";
import { apagadoPorHorarioConLaPc, textoRelojApagadoConLaPc } from "@/lib/asistencia/reloj-horario-de-la-pc";
import type { RelojParaElHorario } from "@/lib/asistencia/reloj-fuera-de-horario";

const BOSTON = "reloj cboston";
const ACS = "reloj acs";
/** Hora de Panamá (UTC−5) → ms. */
const pa = (s: string) => Date.parse(`${s}-05:00`);
const callado = (dispositivo: string, visto: string): RelojParaElHorario =>
  ({ dispositivo, salud: "callado", vistoEn: new Date(pa(visto)).toISOString() });

describe("el reloj callado fuera del horario de la PC no avisa", () => {
  it("🩸 martes 18:20, los dos callados desde las 17:20 → gris, sin ámbar", () => {
    const ahora = pa("2026-09-29T18:20:00");
    const relojes = [callado(ACS, "2026-09-29T17:20:00"), callado(BOSTON, "2026-09-29T17:20:00")];
    expect(apagadoPorHorarioConLaPc(relojes[0], ahora)).toBe(true);
    expect(textoRelojApagadoConLaPc(relojes, ahora)).toBe("Relojes apagados · última lectura hoy 17:20");
  });

  it("sábado a mediodía, con la última lectura del viernes → gris", () => {
    const ahora = pa("2026-10-03T12:00:00");
    expect(textoRelojApagadoConLaPc([callado(ACS, "2026-10-02T16:50:00")], ahora)).toBe("Reloj apagado · última lectura ayer 16:50");
  });

  it("🔴 en horario de la oficina, callado → ámbar (null = manda lo de siempre)", () => {
    const ahora = pa("2026-09-29T11:00:00");
    expect(textoRelojApagadoConLaPc([callado(ACS, "2026-09-29T09:30:00"), callado(BOSTON, "2026-09-29T09:30:00")], ahora)).toBeNull();
  });

  it("🔴 una lectura más vieja que el último día hábil avisa a cualquier hora", () => {
    const ahora = pa("2026-09-29T20:00:00");
    expect(textoRelojApagadoConLaPc([callado(BOSTON, "2026-09-25T16:00:00")], ahora)).toBeNull();
  });

  it("🔴 un error del reloj nunca se calla", () => {
    const ahora = pa("2026-09-29T20:00:00");
    const conError: RelojParaElHorario = { dispositivo: BOSTON, salud: "con_error", vistoEn: new Date(pa("2026-09-29T19:59:00")).toISOString() };
    expect(textoRelojApagadoConLaPc([conError], ahora)).toBeNull();
  });

  it("uno apagado y otro al día → nombra solo al apagado", () => {
    const ahora = pa("2026-09-29T18:20:00");
    const alDia: RelojParaElHorario = { dispositivo: BOSTON, salud: "al_dia", minutosSinNoticias: 2 };
    expect(textoRelojApagadoConLaPc([callado(ACS, "2026-09-29T17:20:00"), alDia], ahora))
      .toMatch(/apagado · última lectura hoy 17:20$/);
  });
});
