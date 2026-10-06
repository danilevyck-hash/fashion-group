/* ─────────────────────────────────────────────────────────────────────────────
 * 🔴 CANDADO — LOS COLORES DE LOS PDF SALEN SOLO DE LA PALETA DEL PAPEL
 * (6-oct-2026, `lib/pdf-estilo.ts`).
 *
 * Daniel: «Algunos PDF en azul, gris, negro. No hay congruencia». Con el
 * estilo único prendido (aquí por `PAPELES_ESTILO_UNICO=1`, sin tocar el
 * interruptor), arma TODOS los PDF del catálogo y lee cada color de relleno,
 * texto y raya del archivo: ninguno puede salir de `PALETA_PAPEL`. Solo se
 * saltan los papeles con `estiloPropio` (etiquetas térmicas y piezas de marca),
 * cada uno con su porqué en el catálogo.
 * ────────────────────────────────────────────────────────────────────────── */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Papel } from "@/lib/papeles-qa/catalogo";

vi.mock("@/lib/supabase-server", () => ({ supabaseServer: {}, HAS_SERVICE_ROLE: false }));

let PAPELES: Papel[] = [];
let PALETA: ReadonlySet<string> = new Set();
let revisar: typeof import("@/lib/papeles-qa/revisar");

beforeAll(async () => {
  process.env.SESSION_SECRET ??= "papeles-paleta-unica";
  process.env.PAPELES_ESTILO_UNICO = "1";
  vi.resetModules();
  ({ PAPELES } = await import("@/lib/papeles-qa/catalogo"));
  const estilo = await import("@/lib/pdf-estilo");
  expect(estilo.ESTILO_UNICO).toBe(true);
  PALETA = estilo.PALETA_PAPEL;
  revisar = await import("@/lib/papeles-qa/revisar");
});

// La variable es del proceso: se devuelve como estaba para no prender el estilo en otros archivos.
afterAll(() => {
  delete process.env.PAPELES_ESTILO_UNICO;
  vi.resetModules();
});

describe("🔴 un solo estilo de papel", () => {
  it("el interruptor sigue apagado en el código (no se publica)", async () => {
    const { PAPELES_ESTILO_UNICO_2026_10 } = await import("@/lib/pdf-estilo");
    expect(PAPELES_ESTILO_UNICO_2026_10).toBe(false);
  });

  it("las únicas excepciones son las etiquetas térmicas y las piezas de marca, con su porqué", () => {
    const propios = PAPELES.filter((p) => p.estiloPropio);
    expect(propios.map((p) => p.nombre).sort()).toEqual([
      "Catálogos — catálogo Reebok",
      "Catálogos — pedido Joybees",
      "Catálogos — pedido Reebok",
      "Guías — etiquetas 4x6",
      "Guías — etiquetas carta",
    ]);
  });

  it("ningún PDF usa un color fuera de la paleta, y ninguno se encima", async () => {
    const malos: string[] = [];
    for (const p of PAPELES.filter((x) => x.tipo === "pdf" && !x.estiloPropio)) {
      const bytes = await p.generar();
      for (const x of await revisar.coloresFueraDePaleta(bytes.slice(), PALETA)) malos.push(`${p.nombre} · hoja ${x.pagina} · ${x.detalle}`);
      for (const x of await revisar.revisarPdf(bytes.slice())) malos.push(`${p.nombre} · hoja ${x.pagina} · ${x.tipo}: ${x.detalle}`);
    }
    expect(malos, malos.join("\n")).toEqual([]);
  }, 120_000);

  it("el detector SÍ caza el azul marino de antes", async () => {
    const { default: jsPDF } = await import("jspdf");
    const doc = new jsPDF({ unit: "mm", format: "letter" });
    doc.setFillColor(27, 58, 92).rect(10, 10, 50, 8, "F");
    const malos = await revisar.coloresFueraDePaleta(new Uint8Array(doc.output("arraybuffer")), PALETA);
    expect(malos.map((m) => m.detalle)).toContain("#1c3b5c");
  });

  it("la tabla común lleva a la paleta lo que pida el módulo y pinta el negativo en rojo", async () => {
    const { default: jsPDF } = await import("jspdf");
    const { default: autoTable } = await import("@/lib/pdf-tabla");
    const doc = new jsPDF({ unit: "mm", format: "letter" });
    autoTable(doc, {
      head: [["Cliente", "Saldo"]],
      body: [["A", "$10.00"], ["B", "-$5.00"]],
      headStyles: { fillColor: [27, 58, 92], textColor: [255, 255, 255] },
      alternateRowStyles: { fillColor: [248, 249, 249] },
    });
    const bytes = new Uint8Array(doc.output("arraybuffer"));
    expect(await revisar.coloresFueraDePaleta(bytes, PALETA)).toEqual([]);
    expect(new TextDecoder("latin1").decode(bytes)).toContain("0.863 0.149 0.149 rg"); // red-600
  });
});
