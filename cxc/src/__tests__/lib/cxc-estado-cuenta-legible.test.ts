// ─────────────────────────────────────────────────────────────────────────────
// EL ESTADO DE CUENTA SE PUEDE LEER (5-sep-2026).
//
// 🩸 CÓMO ESTABA, medido contra producción:
//   · una lista de dos líneas por documento SIN UN SOLO ENCABEZADO de columna;
//   · dos números apilados —«$1,006.80» y debajo «de $2,978.88»— sin decir cuál
//     es cuál: había que adivinar que el de arriba es lo que falta;
//   · el total al fondo del pie, así que con los 110 documentos de City Mall
//     Paso Canoa había que bajar toda la lista para saber cuánto debía;
//   · los subtotales de las otras 5 empresas, perdidos entre 110 filas;
//   · **36 de esos 110 documentos valen menos de $50 y suman $227,20** — un
//     tercio de la lista para el 0,05 % del saldo.
//
// 🔴 LO CHICO SE AGRUPA POR MONTO, NUNCA POR TIPO DE DOCUMENTO. Es la tentación
// obvia («las notas de débito son las chicas») y es FALSA: hay notas de débito
// de $5.000 (Internacional Belén, 2024) y de $3.349,10 (City Mall David).
// Esconder una nota de débito de $5.000 es esconder plata que hay que cobrar.
//
// ⚠️ Contexto que NO se dice en pantalla: esas notas chicas son, casi todas, de
// las retenciones —los 7 clientes que las tienen son los 7 que pagan
// reteniendo—, pero Switch NO manda el motivo. Afirmarlo sería inventar.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  UMBRAL_DOC_CHICO,
  esDocChico,
  partirDocumentos,
  textoDocsChicos,
} from "@/lib/cxc/documentos-chicos";

const leer = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n").map((l) => l.replace(/(^|[^:])\/\/.*$/, "$1")).join("\n");

describe("🔴 lo chico se decide por MONTO", () => {
  it("el corte son $50", () => {
    expect(UMBRAL_DOC_CHICO).toBe(50);
    expect(esDocChico(49.99)).toBe(true);
    expect(esDocChico(50)).toBe(false);
    expect(esDocChico(50.01)).toBe(false);
  });

  it("mira el VALOR ABSOLUTO: un crédito de -$12 también es chico", () => {
    expect(esDocChico(-12)).toBe(true);
    expect(esDocChico(-5000)).toBe(false);
  });

  it("los 36 de City Mall Paso Canoa se pliegan en una línea de $227.20", () => {
    const chicos = Array.from({ length: 36 }, () => ({ saldo: 6.3111111 }));
    const grandes = Array.from({ length: 74 }, () => ({ saldo: 1200 }));
    const partido = partirDocumentos([...grandes, ...chicos]);
    expect(partido.chicos.length).toBe(36);
    expect(partido.grandes.length).toBe(74);
    expect(partido.totalChicos).toBeCloseTo(227.2, 1);
  });

  it("🩸 una NOTA DE DÉBITO GRANDE NO se esconde — el corte no mira el tipo", () => {
    // $5.000 de Internacional Belén (2024) y $3.349,10 de City Mall David. Si
    // alguien agrupara «por tipo de documento», estas dos desaparecerían.
    const docs = [
      { saldo: 5000, tipo: "Nota de Débito" },
      { saldo: 3349.1, tipo: "Nota de Débito" },
      { saldo: 12.4, tipo: "Nota de Débito" },
    ];
    const { grandes, chicos } = partirDocumentos(docs);
    expect(grandes.map((d) => d.saldo)).toEqual([5000, 3349.1]);
    expect(chicos.map((d) => d.saldo)).toEqual([12.4]);
  });

  it("una FACTURA chica sí se pliega — de nuevo: manda el monto, no el tipo", () => {
    const { chicos } = partirDocumentos([{ saldo: 3.2, tipo: "Factura" }]);
    expect(chicos.length).toBe(1);
  });

  it("la línea dice cuántos, el umbral y cuánto suman", () => {
    expect(textoDocsChicos(36, "$227.20")).toBe("36 documentos de menos de $50 · $227.20");
    expect(textoDocsChicos(1, "$6.31")).toBe("1 documento de menos de $50 · $6.31");
  });
});

describe("el cajón del GRUPO", () => {
  const src = sinComentarios(leer("src/app/cxc/components/EstadoCuentaDrawer.tsx"));

  it("🔴 usa el módulo puro, no un `< 50` escrito a mano", () => {
    expect(src).toContain("partirDocumentos");
    expect(src).toContain('from "@/lib/cxc/documentos-chicos"');
  });

  it("⚠️ NO agrupa por tipo de documento en ningún lado", () => {
    expect(src).not.toMatch(/tipo\s*===\s*["']Nota de D/);
    expect(src).not.toMatch(/filter\([^)]*\.tipo/);
  });

  it("la tabla tiene encabezados de columna, y separa Original de Saldo", () => {
    expect(src).toContain(">Documento<");
    expect(src).toContain(">Fecha<");
    expect(src).toContain(">Días<");
    expect(src).toContain(">Original<");
    expect(src).toContain(">Saldo<");
  });

  it("🩸 los dos números ya no van apilados sin rótulo: se fue el «de $…»", () => {
    expect(src).not.toContain("de ${fmt(doc.monto)}");
  });

  it("«Original» muestra «—» cuando es igual al saldo (no el mismo número dos veces)", () => {
    expect(src).toMatch(/doc\.monto === Math\.abs\(doc\.saldo\) \? "—"/);
  });

  it("el TOTAL va ARRIBA y grande, no solo al fondo del pie", () => {
    expect(src).toMatch(/text-2xl[^"]*tabular-nums[\s\S]{0,120}money\(data\.total\)/);
  });

  it("hay una pastilla por empresa con su subtotal, y lleva a su sección", () => {
    expect(src).toContain("#ec-${emp.empresa_key}");
    expect(src).toContain("money(emp.subtotal)");
  });

  it("🔴 el pie dice «Cobrar» — desde el papel se puede mandar el papel", () => {
    expect(src).toContain(">\n                Cobrar\n              </button>");
    expect(src).not.toContain("Descargar PDF");
    expect(src).not.toMatch(/"Compartir"/);
  });
});

describe("el cajón de la cartera de BOSTON", () => {
  const src = sinComentarios(leer("src/components/cxc/BostonDocumentosDrawer.tsx"));

  it("tiene los MISMOS encabezados y la MISMA agrupación por monto", () => {
    expect(src).toContain(">Documento<");
    expect(src).toContain(">Original<");
    expect(src).toContain(">Saldo<");
    expect(src).toContain("partirDocumentos");
  });

  it("🔴 lee SU propia ruta, no la del grupo", () => {
    expect(src).toContain("/api/cxc/boston/estado-cuenta");
    expect(src).not.toContain("/api/cxc/estado-cuenta");
  });
});

describe("🔴 la ruta de Boston no toca al grupo", () => {
  const src = sinComentarios(leer("src/app/api/cxc/boston/estado-cuenta/route.ts"));

  it("acota a `confecciones_boston` EN LA MISMA CADENA de la consulta", () => {
    expect(src).toMatch(/\.from\("switch_estadocuenta"\)[\s\S]{0,400}\.eq\("empresa_key", EMPRESA_BOSTON\)/);
    expect(src).toContain('const EMPRESA_BOSTON = "confecciones_boston"');
  });

  it("la empresa es una CONSTANTE del servidor, nunca sale de la URL", () => {
    expect(src).not.toMatch(/searchParams\.get\(["']empresa["']\)/);
  });

  it("🔴 NO reusa el lector del grupo (`fetchEstadoCuentaData`)", () => {
    // Ese helper recibe una LISTA de empresas: bastaría con pasarle Boston para
    // mezclar los dos mundos por descuido.
    expect(src).not.toContain("fetchEstadoCuentaData");
  });

  it("el permiso sale de la misma lista que la pestaña", () => {
    expect(src).toContain("rolesBoston()");
  });
});
