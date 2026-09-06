/**
 * ─────────────────────────────────────────────────────────────────────────────
 * LAS FIRMAS, PLEGADAS AL MIRAR — Y ENTERAS AL FIRMAR (5-sep-2026).
 *
 * 🩸 Al abrir una guía ya despachada se dibujaban los DOS cuadros de firma a
 * tamaño completo: en un iPhone caen apilados y se llevan media pantalla.
 * Medido sobre las 221 despachadas vivas: **156 tienen las dos firmas y 65 no
 * tienen ninguna**.
 *
 * 🔴 LO QUE NO PUEDE ROMPERSE:
 *   1. **Al FIRMAR no cambia nada.** `SignatureCanvas` sigue midiendo 150 px de
 *      alto y todo el ancho, y `DespachoForm` no conoce este componente. Daniel
 *      preguntó expresamente por eso.
 *   2. **No miente.** Con una sola firma la línea dice CUÁL falta.
 *   3. **Sin ninguna firma no dice nada.** Estrenar un cartel en las 65 guías
 *      viejas sería agregar ruido a algo que el ámbar ya marca.
 *   4. **El papel, el PDF y la imagen siguen con las firmas enteras.**
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  resumenDeFirmas,
  etiquetaFirmaTransportista,
  etiquetaFirmaEntregador,
} from "@/lib/guias/firmas-resumen";

const leer = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const FIRMA = "data:image/png;base64,x";

describe("🔴 la línea dice la verdad, caso por caso", () => {
  it("con las dos: firmada por las dos partes", () => {
    const r = resumenDeFirmas({ firma_base64: FIRMA, firma_entregador_base64: FIRMA }, false);
    expect(r.completas).toBe(true);
    expect(r.hayAlguna).toBe(true);
    expect(r.texto).toBe("✓ Firmada por las dos partes");
  });

  it("🔴 con transportista externo, falta la del ENTREGADOR", () => {
    const r = resumenDeFirmas({ firma_base64: FIRMA }, false);
    expect(r.completas).toBe(false);
    expect(r.texto).toBe("Falta la firma del entregador");
  });

  it("🔴 y al revés, falta la del TRANSPORTISTA", () => {
    const r = resumenDeFirmas({ firma_entregador_base64: FIRMA }, false);
    expect(r.texto).toBe("Falta la firma del transportista");
  });

  it("🔴 en entrega directa los nombres son otros: chofer y cliente", () => {
    expect(resumenDeFirmas({ firma_base64: FIRMA }, true).texto).toBe("Falta la firma del cliente");
    expect(resumenDeFirmas({ firma_entregador_base64: FIRMA }, true).texto).toBe("Falta la firma del chofer");
    expect(etiquetaFirmaTransportista(true)).toBe("Firma del chofer");
    expect(etiquetaFirmaEntregador(true)).toBe("Firma del cliente");
    expect(etiquetaFirmaTransportista(false)).toBe("Firma del transportista");
    expect(etiquetaFirmaEntregador(false)).toBe("Firma del entregador");
  });

  it("🔴 sin ninguna firma no se dice NADA — son las 65 guías viejas", () => {
    for (const g of [{}, { firma_base64: "", firma_entregador_base64: "  " }, { firma_base64: null }]) {
      const r = resumenDeFirmas(g, false);
      expect(r.hayAlguna).toBe(false);
      expect(r.texto).toBe("");
      expect(r.completas).toBe(false);
    }
  });

  it("una cadena de espacios no cuenta como firma", () => {
    expect(resumenDeFirmas({ firma_base64: "   ", firma_entregador_base64: FIRMA }, false).texto)
      .toBe("Falta la firma del transportista");
  });
});

describe("🔴 esto es para MIRAR, no para FIRMAR", () => {
  it("el cuadro de firmar no encogió: 150 px de alto y todo el ancho", () => {
    const canvas = leer("src/app/guias/components/SignatureCanvas.tsx");
    expect(canvas).toContain("150");
    const form = leer("src/app/guias/components/DespachoForm.tsx");
    expect(form).toContain("SignatureCanvas");
    // 🔴 El plegado NO entra al despacho por ningún camino.
    expect(form).not.toContain("FirmasPlegadas");
    expect(form).not.toContain("resumenDeFirmas");
  });

  it("🔴 las dos pantallas de LECTURA usan el MISMO componente", () => {
    for (const ruta of [
      "src/app/guias/components/GuiasList.tsx",
      "src/app/guias/[id]/page.tsx",
    ]) {
      const src = leer(ruta);
      expect(src, ruta).toContain("<FirmasPlegadas");
      // Y ninguna vuelve a dibujar el cuadro a mano.
      expect(src, ruta).not.toContain('alt="Firma"');
    }
  });

  it("🔴 el papel, el PDF y la imagen siguen con la firma ENTERA", () => {
    // 🩸 Se mira la EXPRESIÓN que dibuja cada firma, no la palabra suelta:
    // apagar la condición (`{false ? (`) deja el nombre del campo escrito más
    // abajo y un `toContain` no lo nota.
    const papel = leer("src/app/guias/components/PrintDocument.tsx");
    expect(papel).toContain("{g.firma_base64 ? (");
    expect(papel).toContain("{g.firma_entregador_base64 ? (");
    expect(papel).toContain("<img src={g.firma_base64}");
    expect(papel).toContain("<img src={g.firma_entregador_base64}");
    const pdf = leer("src/lib/guias/pdf-guia.ts");
    expect(pdf).toContain("firma: g.firma_base64,");
    expect(pdf).toContain("firma: g.firma_entregador_base64,");
    const png = leer("src/lib/guias/png-guia.ts");
    expect(png).toContain("g.firma_base64,");
    expect(png).toContain("g.firma_entregador_base64,");
    for (const ruta of [
      "src/app/guias/components/PrintDocument.tsx",
      "src/lib/guias/pdf-guia.ts",
      "src/lib/guias/png-guia.ts",
    ]) {
      expect(leer(ruta), ruta).not.toContain("FirmasPlegadas");
      expect(leer(ruta), ruta).not.toContain("resumenDeFirmas");
    }
  });
});
