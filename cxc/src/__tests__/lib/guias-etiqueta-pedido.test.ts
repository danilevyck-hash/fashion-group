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
 *      id de archivo fijos y sin la fecha de creación (lleva el huso horario de la máquina), y el nuevo dio las mismas en los ocho casos. Si
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
/** La fecha de creación lleva el huso horario de la máquina: se saca de la huella. */
const huella = (e: EtiquetaFila, f: Formato) =>
  createHash("sha256").update(pdfDe(e, f).output().replace(/\/CreationDate \([^)]*\)/, "")).digest("hex");

/** Las huellas del generador de ANTES del pedido (medidas el 12-nov-2026). */
const ANTES: Array<[string, EtiquetaFila, Formato, string]> = [
  ["normal", ETQ, "carta", "2b5ab62e3f8d244d96405e808064c00fb820f1d70f18855076f18078fd09ae50"],
  ["normal", ETQ, "4x6", "3dfe3df7af33cb4fe233155e6e499dcaa09566774fd176576f65f1f339f9f53b"],
  ["nota", { ...ETQ, nota: "FRÁGIL" }, "carta", "451a5a4dd391ccb245565aaf04360edc541ada14873a8a9f0695b3bc8f52f5b6"],
  ["nota", { ...ETQ, nota: "FRÁGIL" }, "4x6", "88371b52973da25301568bfba1de87cc2dce2908b8faad5a856f0855424411f3"],
  ["largo", LARGO, "carta", "225acc4ea4d216e47919c4b16b7946b8d1604b6631213cb59e777755fb5e239b"],
  ["largo", LARGO, "4x6", "a78d8524e5fbcd0ad003d796b74405ded52b3bbf77183f9502d54096f9e6a00f"],
  ["traslado", TRASLADO, "carta", "fef188773b4bc84d6aadaee186cab1912929e36fc522ea844b4d4b32ae8d6496"],
  ["traslado", TRASLADO, "4x6", "498f68620aaa121a7b31200e83a02b941e557c57da190f6c19683871b2abd6eb"],
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
