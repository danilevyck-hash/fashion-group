/* ─────────────────────────────────────────────────────────────────────────────
 * 🔴 CANDADO — NINGÚN PAPEL DEL SISTEMA SALE CON TEXTOS ENCIMADOS (6-oct-2026).
 *
 * Daniel: «no quiero tener que buscar PDF por PDF para ver que salga bien».
 * 🩸 El PDF de Comisiones de Rodrigo (Vistana, sep) salió con el título
 * encima del «$40.67».
 *
 * Arma TODOS los PDF y Excel de `lib/papeles-qa/catalogo.ts` con datos de
 * ejemplo (nunca la base) y:
 *   · PDF: ninguna caja de texto pisa otra, y ninguna se sale de la hoja;
 *   · Excel: el renglón «Total…» suma con fórmula y ninguna celda dice «#».
 *
 * Un papel nuevo se agrega al catálogo. Para mirarlos todos de un vistazo:
 * `npx tsx scripts/revisar-papeles.ts`.
 * ────────────────────────────────────────────────────────────────────────── */

import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Papel } from "@/lib/papeles-qa/catalogo";
import { revisarExcel, revisarPdf } from "@/lib/papeles-qa/revisar";

// 🔴 Sin base: el papel de Reclamos importa el cliente de Supabase al cargar.
vi.mock("@/lib/supabase-server", () => ({ supabaseServer: {}, HAS_SERVICE_ROLE: false }));

let PAPELES: Papel[] = [];
beforeAll(async () => {
  process.env.SESSION_SECRET ??= "papeles-sin-encimar";
  ({ PAPELES } = await import("@/lib/papeles-qa/catalogo"));
});

describe("🔴 los papeles del sistema", () => {
  it("el catálogo trae PDF y Excel de todos los módulos", () => {
    expect(PAPELES.filter((p) => p.tipo === "pdf").length).toBeGreaterThanOrEqual(20);
    expect(PAPELES.filter((p) => p.tipo === "xlsx").length).toBeGreaterThanOrEqual(10);
  });

  it("ningún PDF tiene textos encimados ni fuera de la hoja", async () => {
    const malos: string[] = [];
    for (const p of PAPELES.filter((x) => x.tipo === "pdf")) {
      for (const x of await revisarPdf(await p.generar())) malos.push(`${p.nombre} · hoja ${x.pagina} · ${x.tipo}: ${x.detalle}`);
    }
    expect(malos, malos.join("\n")).toEqual([]);
  }, 120_000);

  it("ningún Excel tiene totales fijos ni celdas con «#»", async () => {
    const malos: string[] = [];
    for (const p of PAPELES.filter((x) => x.tipo === "xlsx")) {
      for (const x of revisarExcel(await p.generar())) malos.push(`${p.nombre} · ${x}`);
    }
    expect(malos, malos.join("\n")).toEqual([]);
  }, 60_000);

  it("el detector SÍ caza un encimado (si no, el candado no mide nada)", async () => {
    const { default: jsPDF } = await import("jspdf");
    const doc = new jsPDF({ unit: "mm", format: "letter" });
    doc.setFontSize(9).text("Comisión — Rodrigo · Vistana · Septiembre 2026", 19, 27);
    doc.setFontSize(22).text("$40.67", 19, 33);
    doc.setFontSize(9).text("se sale de la hoja por la derecha", 200, 60);
    const tipos = (await revisarPdf(new Uint8Array(doc.output("arraybuffer")))).map((x) => x.tipo);
    expect(tipos).toContain("encimado");
    expect(tipos).toContain("fuera de la hoja");
  });

  it("y SÍ caza un total fijo y un «#» en el Excel", async () => {
    const XLSX = (await import("xlsx-js-style")).default;
    const ws = XLSX.utils.aoa_to_sheet([["Cliente", "Monto"], ["A", 10], ["Total", 10], ["#REF!", ""]]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Hoja");
    const malos = revisarExcel(new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" })));
    expect(malos.some((m) => m.includes("no fórmula"))).toBe(true);
    expect(malos.some((m) => m.includes("#REF!"))).toBe(true);
  });
});
