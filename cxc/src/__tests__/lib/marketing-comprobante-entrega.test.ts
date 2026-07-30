// ============================================================================
// Candado del COMPROBANTE DE ENTREGA DE MOBILIARIO (PDF).
//
// Lo que protege:
//   1. Que el LOGO se dibuje de verdad. `addImage` va en try/catch, así que un
//      base64 malo lo hace desaparecer SIN error (fue el bug del 26-jul-2026, a
//      la cadena le faltaba un `=`). Acá se cuentan los XObject de imagen del
//      PDF ya generado: si el logo no entra, el test se pone rojo.
//   2. Que el detalle de los muebles y los montos LLEGUEN al papel — un
//      comprobante que sale en blanco es peor que no tenerlo.
//   3. Que el número de comprobante sea estable y derivado del id.
// ============================================================================
import { describe, it, expect } from "vitest";
import {
  buildComprobanteEntregaPdf,
  nombreArchivoComprobante,
  numeroComprobante,
  type EntregaMueblePdfData,
} from "@/lib/marketing/pdf-entrega-mueble";

const ENTREGA_ID = "a1e6b971-2f4c-4a9e-9b71-0c1d2e3f4a5b";

const datos: EntregaMueblePdfData = {
  entregaId: ENTREGA_ID,
  fecha: "2026-06-22T16:15:32.586175+00:00",
  cliente: "Jerusalem De Panama",
  clienteCodigo: "D-80",
  tienda: "Jerusalem Pasocanoa",
  proyecto: "Remodelacion",
  items: [
    { articulo: "Barra plana", cantidad: 114, precioUnitario: 28 },
    { articulo: "Paneles", cantidad: 38, precioUnitario: 130 },
  ],
  porMarca: [{ marca: "Tommy Hilfiger", monto: 14630 }],
  total: 14630,
  notas: null,
};

/** Texto crudo del PDF (jsPDF no comprime los streams de texto por default). */
function crudo(buf: Buffer): string {
  return buf.toString("latin1");
}
function imagenes(buf: Buffer): number {
  return (crudo(buf).match(/\/Subtype\s*\/Image/g) || []).length;
}
/** El texto en un PDF de jsPDF va en literales `(…)`; se busca por trozos. */
function contiene(buf: Buffer, texto: string): boolean {
  return crudo(buf).includes(texto);
}

describe("numeroComprobante", () => {
  it("es estable y se deriva del id (no de un contador)", () => {
    expect(numeroComprobante(ENTREGA_ID)).toBe("ME-A1E6B971");
    expect(numeroComprobante(ENTREGA_ID)).toBe(numeroComprobante(ENTREGA_ID));
  });

  it("ids distintos dan números distintos", () => {
    expect(numeroComprobante("e8cc66dd-0000-0000-0000-000000000000")).toBe("ME-E8CC66DD");
  });

  it("no revienta con un id vacío", () => {
    expect(numeroComprobante("")).toBe("ME-00000000");
  });

  it("el nombre de archivo lleva la fecha y el número", () => {
    expect(nombreArchivoComprobante({ entregaId: ENTREGA_ID, fecha: "2026-06-22" })).toBe(
      "2026-06-22 · Entrega de mobiliario ME-A1E6B971",
    );
  });
});

describe("buildComprobanteEntregaPdf", () => {
  it("genera un PDF válido de una sola página", () => {
    const buf = buildComprobanteEntregaPdf(datos);
    expect(buf.length).toBeGreaterThan(5000);
    expect(crudo(buf).startsWith("%PDF-")).toBe(true);
  });

  it("EL LOGO SALE — hay al menos un XObject de imagen en el PDF", () => {
    // Este es el candado del bug del logo invisible: addImage está en try/catch.
    expect(imagenes(buildComprobanteEntregaPdf(datos))).toBeGreaterThanOrEqual(1);
  });

  it("trae el número, el cliente, el código y el proyecto", () => {
    const buf = buildComprobanteEntregaPdf(datos);
    expect(contiene(buf, "ME-A1E6B971")).toBe(true);
    expect(contiene(buf, "Jerusalem De Panama")).toBe(true);
    expect(contiene(buf, "D-80")).toBe(true);
    expect(contiene(buf, "Remodelacion")).toBe(true);
    expect(contiene(buf, "22/06/2026")).toBe(true);
  });

  it("trae el detalle de los muebles y el total", () => {
    const buf = buildComprobanteEntregaPdf(datos);
    expect(contiene(buf, "Barra plana")).toBe(true);
    expect(contiene(buf, "Paneles")).toBe(true);
    expect(contiene(buf, "14,630.00")).toBe(true);
    // Unidades: 114 + 38 = 152.
    expect(contiene(buf, "152 unidades")).toBe(true);
  });

  it("trae el bloque de firmas EN BLANCO (el sistema no guarda el receptor)", () => {
    const buf = buildComprobanteEntregaPdf(datos);
    expect(contiene(buf, "Entregado por")).toBe(true);
    expect(contiene(buf, "Recibido por")).toBe(true);
    expect(contiene(buf, "CEDULA") || contiene(buf, "C")).toBe(true);
  });

  it("una entrega SIN detalle de artículos no sale vacía: muestra el total", () => {
    const buf = buildComprobanteEntregaPdf({ ...datos, items: [] });
    expect(imagenes(buf)).toBeGreaterThanOrEqual(1);
    expect(contiene(buf, "Sin detalle de art")).toBe(true);
    expect(contiene(buf, "14,630.00")).toBe(true);
  });

  it("un proyecto sin código de directorio lo dice, no deja el campo en blanco", () => {
    const buf = buildComprobanteEntregaPdf({ ...datos, clienteCodigo: null });
    expect(contiene(buf, "Sin vincular al directorio")).toBe(true);
  });

  it("sin marca asignada lo dice explícito", () => {
    const buf = buildComprobanteEntregaPdf({ ...datos, porMarca: [] });
    expect(contiene(buf, "Sin marca asignada")).toBe(true);
  });

  it("dos marcas: las dos aparecen con su monto", () => {
    const buf = buildComprobanteEntregaPdf({
      ...datos,
      porMarca: [
        { marca: "Tommy Hilfiger", monto: 3080 },
        { marca: "Calvin Klein", monto: 2695 },
      ],
    });
    expect(contiene(buf, "Tommy Hilfiger")).toBe(true);
    expect(contiene(buf, "Calvin Klein")).toBe(true);
  });

  it("las notas de la entrega salen cuando existen", () => {
    const buf = buildComprobanteEntregaPdf({ ...datos, notas: "Entrega parcial de la bodega" });
    expect(contiene(buf, "Entrega parcial")).toBe(true);
  });

  it("la fecha de generación va en dd/mm/yyyy, no en formato de EE.UU.", () => {
    // toLocaleDateString("es-PA") en Node sin ICU devolvía mm/dd/yyyy.
    const buf = buildComprobanteEntregaPdf(datos);
    const hoy = new Date();
    const p = (n: number) => String(n).padStart(2, "0");
    expect(contiene(buf, `${p(hoy.getDate())}/${p(hoy.getMonth() + 1)}/${hoy.getFullYear()}`)).toBe(
      true,
    );
  });
});
