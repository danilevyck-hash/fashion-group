// ─────────────────────────────────────────────────────────────────────────────
// LA CARTERA DE BOSTON — MISMO FORMATO, SIN MEZCLARSE (5-sep-2026).
//
// LO QUE SE MIDIÓ ANTES DE TOCAR LOS TRAMOS. La pregunta era si el dato aguanta
// el corte fino: `switch_estadocuenta` de confecciones_boston tiene **985
// documentos con saldo, los 985 con `dias` y con `fecha_creacion`**, de 1 a
// 1.465 días. O sea: el reporte web que llena la vista (cron `boston-cartera`)
// SÍ trae la antigüedad documento por documento, y los tramos 0-30 / 31-60 /
// 61-90 / 121-180 / 181-270 / 271-365 / +365 se pueden calcular exactamente
// igual que los del grupo. No hubo que inventar ningún bucket.
//
// 🔴 LOS TRES TRAMOS QUE SE VEN NO CAMBIARON: 0-90 · 91-120 · 121+, los mismos
// del grupo y las mismas cifras. Lo que se agregó es el DETALLE del `title`,
// que el grupo ya mostraba y Boston no podía porque la vista no lo calculaba.
// Verificado contra producción: `d0_90 = d0_30+d31_60+d61_90` y
// `d121_plus = d121_180+d181_270+d271_365+mas_365` en los 390 clientes, 0
// discrepancias; total $190.399,07.
//
// 🔴 Y BOSTON SIGUE APARTE, en las dos direcciones.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const RAIZ = process.cwd();
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n").map((l) => l.replace(/(^|[^:])\/\/.*$/, "$1")).join("\n");

const MIGRACION = "supabase/migrations/20260928120000_aging_boston_tramos_finos.sql";

describe("la migración de los tramos finos", () => {
  const sql = leer(MIGRACION);

  it("agrega los SIETE cortes finos, los mismos del grupo", () => {
    for (const col of ["d0_30", "d31_60", "d61_90", "d121_180", "d181_270", "d271_365", "mas_365"]) {
      expect(sql, `falta ${col}`).toContain(`AS ${col}`);
    }
  });

  it("🔴 conserva los tres que ya se veían, con los MISMOS cortes", () => {
    expect(sql).toMatch(/dias >= 0 AND dias <= 90\), 0::numeric\) AS d0_90/);
    expect(sql).toMatch(/dias >= 91 AND dias <= 120\), 0::numeric\) AS d91_120/);
    expect(sql).toMatch(/dias > 120\), 0::numeric\) AS d121_plus/);
  });

  it("⚠️ las columnas nuevas van AL FINAL (CREATE OR REPLACE VIEW lo exige)", () => {
    const orden = ["d0_90", "d91_120", "d121_plus", "total", "d0_30"];
    let previo = -1;
    for (const col of orden) {
      const i = sql.indexOf(`AS ${col}`);
      expect(i, `${col} fuera de orden`).toBeGreaterThan(previo);
      previo = i;
    }
  });

  it("🔴 la vista sigue leyendo SOLO Boston, y no toca la del grupo", () => {
    expect(sql).toContain("s.empresa_key = 'confecciones_boston'");
    expect(sql).not.toMatch(/CREATE OR REPLACE VIEW switch_estadocuenta_aging\b/);
  });

  it("los cortes son idénticos a los del grupo — nada inventado", () => {
    const cortes = [
      /dias >= 0 AND dias <= 30\), 0::numeric\) AS d0_30/,
      /dias >= 31 AND dias <= 60\), 0::numeric\) AS d31_60/,
      /dias >= 61 AND dias <= 90\), 0::numeric\) AS d61_90/,
      /dias >= 121 AND dias <= 180\), 0::numeric\) AS d121_180/,
      /dias >= 181 AND dias <= 270\), 0::numeric\) AS d181_270/,
      /dias >= 271 AND dias <= 365\), 0::numeric\) AS d271_365/,
      /dias > 365\), 0::numeric\) AS mas_365/,
    ];
    for (const c of cortes) expect(sql, `corte distinto: ${c}`).toMatch(c);
  });
});

describe("la pestaña de Boston", () => {
  const src = sinComentarios(leer("src/components/cxc/BostonTab.tsx"));

  it("usa la MISMA grilla de 12 columnas que el CXC del grupo", () => {
    expect(src).toContain("grid-cols-12");
    expect(src).toContain("col-span-4");
    expect(src).toContain("col-span-2");
  });

  it("«Cobrar» se VE en cada fila", () => {
    expect(src).toMatch(/>\s*Cobrar\s*</);
    expect(src).toContain("setCobrarA");
  });

  it("Boston NO tiene desglose por empresa: la fila va DIRECTO a sus documentos", () => {
    expect(src).toContain("BostonDocumentosDrawer");
    expect(src).toContain("setDocumentosDe");
  });

  it("⚠️ el detalle fino no se dibuja si la DDL todavía no corrió", () => {
    expect(src).toMatch(/if \(!c\.finos\) return tramoLabel\(k\)/);
  });

  it("la ruta lee la vista con `*` para no quedarse sin los tramos nuevos", () => {
    const ruta = sinComentarios(leer("src/app/api/cxc/boston/route.ts"));
    expect(ruta).toContain('const COLS = "*"');
  });
});

describe("🔴 Boston sigue sin mezclarse con el grupo, en las dos direcciones", () => {
  const tab = sinComentarios(leer("src/components/cxc/BostonTab.tsx"));
  const hoja = sinComentarios(leer("src/components/cxc/BostonHojaCobrar.tsx"));
  const cajon = sinComentarios(leer("src/components/cxc/BostonDocumentosDrawer.tsx"));

  it("la pestaña no pide una sola ruta del grupo", () => {
    for (const src of [tab, hoja, cajon]) {
      expect(src).not.toContain("/api/cxc/aging");
      expect(src).not.toContain("/api/cxc/estado-cuenta");
      expect(src).not.toContain("/api/cxc/enviar-email");
      expect(src).not.toContain("/api/cxc/cobrar-lote");
      expect(src).not.toContain("/api/cxc/ultimos-pagos?");
    }
  });

  it("y el CXC del grupo no monta ni un componente de Boston (salvo su pestaña)", () => {
    const pagina = sinComentarios(leer("src/app/cxc/page.tsx"));
    expect(pagina).toContain("BostonTab");
    expect(pagina).not.toContain("BostonHojaCobrar");
    expect(pagina).not.toContain("BostonDocumentosDrawer");
  });

  it("los contactos de Boston salen de `switch_clientes` acotado, no del maestro", () => {
    const ruta = sinComentarios(leer("src/app/api/cxc/boston/route.ts"));
    expect(ruta).toMatch(/\.from\("switch_clientes"\)[\s\S]{0,300}\.eq\("empresa_key", "confecciones_boston"\)/);
    expect(ruta).not.toContain("clientes_master");
  });

  it("⚠️ la hoja de Boston NO manda correos: es una decisión pendiente, no un olvido", () => {
    // Medido: de los 390 clientes con saldo, 272 tienen teléfono y solo 113
    // correo — y el texto de cobro del sistema lo firma Fashion Group, que no
    // es Boston. Quién firma ese correo es una decisión de Daniel.
    expect(hoja).not.toContain("resend");
    expect(hoja).not.toContain("/api/cxc/enviar-email");
    expect(hoja).toContain("WhatsApp");
    expect(hoja).toContain("Copiar el mensaje");
  });

  it("🔴 el mensaje de Boston lo firma Boston, y no dice «vencido»", () => {
    expect(hoja).toContain("Confecciones Boston - Departamento de Cobros");
    expect(hoja.toLowerCase()).not.toMatch(/\bvencid[oa]s?\b/);
  });
});
