// ─────────────────────────────────────────────────────────────────────────────
// 🔴 «DESCARGAR › COMPROBANTES» SE NOMBRA CON EL PERÍODO DEL CUADRO (11-sep-2026).
//
// 🩸 Nombraba el archivo con el período del SELECTOR: generar 1–15 sep, tocar
// «16 – 30 sep» sin Regenerar y bajar Comprobantes daba los montos de la
// quincena generada dentro de un PDF llamado como la otra. El Excel y el PDF
// sí se nombraban desde `data.periodo`. Los tres tienen que salir del cuadro.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { nombreArchivoComprobante } from "@/lib/asistencia/comprobante-pdf";

const puro = readFileSync(join(process.cwd(), "src", "app", "asistencia", "PlanillaTab.tsx"), "utf8")
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("🔴 los comprobantes se nombran con el cuadro, no con el selector", () => {
  it("el nombre sale de `nombreDelCuadro(data)` — empresa y fechas de la respuesta", () => {
    expect(puro).toContain("pdf.nombreArchivoComprobante(nombreDelCuadro(data))");
    const i = puro.indexOf("function nombreDelCuadro(");
    expect(i).toBeGreaterThan(-1);
    const cuerpo = puro.slice(i, i + 600);
    expect(cuerpo).toContain("d.periodo?.desde");
    expect(cuerpo).toContain("d.periodo?.hasta");
    expect(cuerpo).toContain("d.empresa ??");
    // ⛔ la forma vieja no vuelve
    expect(puro).not.toContain("nombreArchivoComprobante({ empresa, desde, hasta })");
  });

  it("⚠️ CONTROL: el Excel y el PDF siguen nombrándose desde `exportables` (el cuadro)", () => {
    expect(puro).toContain('nombreArchivo(exportables, "xlsx")');
    expect(puro).toContain('nombreArchivo(exportables, "pdf")');
  });

  it("y el nombre lleva empresa y las dos fechas", () => {
    expect(nombreArchivoComprobante({ empresa: "confecciones_boston", desde: "2026-09-01", hasta: "2026-09-15" }))
      .toBe("Comprobante-confecciones_boston-2026-09-01_2026-09-15.pdf");
  });
});
