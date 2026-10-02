// ============================================================================
// 🔴 LOS MINUTOS NUNCA SALEN CON DECIMALES (2-oct-2026).
//
// Daniel, en Asistencia del celular: «1 tardanza de 27.83 min» y «27.83 min
// tarde». 27.83 min se lee «27 min 83 s» y son 27 min 50 s. Todo texto con
// minutos sale con el formato del sistema (`formato-tiempo.ts`): «27m 50s»
// (`tiempoDelDia`) o h:mm (`formatoTiempo`). El cálculo sigue al segundo.
//
// Mutaciones que caza: (1) la tarjeta o el pie del celular vuelven a «27.83
// min» · (2) «Tardanzas (…)» de la planilla, la nota del comprobante, el freno
// del cierre o la nota del Excel de Aprobaciones vuelven a decimales ·
// (3) alguien escribe `fmtMin(x)} min` o `toFixed(n)} min` en una pantalla.
// ============================================================================

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { datosDeLaTarjeta, pieDelCelular } from "@/lib/asistencia/celular-asistencia";
import { textoTardanzas, type HorasPersona } from "@/lib/asistencia/planilla";
import { notaTardanza } from "@/lib/asistencia/comprobante";

/** Sin comentarios: los comentarios pueden citar el texto viejo («27.83 min»). */
const borrarComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

/** Un número con decimales seguido de «min» o «minutos»: lo prohibido. */
const MINUTOS_CON_DECIMALES = /\d+[.,]\d+\s*min(utos)?\b(?!-)/;

describe("los minutos salen con el formato del sistema", () => {
  it("la tarjeta del celular: «1 tardanza de 27m 50s»", () => {
    const d = datosDeLaTarjeta({
      ausenciasSinJustificar: 0, vecesTarde: 1, minutosTarde: 27.83, extraMin: 75.5, diasARevisar: 0,
    });
    const textos = d.map((x) => x.texto);
    expect(textos).toContain("1 tardanza de 27m 50s");
    expect(textos).toContain("1h 15m 30s de extra");
    for (const t of textos) expect(t).not.toMatch(MINUTOS_CON_DECIMALES);
  });

  it("el pie del celular: «27m 50s tarde»", () => {
    const t = pieDelCelular({ colaboradores: 8, ausencias: 1, minutosTarde: 27.83 });
    expect(t).toBe("8 colaboradores · 1 ausencia · 27m 50s tarde");
  });

  it("la planilla y el comprobante: «Tardanzas (27m 50s)», nunca «27.83 min»", () => {
    const h = { tardanzaMin: 27.83, tardanzaGraveMin: 0 } as unknown as HorasPersona;
    expect(textoTardanzas(h)).toBe("27m 50s");
    expect(notaTardanza(h)).toBe("27m 50s");
  });
});

describe("barrido: ningún texto del sistema pone «min» detrás de un decimal", () => {
  const SRC = path.resolve(__dirname, "../..");
  const archivos: string[] = [];
  const recorrer = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name !== "__tests__") recorrer(p); }
      else if (/\.tsx?$/.test(e.name)) archivos.push(p);
    }
  };
  recorrer(SRC);

  it("ni `fmtMin(…)} min` ni `toFixed(…)} min(utos)`", () => {
    const prohibido = /(fmtMin|toFixed)\([^\n]*?\)\}?\s*min(utos)?\b/;
    const culpables = archivos.filter((f) => prohibido.test(borrarComentarios(fs.readFileSync(f, "utf8"))));
    expect(culpables.map((f) => path.relative(SRC, f))).toEqual([]);
  });

  it("ni un literal «27.83 min» escrito a mano", () => {
    const culpables = archivos.filter((f) => MINUTOS_CON_DECIMALES.test(borrarComentarios(fs.readFileSync(f, "utf8"))));
    expect(culpables.map((f) => path.relative(SRC, f))).toEqual([]);
  });
});
