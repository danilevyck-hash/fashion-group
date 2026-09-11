// ─────────────────────────────────────────────────────────────────────────────
// 🔴 (1) EL DÍA DEL PRORRATEO VALE SUELDO ÷ 26 y (2) NINGÚN AVISO DEL MÓDULO
// MANDA A «Configuración» NI A «Personas» (10-sep-2026, noche)
//
// Daniel eligió «a»: sueldo mensual ÷ 26 por día, la costumbre de Panamá y lo
// que la contable ya paga (Yeritza: 5 × $23,08 = $115,38). Y el aviso del saldo
// de vacaciones decía «Se cargan en Configuración» cuando esa pestaña se llama
// «Colaboradores» y el saldo se carga en la ficha de cada uno.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { DIAS_PAGADOS_POR_MES, prorrateoPorVigencia } from "@/lib/asistencia/prorrateo-ingreso";
import { dondeSeCargaLaFicha, nombrePestanaFichas } from "@/lib/asistencia/persona-en-el-centro";
import { avisoSinSaldo } from "@/lib/asistencia/saldo-vacaciones";

const RAIZ = join(__dirname, "..", "..", "..");
const puro = (rel: string) =>
  readFileSync(join(RAIZ, rel), "utf8").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
function archivos(dir: string): string[] {
  const out: string[] = [];
  for (const n of readdirSync(join(RAIZ, dir))) {
    const rel = `${dir}/${n}`;
    if (statSync(join(RAIZ, rel)).isDirectory()) out.push(...archivos(rel));
    else if (/\.tsx?$/.test(n)) out.push(rel);
  }
  return out;
}

describe("1. 🔴 el día vale sueldo ÷ 26", () => {
  it("Yeritza (51): 5 días hábiles desde el 27-jul → factor 5/13 → 300 × 5/13 = $115,38", () => {
    expect(DIAS_PAGADOS_POR_MES).toBe(26);
    const pr = prorrateoPorVigencia({ fechaIngreso: "2026-07-27", fechaSalida: null, motivoSalida: null } as never, "2026-07-16", "2026-07-31")!;
    expect(pr.habilesTrabajados).toBe(5);
    expect(pr.factor).toBeCloseTo(5 / 13, 9);
    expect(Math.round(300 * pr.factor * 100) / 100).toBe(115.38);
    expect(pr.texto).toBe("entró el 27 de julio de 2026: 5 días hábiles (sueldo ÷ 26 por día)");
  });
  it("un solo día se dice en singular; el que trabaja el período entero no se prorratea", () => {
    const pr = prorrateoPorVigencia({ fechaIngreso: "2026-07-31", fechaSalida: null, motivoSalida: null } as never, "2026-07-16", "2026-07-31")!;
    expect(pr.texto).toBe("entró el 31 de julio de 2026: 1 día hábil (sueldo ÷ 26 por día)");
    expect(prorrateoPorVigencia({ fechaIngreso: "2026-07-01", fechaSalida: null, motivoSalida: null } as never, "2026-07-16", "2026-07-31")).toBeNull();
  });
  it("el Excel y el PDF lo explican con el 26, no con los hábiles de la quincena", () => {
    expect(puro("src/lib/asistencia/planilla-exportar.ts")).toMatch(/sueldo mensual ÷ 26/);
    expect(puro("src/lib/asistencia/planilla-exportar.ts")).not.toMatch(/días hábiles \(lunes a viernes\) de la quincena ×/);
  });
});

describe("2. 🔴 ningún aviso manda a «Configuración» ni a «Personas»", () => {
  it("la pestaña de las fichas se nombra desde el módulo puro", () => {
    expect(nombrePestanaFichas(true)).toBe("Colaboradores");
    expect(nombrePestanaFichas(false)).toBe("Configuración");
    expect(dondeSeCargaLaFicha(true)).toBe("en la ficha de cada colaborador");
    // El aviso lo toma del módulo puro (prendido → «en la ficha de cada colaborador»).
    expect(avisoSinSaldo(1, 0)).toContain(`Se cargan ${dondeSeCargaLaFicha()}.`);
    expect(puro("src/lib/asistencia/saldo-vacaciones.ts")).toMatch(/Se cargan \$\{dondeSeCargaLaFicha\(\)\}\./);
  });
  it("barrido: ningún texto visible de Asistencia escribe «Configuración» ni «Personas» a mano", () => {
    const lista = [...archivos("src/app/asistencia"), ...archivos("src/lib/asistencia")]
      .filter((f) => !f.endsWith("persona-en-el-centro.ts"));
    for (const rel of lista) {
      const src = puro(rel);
      expect(src, rel).not.toMatch(/<b>Configuración<\/b>/);
      expect(src, rel).not.toMatch(/"[^"\n]*\ben Configuración\b[^"\n]*"/);
      expect(src, rel).not.toMatch(/"[^"\n]*\bpestaña Configuración\b[^"\n]*"/);
      expect(src, rel).not.toMatch(/\bPersonas\b/);
    }
  });
});
