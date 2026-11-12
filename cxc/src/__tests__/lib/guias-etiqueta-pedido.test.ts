/**
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔴 DESPACHOS › ETIQUETAS — EL N.° DE PEDIDO, OPCIONAL (12-nov-2026)
 *
 * Daniel aprobó: el N.° de pedido sale como UNA línea chica, normal y gris
 * debajo de la factura («Pedido 16-000002926»), del mismo tamaño y color que la
 * fecha del encabezado y sin rótulo. La factura queda igual.
 *
 * Lo que este candado exige:
 *   1. 🔴 SIN PEDIDO EL PAPEL ES IDÉNTICO AL DE ANTES. Las huellas de abajo se
 *      sacaron del generador ANTERIOR al cambio (commit 142b0fae), con fecha y
 *      id de archivo fijos, y el nuevo dio las mismas en los ocho casos. Si
 *      cambian sin que nadie haya tocado el papel a propósito, algo se movió.
 *   2. Con pedido, la línea sale debajo de la factura y ARRIBA del rótulo
 *      «Cliente», sin pisarlo, también en el caso apretado de carta.
 *   3. Un traslado no imprime pedido (no tiene factura).
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect } from "vitest";
import { createHash } from "crypto";

import { construirPdfEtiquetas, datosDeEtiqueta } from "@/lib/guias/pdf-etiquetas";
import type { EtiquetaFila } from "@/lib/guias/etiquetas";

const ETQ: EtiquetaFila = {
  id: 1, empresa_key: "fashion_shoes", empresa: "Fashion Shoes", switch_factura_id: 52558,
  secuencial: "11-000002558", fecha_factura: "2026-09-18", cliente_codigo: "D-170",
  cliente_nombre: "Nova Lux, S.A.", destino: "Paso Canoas", cajas: 14,
  creado_en: "2026-09-18T14:41:00-05:00", guia_numero: null,
};
const LARGO: EtiquetaFila = {
  ...ETQ,
  cliente_nombre: "Distribuidora Internacional de Calzado del Pacífico, S.A.",
  destino: "Calle 19 Central, al lado de la joyería Super Oro",
  nota: "NO APILAR MÁS",
};
const TRASLADO: EtiquetaFila = { ...ETQ, switch_factura_id: null, secuencial: "Traslado", nota: "MUEBLES" };

type Formato = "carta" | "4x6";

function pdfDe(e: EtiquetaFila, f: Formato) {
  const doc = construirPdfEtiquetas(datosDeEtiqueta(e), [1, 2, 3], f);
  doc.setCreationDate(new Date(0));
  doc.setFileId("0".repeat(32));
  return doc;
}
const huella = (e: EtiquetaFila, f: Formato) => createHash("sha256").update(pdfDe(e, f).output()).digest("hex");

/** Las huellas del generador de ANTES del pedido (medidas el 12-nov-2026). */
const ANTES: Array<[string, EtiquetaFila, Formato, string]> = [
  ["normal", ETQ, "carta", "b5f44887a28742c465f99a18ed9b732109cc4cda9f0941d8581f551922043754"],
  ["normal", ETQ, "4x6", "aff234d886bfaa8aab1d3ab4c456ea2f6be7a3bc7ee560f05e3585aa0d81f904"],
  ["nota", { ...ETQ, nota: "FRÁGIL" }, "carta", "b31cda7d87f8891d925a2d2f172e0bc4f3a5e2b353a694dc4f6ea2545df9f98f"],
  ["nota", { ...ETQ, nota: "FRÁGIL" }, "4x6", "dd557d2702f92f40122556e157fc1f8d43624aff21915fd5ef0ba03ecd0b0493"],
  ["largo", LARGO, "carta", "a3caa174819aacb614ca4c2ce65f3718ed1c371d337951d3f69fa8e8a479184d"],
  ["largo", LARGO, "4x6", "5ab6e76239d95d52ba985eeb39dd202bb8f0143c7f28ee3f5fb8fda1aedb7184"],
  ["traslado", TRASLADO, "carta", "8671c6dc1fb8b55cf3bd5927bc03b02a7e985f6cf8c3f99bcffc3757ab00e17b"],
  ["traslado", TRASLADO, "4x6", "262c9a4eff12483d862d53c9b9e5a820047cc87495c829e5690324142f78ca0b"],
];

interface Pieza { texto: string; pt: number; gris: string; negrita: boolean; y: number }

/** Las piezas de texto de la PRIMERA etiqueta, con su tamaño, gris y altura (pt desde abajo). */
function piezas(e: EtiquetaFila, f: Formato): Pieza[] {
  const crudo = pdfDe(e, f).output();
  const fuentes = new Map<string, boolean>();
  for (const m of crudo.matchAll(/\/BaseFont \/(Helvetica(?:-Bold)?)[^>]*?\/Name \/(F\d+)/g)) fuentes.set(m[2], m[1].endsWith("Bold"));
  const pagina = crudo.split("endstream")[0];
  const re = /([\d.]+) g|\/(F\d+) ([\d.]+) Tf|([-\d.]+)\s+([-\d.]+)\s+Td\s*\(((?:[^()\\]|\\.)*)\)\s*Tj/g;
  let gris = "0", pt = 0, negrita = false;
  const out: Pieza[] = [];
  for (const m of pagina.matchAll(re)) {
    if (m[1]) gris = m[1];
    else if (m[2]) { pt = Number(m[3]); negrita = fuentes.get(m[2]) ?? false; }
    else out.push({ texto: m[6], pt, gris, negrita, y: Number(m[5]) });
  }
  return out;
}

describe("🔴 sin pedido, el papel es idéntico al de antes", () => {
  it.each(ANTES)("%s · %s", (_n, e, f, antes) => {
    expect(huella(e, f)).toBe(antes);
    expect(huella({ ...e, pedido: null }, f)).toBe(antes);
    expect(huella({ ...e, pedido: "" }, f)).toBe(antes);
  });
});

describe("con pedido: una línea chica, normal y gris debajo de la factura", () => {
  it.each([["carta", ETQ], ["4x6", ETQ], ["carta", LARGO], ["4x6", LARGO]] as const)("%s", (f, e) => {
    const p = piezas({ ...e, pedido: "16-000002926" }, f);
    const linea = p.find((x) => x.texto === "Pedido 16-000002926");
    expect(linea).toBeDefined();
    const fecha = p.find((x) => /\d{1,2} \w{3} \d{4}|\d{4}/.test(x.texto) && x.gris === linea!.gris && x !== linea);
    expect(linea!.negrita).toBe(false);
    expect(fecha?.pt).toBe(linea!.pt);
    const factura = p.find((x) => x.texto === "11-000002558")!;
    const cliente = p.find((x) => x.texto === "Cliente")!;
    // En PDF la y crece hacia ARRIBA: debajo de la factura y arriba del rótulo «Cliente».
    expect(linea!.y).toBeLessThan(factura.y);
    expect(linea!.y).toBeGreaterThan(cliente.y + cliente.pt * 0.718);
    // La factura no cambia.
    const sin = piezas(e, f).find((x) => x.texto === "11-000002558")!;
    expect([factura.pt, factura.y, factura.negrita]).toEqual([sin.pt, sin.y, sin.negrita]);
  });

  it("un traslado no imprime pedido", () => {
    expect(datosDeEtiqueta({ ...TRASLADO, pedido: "16-000002926" }).pedido).toBeUndefined();
    expect(piezas({ ...TRASLADO, pedido: "16-000002926" }, "carta").some((x) => x.texto.startsWith("Pedido"))).toBe(false);
  });
});
