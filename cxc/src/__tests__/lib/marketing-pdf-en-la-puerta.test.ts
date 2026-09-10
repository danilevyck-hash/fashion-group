/**
 * ─────────────────────────────────────────────────────────────────────────────
 * MARKETING › «+ REGISTRAR GASTO» — LA FACTURA EN PDF ENTRA POR LA PUERTA.
 * (las DECISIONES, en el módulo puro; la pantalla, en el `.tsx` hermano)
 *
 * Daniel, textual (10-sep-2026): *«Marketing PDF, que sea como la factura,
 * porque es una factura en PDF que con AI lee los campos y lo rellena solo.»*
 *
 * 🔴 Todo cuelga de `MARKETING_PDF_EN_LA_PUERTA`, y nace APAGADO: con el
 * interruptor en `false` el campo dice «Foto», acepta solo imágenes y un PDF
 * NO entra — la pantalla es exactamente la de hoy.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect } from "vitest";
import {
  MARKETING_PDF_EN_LA_PUERTA,
  MAX_PDF_MB,
  aceptaDeLaPuerta,
  clasificarArchivoDeLaPuerta,
  esImagen,
  esPdf,
  faltaLaFactura,
  mensajeArchivoPesado,
  rotuloBotonDeLaPuerta,
  rotuloDeLaPuerta,
} from "@/lib/marketing/pdf-en-la-puerta";

const MB = 1024 * 1024;
const pdf = (size = MB) => ({ name: "factura.pdf", type: "application/pdf", size });
const jpg = (size = MB) => ({ name: "foto.jpg", type: "image/jpeg", size });

describe("🔴 el interruptor nació APAGADO y Daniel lo prendió el 10-sep-2026", () => {
  // Cambió de dirección con nota fechada: Daniel, textual, «prende marketing».
  it("MARKETING_PDF_EN_LA_PUERTA es un booleano y hoy vale true", () => {
    expect(typeof MARKETING_PDF_EN_LA_PUERTA).toBe("boolean");
    expect(MARKETING_PDF_EN_LA_PUERTA).toBe(true);
  });

  it("apagado, el campo es el de hoy: dice «Foto» y solo acepta imágenes", () => {
    expect(aceptaDeLaPuerta(false)).toBe("image/*");
    expect(rotuloDeLaPuerta(false)).toBe("Foto");
    expect(rotuloBotonDeLaPuerta(false)).toBe("Subir foto");
  });

  it("encendido, el campo acepta la factura en PDF y lo dice", () => {
    expect(aceptaDeLaPuerta(true)).toBe("image/*,application/pdf");
    expect(rotuloDeLaPuerta(true)).toBe("Foto o factura");
    expect(rotuloBotonDeLaPuerta(true)).toBe("Subir foto o factura");
  });

  it("🔴 apagado, un PDF NO entra — y se dice el camino de hoy, no un error pelado", () => {
    const r = clasificarArchivoDeLaPuerta(pdf(), false);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.mensaje).toContain("paso siguiente");
      expect(r.mensaje).not.toMatch(/inválido|invalid|error/i);
    }
  });
});

describe("🔴 qué es lo que soltaron: exacto, nunca por parecido", () => {
  it("el PDF se reconoce por su tipo", () => {
    expect(esPdf("cualquiera", "application/pdf")).toBe(true);
  });

  it("y por la extensión cuando el navegador no manda tipo (pasa en Android)", () => {
    expect(esPdf("Factura 123.PDF", "")).toBe(true);
    expect(esPdf("  factura.pdf  ", "application/octet-stream")).toBe(true);
  });

  it("«pdf» en el medio del nombre NO lo convierte en PDF", () => {
    expect(esPdf("pdf-de-la-tienda.jpg", "image/jpeg")).toBe(false);
    expect(esPdf("factura.pdf.jpg", "image/jpeg")).toBe(false);
  });

  it("la imagen sigue siendo imagen", () => {
    expect(esImagen("image/jpeg")).toBe(true);
    expect(esImagen("image/heic")).toBe(true);
    expect(esImagen("application/pdf")).toBe(false);
  });
});

describe("🔴 el tope de 10 MB es el MISMO que el del paso 3", () => {
  it("MAX_PDF_MB vale 10 y su mensaje dice qué hacer", () => {
    expect(MAX_PDF_MB).toBe(10);
    expect(mensajeArchivoPesado(10)).toContain("10 MB");
    expect(mensajeArchivoPesado(10)).toContain("más liviano");
  });

  it("un PDF de 11 MB se rechaza en la puerta, con el mismo mensaje", () => {
    const r = clasificarArchivoDeLaPuerta(pdf(11 * MB), true);
    expect(r).toEqual({ ok: false, mensaje: mensajeArchivoPesado(MAX_PDF_MB) });
  });

  it("uno de 10 MB justos pasa (el tope no se pasa de estricto)", () => {
    expect(clasificarArchivoDeLaPuerta(pdf(10 * MB), true)).toEqual({ ok: true, clase: "pdf" });
  });

  it("⚠️ el tope NO aplica a la foto: es otra regla y no se tocó", () => {
    expect(clasificarArchivoDeLaPuerta(jpg(30 * MB), true)).toEqual({ ok: true, clase: "foto" });
  });
});

describe("🔴 la foto sigue siendo la foto", () => {
  it("encendido o apagado, una imagen entra igual que siempre", () => {
    expect(clasificarArchivoDeLaPuerta(jpg(), true)).toEqual({ ok: true, clase: "foto" });
    expect(clasificarArchivoDeLaPuerta(jpg(), false)).toEqual({ ok: true, clase: "foto" });
  });

  it("lo que no es ni foto ni factura se rechaza diciendo qué sí se puede", () => {
    const r = clasificarArchivoDeLaPuerta({ name: "planilla.xlsx", type: "application/vnd.ms-excel", size: 100 }, true);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.mensaje).toContain("foto o la factura en PDF");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cada gasto con su prueba, según el camino
// ─────────────────────────────────────────────────────────────────────────────

describe("🔴 en una COMPRA, sin factura no se guarda", () => {
  it("falta la factura y se dice CUÁL falta, no un botón apagado sin motivo", () => {
    expect(faltaLaFactura(false, true)).toBe("Falta la factura en PDF");
  });

  it("con la factura puesta ya no falta nada", () => {
    expect(faltaLaFactura(true, true)).toBeNull();
  });

  it("🔴 donde NO se pide (el interruptor apagado, la pantalla del proyecto, editar una vieja) nunca falta", () => {
    expect(faltaLaFactura(false, false)).toBeNull();
    expect(faltaLaFactura(true, false)).toBeNull();
  });
});
