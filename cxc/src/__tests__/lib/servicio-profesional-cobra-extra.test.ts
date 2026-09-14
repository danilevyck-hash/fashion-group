/* ─────────────────────────────────────────────────────────────────────────────
 * EL SERVICIO PROFESIONAL COBRA HORAS EXTRA — SALVO POR LA CASILLA DE SU FICHA.
 * (14-sep-2026)
 *
 * Daniel, textual: *«los servicios profesionales de fashion wear sí llevan
 * horas extras»* y *«solo yulissa no cobra, todos los demás sí. Ella es la
 * única excepción hoy y siempre»*.
 *
 * ── LA REGLA ─────────────────────────────────────────────────────────────────
 * Lo ÚNICO que apaga las horas extra de una persona es la casilla «¿Cobra horas
 * extra?» de su ficha (`cobra_horas_extra = false`). Ser servicio profesional
 * ya no las apaga por su cuenta — hasta el 14-sep el motor decía
 * `sinRecargos = fueraDePlanilla || noCobraExtra`, una regla escondida que se
 * llevaba a TODOS los servicios profesionales por delante.
 *
 * ── POR QUÉ ──────────────────────────────────────────────────────────────────
 * El 3-sep Daniel dijo de Yulissa *«es solo para ver sus tardanzas y
 * ausencias»* y eso se escribió como regla del motor para el servicio
 * profesional entero. Era cierto para ELLA, y lo sigue siendo: su ficha (26)
 * tiene la casilla en NO. La excepción vive en la ficha, no en el motor.
 *
 * ── LO QUE NO CAMBIA ─────────────────────────────────────────────────────────
 * El servicio profesional sigue SIN `dinero` (sin quincenal, sin seguros, sin
 * neto): se le MIDEN las horas extra y quien le paga por fuera decide cuánto
 * valen. Por eso `extraMedido.monto` es `null` — no se inventa una rata.
 *
 * Fechas fijas, nunca `new Date()`.
 * ─────────────────────────────────────────────────────────────────────────── */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

import { REGLAS_DEFAULT } from "@/lib/asistencia/config";
import {
  armarLinea, HORAS_CERO, MANUALES_CERO, type FichaPlanilla, type HorasPersona,
} from "@/lib/asistencia/planilla";
import { cuentaHorasExtra, extraQueCuenta, type PersonaReporte } from "@/lib/asistencia/reporte";

const RAIZ = path.resolve(__dirname, "../../..");
const leer = (p: string) => fs.readFileSync(path.join(RAIZ, p), "utf8");
const puro = (p: string) =>
  leer(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const R = REGLAS_DEFAULT;
const HORAS: HorasPersona = {
  ...HORAS_CERO,
  jornadaDiariaMin: 480,
  extraDiurnoMin: 90, extraNocturnoMin: 30, domingoMin: 240, feriadoMin: 60, excedenteMin: 15,
  tardanzaMin: 12, ausenciaMin: 480, ausenciaDias: 1, diasTrabajados: 9,
};
const linea = (f: Partial<FichaPlanilla>) =>
  armarLinea(
    {
      codigo: "52", nombre: "DANIEL LEVY", salarioMensual: null, jornadaSemanal: 40,
      empresa: "vistana", ...f,
    },
    HORAS, MANUALES_CERO, R,
  );

describe("1. en el motor, lo decide la casilla y solo la casilla", () => {
  it("🔴 servicio profesional con la casilla en SÍ (el default): las horas extra VIAJAN, sin dinero", () => {
    const l = linea({ servicioProfesional: true });
    expect(l.fueraDePlanilla).toBe(true);
    expect(l.dinero).toBeNull();
    expect(l.cobraHorasExtra).toBe(true);
    expect(l.horas.extraDiurnoMin).toBe(90);
    expect(l.horas.extraNocturnoMin).toBe(30);
    expect(l.horas.domingoMin).toBe(240);
    expect(l.horas.feriadoMin).toBe(60);
    expect(l.horas.excedenteMin).toBe(15);
    expect(l.extraMedido).not.toBeNull();
    expect(l.extraMedido!.minutos).toBe(120);
    // 🔑 Sin rata no hay monto: el sistema no inventa cuánto vale su hora.
    expect(l.extraMedido!.monto).toBeNull();
  });

  it("🔴 Yulissa: servicio profesional con la casilla en NO — igual que el 3-sep, todo en cero", () => {
    const y = linea({ codigo: "26", nombre: "YULISSA JUAREZ", servicioProfesional: true, cobraHorasExtra: false });
    expect(y.fueraDePlanilla).toBe(true);
    expect(y.dinero).toBeNull();
    expect(y.cobraHorasExtra).toBe(false);
    for (const campo of ["extraDiurnoMin", "extraNocturnoMin", "domingoMin", "feriadoMin", "excedenteMin"] as const) {
      expect(y.horas[campo], campo).toBe(0);
    }
    expect(y.extraMedido).toBeNull();
    expect(y.extraNoAprobada).toBeNull();
    // Tardanzas y ausencias, intactas: es la mitad que Daniel quiere ver de ella.
    expect(y.horas.tardanzaMin).toBe(12);
    expect(y.horas.ausenciaDias).toBe(1);
  });

  it("CONTROL: quien va en planilla con la casilla en NO tampoco cobra extras (10-sep, no cambió)", () => {
    const n = linea({ salarioMensual: 1000, servicioProfesional: false, cobraHorasExtra: false });
    expect(n.dinero).not.toBeNull();
    expect(n.horas.extraDiurnoMin).toBe(0);
    expect(n.dinero!.extraDiurno).toBe(0);
    expect(n.extraMedido).toBeNull();
  });

  it("CONTROL: quien va en planilla con la casilla en SÍ cobra sus extras con rata (no cambió)", () => {
    const n = linea({ salarioMensual: 1000, servicioProfesional: false });
    expect(n.dinero).not.toBeNull();
    expect(n.dinero!.extraDiurno).toBeGreaterThan(0);
    expect(n.extraMedido!.monto).toBeGreaterThan(0);
  });

  it("🔴 la MISMA persona, servicio profesional o no, mide las MISMAS horas extra: la bandera no las toca", () => {
    const sp = linea({ servicioProfesional: true });
    const normal = linea({ salarioMensual: 1000, servicioProfesional: false });
    expect(sp.horas.extraDiurnoMin).toBe(normal.horas.extraDiurnoMin);
    expect(sp.horas.extraNocturnoMin).toBe(normal.horas.extraNocturnoMin);
    expect(sp.horas.domingoMin).toBe(normal.horas.domingoMin);
    expect(sp.extraMedido!.minutos).toBe(normal.extraMedido!.minutos);
  });
});

describe("2. en el Reporte, la misma pregunta con la misma respuesta", () => {
  const p = (extra: Partial<PersonaReporte>): PersonaReporte =>
    ({ codigo: "52", resumen: { extraMin: 45 }, ...extra }) as unknown as PersonaReporte;

  it("servicio profesional con la casilla en SÍ: se cuentan", () => {
    expect(cuentaHorasExtra(p({ servicioProfesional: true }))).toBe(true);
    expect(cuentaHorasExtra(p({ servicioProfesional: true, cobraHorasExtra: true }))).toBe(true);
    expect(extraQueCuenta(p({ servicioProfesional: true }))).toBe(45);
  });

  it("con la casilla en NO (Yulissa): «—» y fuera del total", () => {
    expect(cuentaHorasExtra(p({ servicioProfesional: true, cobraHorasExtra: false }))).toBe(false);
    expect(extraQueCuenta(p({ cobraHorasExtra: false }))).toBe(0);
  });

  it("sin ninguna bandera (ficha vieja, sin la columna): se cuentan", () => {
    expect(cuentaHorasExtra(p({}))).toBe(true);
  });
});

describe("3. barrido: la regla vieja no vuelve por ningún lado", () => {
  it("🔴 `armarLinea`: `sinRecargos` es SOLO la casilla; `fueraDePlanilla` no la acompaña", () => {
    const motor = puro("src/lib/asistencia/planilla.ts");
    expect(motor).toMatch(/const sinRecargos = noCobraExtra;/);
    expect(motor).not.toMatch(/sinRecargos = fueraDePlanilla/);
    expect(motor).not.toMatch(/fueraDePlanilla \|\| noCobraExtra/);
    // Y `fueraDePlanilla` sigue decidiendo el dinero (no se tocó esa mitad).
    expect(motor).toMatch(/!fueraDePlanilla && !seAbstiene && faltaConfigurar\.length === 0/);
  });

  it("🔴 Aprobaciones no salta al servicio profesional; sí a quien no cobra extras", () => {
    const apr = puro("src/lib/asistencia/aprobaciones.ts");
    expect(apr).not.toMatch(/if \(l\.fueraDePlanilla\) continue;/);
    expect(apr).toMatch(/if \(l\.cobraHorasExtra === false\) continue;/);
  });

  it("🔴 el Reporte pregunta por `cobraHorasExtra`, y su ruta la saca de la casilla de la ficha", () => {
    const rep = puro("src/lib/asistencia/reporte.ts");
    expect(rep).toMatch(/export function cuentaHorasExtra\(p: Pick<PersonaReporte, "cobraHorasExtra">\): boolean \{\s*return p\.cobraHorasExtra !== false;/);
    const ruta = puro("src/app/api/asistencia/reporte/route.ts");
    expect(ruta).toMatch(/filter\(\(f\) => !cobraHorasExtraDeFila\(f\)\)/);
    expect(ruta).toMatch(/\{ \.\.\.p, cobraHorasExtra: false \}/);
    // La bandera de servicio profesional NO arma el conjunto que apaga la columna.
    expect(ruta).not.toMatch(/const sinHorasExtra = new Set\(\s*personasDb\.filas\.filter\(servicioProfesionalDeFila\)/);
    expect(ruta).not.toMatch(/servicioProfesional\.has\(p\.codigo\) \? \{ \.\.\.p, cobraHorasExtra: false \}/);
  });

  it("la nota del 3-sep sobre Yulissa sigue escrita en el motor (no se borró: cambió de lugar)", () => {
    const motor = leer("src/lib/asistencia/planilla.ts");
    expect(motor).toContain("yulisa marca pero no deberia de calcular");
    expect(motor).toContain("14-sep-2026");
    expect(motor).toContain("solo yulissa no cobra, todos los demás sí");
  });
});
