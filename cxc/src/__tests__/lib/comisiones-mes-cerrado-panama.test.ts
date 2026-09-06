// ═════════════════════════════════════════════════════════════════════════════
// 🔴 COMISIONES ABRE EN EL ÚLTIMO MES CERRADO, Y EL «HOY» ES EL DE PANAMÁ.
// ═════════════════════════════════════════════════════════════════════════════
// 🩸 Medido el 5-sep-2026: la pantalla abría en el mes EN CURSO. Con 5 días de
// septiembre la comisión bruta de las 6 empresas era $101,77 y el descuento
// fijo de $1.573,08 se restaba entero, así que lo PRIMERO que se veía al entrar
// era «Total a pagar −$1.471,31» — la pantalla diciéndole a Daniel que le debe
// plata a su vendedor, todos los primeros días de cada mes. Daniel eligió «a»:
// abrir en el último mes completo, con el mes en curso a un toque.
//
// 🩸 Y el mes lo decidía el RELOJ DEL NAVEGADOR (`new Date().getMonth() + 1`).
// Panamá es UTC−5 fijo y es invariante de la casa.
//
// Ningún cálculo cambia: solo con qué período abre y qué meses quedan apagados.
// ═════════════════════════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ultimoMesCerrado, mesEnCurso, periodoInicial } from "@/lib/comisiones/mes-inicial";

const RAIZ = process.cwd();
const leer = (rel: string) => readFileSync(path.join(RAIZ, rel), "utf8");
const sinComentarios = (s: string) =>
  s.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");

describe("🔴 ultimoMesCerrado: el mes anterior al que corre hoy en Panamá", () => {
  it("el 6-sep-2026 abre en AGOSTO de 2026", () => {
    expect(ultimoMesCerrado("2026-09-06")).toEqual({ year: 2026, mes: 8 });
    expect(mesEnCurso("2026-09-06")).toEqual({ year: 2026, mes: 9 });
  });

  it("🔴 en enero cruza el año: enero 2027 abre en DICIEMBRE de 2026", () => {
    expect(ultimoMesCerrado("2027-01-02")).toEqual({ year: 2026, mes: 12 });
    expect(ultimoMesCerrado("2027-01-31")).toEqual({ year: 2026, mes: 12 });
  });

  it("el día del mes no importa: el 1 y el 30 abren en el mismo mes", () => {
    expect(ultimoMesCerrado("2026-07-01")).toEqual(ultimoMesCerrado("2026-07-31"));
  });

  it("periodoInicial se queda en el mes en curso si el año cerrado no está disponible", () => {
    // App estrenada en enero, sin datos del año anterior: más vale abrir en un
    // mes que existe que en uno que la pantalla no puede pedir.
    expect(periodoInicial("2027-01-05", [2027])).toEqual({ year: 2027, mes: 1 });
    expect(periodoInicial("2027-01-05", [2026, 2027])).toEqual({ year: 2026, mes: 12 });
    expect(periodoInicial("2026-09-06", [])).toEqual({ year: 2026, mes: 8 });
  });
});

describe("🔴 la pantalla no mira el reloj del navegador", () => {
  const shell = sinComentarios(leer("src/components/ventas/ComisionesView.tsx"));
  const periodo = sinComentarios(leer("src/components/ventas/ComisionesPeriodo.tsx"));

  it("🔴 ni el shell ni el selector de período llaman a `new Date()`", () => {
    expect(shell).not.toMatch(/new Date\(\)/);
    expect(periodo).not.toMatch(/new Date\(\)/);
    expect(shell).not.toMatch(/getMonth\(\)/);
    expect(periodo).not.toMatch(/getFullYear\(\)/);
  });

  it("los dos usan `hoyPanama` y el módulo puro", () => {
    expect(shell).toContain("hoyPanama");
    expect(shell).toContain("periodoInicial(hoyPanama()");
    expect(periodo).toContain("mesEnCurso(hoyPanama())");
  });

  it("🔴 el estado de arranque es el período inicial, no el mes en curso", () => {
    expect(shell).toContain("useState<number>(inicial.year)");
    expect(shell).toContain("useState<number>(inicial.mes)");
  });

  it("el mes en curso sigue a UN toque: el selector de período no se tocó", () => {
    // La regla de negocio conservada: los meses futuros quedan apagados, y el
    // mes en curso NO es futuro.
    expect(periodo).toContain("const mesApagado = (m: number) => year === currentYear && m > currentMonth;");
  });
});
