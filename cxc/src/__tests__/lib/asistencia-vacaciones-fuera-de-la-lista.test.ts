/**
 * 🔴 LOS DÍAS DE VACACIONES SE VAN DE LA LISTA DE COLABORADORES (19-sep-2026).
 *
 * Daniel, textual:
 *
 *     «se habló que días de vacaciones no existe, sino por plata, ya se habló
 *      de eso»
 *
 * 🩸 QUÉ MOSTRABA. Una columna con un número PELADO. **Briceida decía 665**:
 * son los días acumulados desde su ingreso en 2006, sin restar lo que se tomó
 * antes de que las vacaciones existieran en el sistema (25-ago-2026). Entre los
 * 44 colaboradores sumaban **2.160 días**. En una lista de 44 filas no hay
 * lugar para la línea que explica que ese número no es un saldo, así que el
 * número engaña.
 *
 * ── 🔴 LO QUE NO SE TOCÓ, Y ES LA MITAD DEL CAMBIO ──────────────────────────
 *
 *   · **La ficha de cada persona.** Ahí el mismo número se lee «Le corresponden
 *     N días», con su línea de aviso («No incluye vacaciones tomadas antes del
 *     17 de septiembre de 2026»). Ahí está bien puesto.
 *   · **El cálculo entero** (`vacaciones-corresponden.ts`), con su regla de la
 *     ley (30 días por cada 11 meses) y su barrido que exige que NO entre a
 *     ningún cálculo de plata.
 *   · **La ruta** `/api/asistencia/vacaciones`, que la ficha sigue leyendo.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  COMO_SE_CALCULA, DIAS_POR_PERIODO, MESES_POR_PERIODO, NO_INCLUYE_ANTES,
  ROTULO_CORRESPONDEN, correspondenA, diasGanados, textoCorresponden,
} from "@/lib/asistencia/vacaciones-corresponden";

const RAIZ = process.cwd();
const leer = (f: string) => fs.readFileSync(path.join(RAIZ, "src", f), "utf8");
const puro = (f: string) =>
  leer(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

const LISTA = "app/asistencia/ConfiguracionTab.tsx";
const FICHA = "app/asistencia/colaboradores/SeccionVacaciones.tsx";

// ─────────────────────────────────────────────────────────────────────────────
// A. LA COLUMNA SE FUE DE LA LISTA
// ─────────────────────────────────────────────────────────────────────────────

describe("A · la lista ya no muestra los días", () => {
  it("🔴 no hay encabezado «Vacaciones» en la lista", () => {
    expect(leer(LISTA)).not.toMatch(/>Vacaciones</);
    expect(puro(LISTA)).not.toMatch(/etiqueta="Vacaciones"/);
  });

  it("🔴 la lista ya no PIDE los días: una petición menos al abrirla", () => {
    const src = puro(LISTA);
    expect(src).not.toContain("/api/asistencia/vacaciones");
    expect(src).not.toContain("corresponden");
    expect(src).not.toContain("DiasCorresponden");
    expect(src).not.toContain("vacaciones-corresponden");
  });

  it("🔴 vuelve a haber UNA sola rejilla, la de cinco columnas de siempre", () => {
    const src = puro(LISTA);
    expect(src).not.toContain("COLUMNAS_CON_VACACIONES");
    expect(src).toMatch(/const rejilla = COLUMNAS;/);
    // La de seis columnas ya no se escribe en ningún lado.
    expect(leer(LISTA)).not.toMatch(/_6\.5rem_5\.5rem_minmax/);
    // Y la de cinco sigue escrita COMPLETA (Tailwind purga leyendo el texto).
    expect(leer(LISTA)).toMatch(/lg:grid-cols-\[minmax\(0,1fr\)_9rem_5rem_6\.5rem_minmax\(0,1fr\)\]/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B. 🔴 LA FICHA NO SE TOCÓ
// ─────────────────────────────────────────────────────────────────────────────

describe("B · la ficha sigue igual", () => {
  it("🔴 la ficha sigue leyendo la MISMA ruta y mostrando el número", () => {
    const src = puro(FICHA);
    expect(src).toContain("/api/asistencia/vacaciones");
    expect(src).toContain("vacaciones-corresponden");
  });

  it("🔴 y sigue diciendo «Le corresponden», con su línea de aviso", () => {
    // Sin comentarios: un candado no se cumple con una palabra de una explicación.
    const src = puro(FICHA);
    expect(src).toMatch(/ROTULO_CORRESPONDEN|textoCorresponden/);
    expect(src).toMatch(/NO_INCLUYE_ANTES/);
    expect(ROTULO_CORRESPONDEN).toBe("Le corresponden");
    expect(NO_INCLUYE_ANTES).toContain("No incluye vacaciones tomadas antes");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C. 🔴 EL CÁLCULO SE QUEDA ENTERO
// ─────────────────────────────────────────────────────────────────────────────

describe("C · el cálculo no se tocó", () => {
  it("la ley sigue siendo 30 días por cada 11 meses", () => {
    expect(DIAS_POR_PERIODO).toBe(30);
    expect(MESES_POR_PERIODO).toBe(11);
    expect(COMO_SE_CALCULA).toContain("30 días corridos por cada 11 meses");
  });

  it("🩸 el caso de Briceida: el número que la lista mostraba pelado", () => {
    // Ingresó en 2006; a hoy le «corresponden» cientos de días que nadie sabe
    // si se tomó. Es exactamente por lo que el número salió de la lista.
    const ganados = diasGanados("2006-03-01", "2026-09-19");
    expect(ganados).not.toBeNull();
    expect(ganados!).toBeGreaterThan(600);
    const d = correspondenA("8", "Briceida Montero", "2006-03-01", [], "2026-09-19");
    expect(textoCorresponden(d)).toContain(ROTULO_CORRESPONDEN);
  });

  it("🔴 sin fecha de ingreso no sale un número, ni cero", () => {
    const d = correspondenA("99", "Alguien", null, [], "2026-09-19");
    expect(d.dias).toBeNull();
    expect(d.faltaFechaIngreso).toBe(true);
  });

  it("🔴 sigue sin entrar a ningún cálculo de plata", () => {
    // El barrido de siempre (`vacaciones-le-corresponden.test.ts`) lo exige;
    // acá solo se comprueba que el módulo no lo importe nadie que pague.
    const modulo = puro("lib/asistencia/vacaciones-corresponden.ts");
    expect(modulo).not.toContain("rataHora");
    expect(modulo).not.toContain("netoPagar");
  });
});
