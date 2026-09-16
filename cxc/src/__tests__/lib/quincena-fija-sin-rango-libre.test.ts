/* ─────────────────────────────────────────────────────────────────────────────
 * 🔴 LA QUINCENA ES FIJA: EL RANGO LIBRE SE FUE DE LA PANTALLA — el candado
 * (15-sep-2026).
 *
 * Daniel, textual: *«si la quincena es fija, que no haya opción de rango, solo
 * las opciones»*.
 *
 * 🩸 POR QUÉ. De «Otro rango ⌄» salían los enredos: un rango que no es una
 * quincena prorratea el sueldo por `factorBase`, APAGA los montos escritos a
 * mano (ISR, préstamo, terceros, mercancía, otros servicios) y deja guardadas
 * cabeceras con `quincena = NULL` — y por eso el ajuste de la quincena anterior
 * nunca se dispara: `medirAjusteAnterior` exige que la anterior esté cerrada
 * COMO quincena y con su corte. Medido en producción el 15-sep-2026, lo
 * guardado eran rangos así: `2026-08-29 → 2026-09-10` en Vistana,
 * `2026-08-15 → 2026-08-31` y `→ 2026-08-25` en Boston.
 *
 * 🔴 LO QUE SE PROTEGE:
 *
 *   A. Son CUATRO quincenas elegibles: las dos del mes anterior y las dos del
 *      mes en curso, en orden de calendario. Enero cae en diciembre del año
 *      anterior.
 *   B. La Planilla NO monta el calendario, ni dice «Otro rango» en ningún lado.
 *   C. 🔴 CONTROL, y es el más importante: LA RUTA SIGUE ACEPTANDO RANGOS
 *      LIBRES. Si alguien la cierra «ya que el calendario no está», se muere el
 *      ajuste de la quincena anterior.
 *   D. La migración que borra las cabeceras de prueba va por lista de ids
 *      explícita, con guardas, y no toca la quincena de verdad.
 * ─────────────────────────────────────────────────────────────────────────── */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

import { quincenasElegibles, rotuloQuincena } from "@/lib/asistencia/elegir-quincena";

const RAIZ = path.resolve(__dirname, "../../..");
const leer = (p: string) => fs.readFileSync(path.join(RAIZ, p), "utf8");
const sinComentarios = (p: string) =>
  leer(p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

// ═════════════════════════════════════════════════════════════════════════════
describe("A. 🔴 cuatro quincenas elegibles: el mes anterior y el mes en curso", () => {
  it("en septiembre se ofrecen agosto y septiembre, en orden de calendario", () => {
    const qs = quincenasElegibles("2026-09-16");
    expect(qs.map(rotuloQuincena)).toEqual([
      "1 – 15 ago",
      "16 – 30 ago",
      "1 – 15 sep",
      "16 – 30 sep",
    ]);
  });

  it("🔑 el mes anterior NO es un lujo: sin él, en octubre no se podría cerrar septiembre", () => {
    const qs = quincenasElegibles("2026-10-01");
    expect(qs.map((q) => `${q.desde}→${q.hasta}`)).toContain("2026-09-01→2026-09-15");
    expect(qs.map((q) => `${q.desde}→${q.hasta}`)).toContain("2026-09-16→2026-09-30");
  });

  it("en enero el mes anterior es DICIEMBRE del año pasado", () => {
    const qs = quincenasElegibles("2027-01-05");
    expect(qs[0].anio).toBe(2026);
    expect(qs[0].mes).toBe(12);
    expect(qs[2].anio).toBe(2027);
    expect(qs[2].mes).toBe(1);
  });

  it("⚠️ ninguna segunda quincena dice 31: el 31 no paga sueldo nunca", () => {
    for (const hoy of ["2026-09-16", "2026-01-15", "2026-02-10", "2026-04-02"]) {
      for (const q of quincenasElegibles(hoy)) {
        expect(q.hasta.slice(8, 10), `${hoy} · ${q.clave}`).not.toBe("31");
      }
    }
  });

  it("son EXACTAMENTE cuatro, siempre", () => {
    for (const hoy of ["2026-01-01", "2026-06-30", "2026-12-31"]) {
      expect(quincenasElegibles(hoy)).toHaveLength(4);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("B. 🔴 la Planilla no monta el calendario ni nombra «Otro rango»", () => {
  const tab = sinComentarios("src/app/asistencia/PlanillaTab.tsx");

  it("no importa `RangoFechas`", () => {
    expect(tab).not.toMatch(/from "@\/components\/ui\/RangoFechas"/);
    expect(tab).not.toContain("<RangoFechas");
  });

  it("no dice «Otro rango» en ningún lado", () => {
    expect(tab).not.toContain("Otro rango");
  });

  it("los botones salen de `quincenasElegibles`, no de las dos del mes", () => {
    expect(tab).toContain("quincenasElegibles(hoy)");
    expect(tab).not.toContain("quincenasDelMes(hoy)");
  });

  it("⚠️ y el cartel del vacío ya no manda a un calendario que no existe", () => {
    expect(tab).toContain("Toca la quincena arriba y después");
    expect(tab).not.toContain("está marcado en el calendario");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("C. 🔴 CONTROL: la RUTA sigue aceptando rangos libres", () => {
  const ruta = sinComentarios("src/app/api/asistencia/planilla/route.ts");

  it("🩸 de eso vive el ajuste de la quincena anterior: se llama a sí misma con el rango corto", () => {
    // `medirAjusteAnterior` vuelve a llamar a la MISMA ruta con los días que
    // quedaron sin medir, para valuarlos sin duplicar el motor. Cerrar la ruta
    // «ya que el calendario no está» mataría el ajuste en silencio.
    expect(ruta).toContain("medirAjusteAnterior");
  });

  it("lee `desde` y `hasta` de la query, sin exigir que sean una quincena", () => {
    expect(ruta).toMatch(/sp\.get\("desde"\)/);
    expect(ruta).toMatch(/sp\.get\("hasta"\)/);
    // Y no hay ningún rechazo por «esto no es una quincena».
    expect(ruta).not.toMatch(/no es una quincena/i);
  });

  it("⚠️ y el motor sigue sabiendo prorratear un rango que no es quincena", () => {
    // `periodoDesdeRango` y `factorBase` no se tocaron: la pantalla dejó de
    // ofrecerlo, el cálculo sigue existiendo.
    expect(sinComentarios("src/lib/asistencia/planilla.ts")).toContain("export function periodoDesdeRango");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("D. 🔴 el borrado de las pruebas: por lista de ids, con guardas", () => {
  const sql = leer("supabase/migrations/20261201120000_borrar_planillas_de_prueba.sql");

  it("nombra los TRES uuid, uno por uno", () => {
    for (const id of [
      "09bc634d-2c85-4d98-967d-d9cdea45e2de",
      "e47211e7-690a-4fba-a18f-d4b02e461db5",
      "4996da0f-e861-4d93-93a6-753e1e6cb03b",
    ]) {
      expect(sql).toContain(id);
    }
  });

  it("🔴 NUNCA un DELETE abierto: nada de `WHERE quincena IS NULL`", () => {
    // Con los comentarios borrados: el encabezado NOMBRA esa forma para decir
    // que no se usa, y tiene que poder nombrarla.
    const codigo = sql.replace(/^\s*--.*$/gm, "");
    expect(codigo).not.toMatch(/DELETE[\s\S]{0,200}WHERE\s+quincena\s+IS\s+NULL/i);
    // Los dos DELETE van acotados por la lista de ids.
    const deletes = codigo.match(/DELETE FROM[^;]+;/g) ?? [];
    expect(deletes).toHaveLength(2);
    for (const d of deletes) expect(d).toContain("ANY(ids)");
  });

  it("🔴 se planta si alguna resultara ser una quincena, o tuviera un pago atado", () => {
    // Con los comentarios borrados: el encabezado nombra las dos tablas para
    // contar lo medido, y esto tiene que mirar el CÓDIGO.
    const codigo = sql.replace(/^\s*--.*$/gm, "");
    expect(codigo).toContain("quincena IS NOT NULL");
    expect(codigo).toContain("FROM asistencia_planilla_prestamo");
    expect((codigo.match(/RAISE EXCEPTION/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it("🔴 y NO toca la quincena de verdad (la única con `quincena` puesta)", () => {
    // `55b47a9f` es fashion_wear 1–15 sep, cerrada, con corte y con los DOS
    // pagos de préstamo que existen. Medido el 15-sep-2026.
    expect(sql).not.toContain("55b47a9f-5e9f-40c8-aa3a-9ca053990aea");
  });

  it("mide antes y después, y borra las líneas primero (el FK es RESTRICT)", () => {
    expect(sql).toMatch(/RAISE NOTICE 'ANTES/);
    expect(sql).toMatch(/RAISE NOTICE 'DESPUÉS/);
    expect(sql.indexOf("DELETE FROM asistencia_planilla_guardada_linea"))
      .toBeLessThan(sql.indexOf("DELETE FROM asistencia_planilla_guardada WHERE"));
  });
});
