// ============================================================================
// Candado del ZIP DE PROYECTO: los comprobantes de entrega de mobiliario VAN.
//
// El bug (12-ago-2026, proyecto "Apertura" de Nova Lux): el ZIP del proyecto
// traía las entregas en respaldo.xlsx y las carpetas de marca VACÍAS — el
// comprobante PDF no existía. generar-zip.ts nunca los generó (el ZIP global y
// el ZIP por marca sí, desde siempre). Lo que este archivo fija:
//
//   1. Un proyecto con entregas → el ZIP contiene el comprobante de CADA
//      entrega, en la carpeta de su marca.
//   2. Una entrega repartida entre DOS marcas no se pierde: una copia en cada
//      carpeta (misma regla que zip-marca: `marcasDeEntrega`, monto > 0), y
//      el papel mismo dice el reparto.
//   3. El comprobante va SIN bultos (es el papel de la marca, no el del envío
//      al cliente — #492) y con los montos correctos.
//   4. Una entrega sin datos de comprobante NO desaparece en silencio: queda
//      anotada en README_errores.txt y el resto del ZIP sale igual.
//   5. Barrido estático: la ruta datos-zip tiene que seguir mandando
//      `comprobantesEntrega` (sin eso el navegador no tiene con qué dibujar).
// ============================================================================
import { describe, it, expect, vi } from "vitest";
import fs from "fs";
import path from "path";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import {
  carpetasDeComprobante,
  generarZipProyecto,
  type DatosZipProyecto,
} from "@/lib/marketing/generar-zip";
import type { EntregaMueblePdfData } from "@/lib/marketing/pdf-entrega-mueble";
import type { EntregaConItems, MkMarca, MkProyecto } from "@/lib/marketing/types";

vi.mock("file-saver", () => ({ saveAs: vi.fn() }));

const CK_ID = "6dc27cc7-c061-440e-9dc9-915198852a47";
const TH_ID = "1673d8a7-582c-4568-8608-34c88b4b6ec6";

const MARCAS = [
  { id: CK_ID, nombre: "Calvin Klein" },
  { id: TH_ID, nombre: "Tommy Hilfiger" },
] as MkMarca[];

const proyecto = {
  id: "f0c57078-281c-4e34-8225-106eda59dce7",
  nombre: "Apertura",
  tienda: "Nova Lux, S.a.",
  tienda_codigo: "D-170",
  fecha_enviado: null,
  created_at: "2026-08-11T18:32:05.729407+00:00",
  anulado_en: null,
} as unknown as MkProyecto;

function entrega(
  id: string,
  total: number,
  totalPorMarca: Record<string, number> | null,
  created: string,
): EntregaConItems {
  return {
    id,
    proyecto_id: proyecto.id,
    total,
    total_por_marca: totalPorMarca,
    total_por_empresa_interna: {},
    notas: null,
    created_at: created,
    updated_at: created,
    items: [],
  } as unknown as EntregaConItems;
}

function comprobante(
  entregaId: string,
  numero: number,
  fecha: string,
  total: number,
  porMarca: Array<{ marca: string; monto: number }>,
): EntregaMueblePdfData {
  return {
    entregaId,
    numero,
    fecha,
    cliente: "Nova Lux, S.a.",
    clienteCodigo: "D-170",
    tienda: "Nova Lux, S.a.",
    proyecto: "Apertura",
    items: [
      { articulo: "Mueble de exhibición", cantidad: 10, bultos: 3, precioUnitario: total / 10 },
    ],
    porMarca,
    total,
    notas: null,
  };
}

const E_CK = entrega("e-ck", 2600, { [CK_ID]: 2600 }, "2026-08-11T18:33:16Z");
const E_TH = entrega("e-th", 2470, { [TH_ID]: 2470 }, "2026-08-12T16:19:51Z");

const COMP_CK = comprobante("e-ck", 22, "2026-08-11T18:33:16Z", 2600, [
  { marca: "Calvin Klein", monto: 2600 },
]);
const COMP_TH = comprobante("e-th", 24, "2026-08-12T16:19:51Z", 2470, [
  { marca: "Tommy Hilfiger", monto: 2470 },
]);

/** Corre el ensamblador real y devuelve el ZIP que habría bajado el navegador. */
async function zipDe(datos: DatosZipProyecto): Promise<JSZip> {
  vi.mocked(saveAs).mockClear();
  await generarZipProyecto(datos);
  expect(saveAs).toHaveBeenCalledTimes(1);
  const blob = vi.mocked(saveAs).mock.calls[0][0] as Blob;
  return JSZip.loadAsync(await blob.arrayBuffer());
}

async function pdfCrudo(zip: JSZip, ruta: string): Promise<string> {
  const f = zip.file(ruta);
  expect(f, `falta ${ruta} en el ZIP — sus archivos: ${Object.keys(zip.files).join(", ")}`).toBeTruthy();
  const buf = Buffer.from(await f!.async("arraybuffer"));
  expect(buf.subarray(0, 4).toString()).toBe("%PDF");
  return buf.toString("latin1");
}

const datosBase = (extra: Partial<DatosZipProyecto> = {}): DatosZipProyecto => ({
  proyecto,
  facturas: [],
  adjuntosFacturas: [],
  fotosProyecto: [],
  marcasInvolucradas: MARCAS,
  entregas: [E_CK, E_TH],
  comprobantesEntrega: { "e-ck": COMP_CK, "e-th": COMP_TH },
  ...extra,
});

describe("carpetasDeComprobante", () => {
  it("una marca → su carpeta", () => {
    expect(carpetasDeComprobante(E_CK, MARCAS)).toEqual(["Calvin Klein"]);
    expect(carpetasDeComprobante(E_TH, MARCAS)).toEqual(["Tommy Hilfiger"]);
  });

  it("repartida entre dos marcas → una copia en cada carpeta", () => {
    const split = entrega("e-split", 5070, { [CK_ID]: 2600, [TH_ID]: 2470 }, "2026-08-11T00:00:00Z");
    expect(carpetasDeComprobante(split, MARCAS)).toEqual(["Calvin Klein", "Tommy Hilfiger"]);
  });

  it("una marca con monto 0 NO recibe copia", () => {
    const e = entrega("e-0", 2600, { [CK_ID]: 2600, [TH_ID]: 0 }, "2026-08-11T00:00:00Z");
    expect(carpetasDeComprobante(e, MARCAS)).toEqual(["Calvin Klein"]);
  });

  it("sin marca asignada → raíz del ZIP (no se pierde)", () => {
    expect(carpetasDeComprobante(entrega("e-x", 100, null, "2026-01-01"), MARCAS)).toEqual([""]);
    expect(carpetasDeComprobante(entrega("e-y", 100, {}, "2026-01-01"), MARCAS)).toEqual([""]);
    // Marca que no está entre las involucradas (dato roto) → tampoco se pierde.
    expect(
      carpetasDeComprobante(entrega("e-z", 100, { "otra-marca": 100 }, "2026-01-01"), MARCAS),
    ).toEqual([""]);
  });
});

describe("generarZipProyecto — comprobantes de entrega (el caso Apertura)", () => {
  it("proyecto con 2 entregas y 0 facturas → el ZIP trae el comprobante de CADA una, en su carpeta de marca", async () => {
    const zip = await zipDe(datosBase());

    const ck = await pdfCrudo(zip, "Calvin Klein/2026-08-11 · Entrega de mobiliario ME-0022.pdf");
    const th = await pdfCrudo(zip, "Tommy Hilfiger/2026-08-12 · Entrega de mobiliario ME-0024.pdf");

    // Montos correctos, cada papel con el suyo.
    expect(ck).toContain("2,600.00");
    expect(th).toContain("2,470.00");
    expect(ck).toContain("ME-0022");
    expect(th).toContain("ME-0024");

    // El Excel sigue estando (no cambia con este fix).
    expect(zip.file("respaldo.xlsx")).toBeTruthy();
    // Y no hay errores anotados.
    expect(zip.file("README_errores.txt")).toBeNull();
  });

  it("el comprobante va SIN bultos: es el papel de la marca, no la nota de envío", async () => {
    const zip = await zipDe(datosBase());
    const ck = await pdfCrudo(zip, "Calvin Klein/2026-08-11 · Entrega de mobiliario ME-0022.pdf");
    expect(ck).toContain("COMPROBANTE DE ENTREGA");
    expect(ck).not.toContain("NOTA DE ENTREGA");
    // La columna Bultos no existe en este papel aunque el dato venga (bultos: 3).
    expect(ck).not.toContain("Bultos");
  });

  it("una entrega repartida entre 2 marcas sale en las DOS carpetas, con el reparto escrito en el papel", async () => {
    const split = entrega("e-split", 5070, { [CK_ID]: 2600, [TH_ID]: 2470 }, "2026-08-11T00:00:00Z");
    const compSplit = comprobante("e-split", 30, "2026-08-11T00:00:00Z", 5070, [
      { marca: "Calvin Klein", monto: 2600 },
      { marca: "Tommy Hilfiger", monto: 2470 },
    ]);
    const zip = await zipDe(
      datosBase({ entregas: [split], comprobantesEntrega: { "e-split": compSplit } }),
    );

    const ck = await pdfCrudo(zip, "Calvin Klein/2026-08-11 · Entrega de mobiliario ME-0030.pdf");
    const th = await pdfCrudo(zip, "Tommy Hilfiger/2026-08-11 · Entrega de mobiliario ME-0030.pdf");
    // Es EL MISMO papel (con el reparto adentro), no dos papeles que digan
    // montos distintos.
    expect(ck).toBe(th);
    expect(ck).toContain("Calvin Klein $2,600.00");
    expect(ck).toContain("Tommy Hilfiger $2,470.00");
    expect(ck).toContain("5,070.00");
  });

  it("entrega sin marca asignada → el comprobante va a la raíz del ZIP", async () => {
    const suelta = entrega("e-suelta", 300, {}, "2026-08-11T00:00:00Z");
    const compSuelta = comprobante("e-suelta", 31, "2026-08-11T00:00:00Z", 300, []);
    const zip = await zipDe(
      datosBase({ entregas: [suelta], comprobantesEntrega: { "e-suelta": compSuelta } }),
    );
    await pdfCrudo(zip, "2026-08-11 · Entrega de mobiliario ME-0031.pdf");
  });

  it("payload sin datos de comprobante → NO se cae ni se calla: queda en README_errores.txt", async () => {
    const zip = await zipDe(datosBase({ comprobantesEntrega: undefined }));
    const readme = zip.file("README_errores.txt");
    expect(readme).toBeTruthy();
    const texto = await readme!.async("string");
    expect(texto).toContain("comprobante_entrega");
    expect(texto).toContain("e-ck");
    expect(texto).toContain("e-th");
    // El resto del ZIP sale igual.
    expect(zip.file("respaldo.xlsx")).toBeTruthy();
  });

  it("un proyecto sin entregas no genera comprobantes ni errores", async () => {
    const zip = await zipDe(datosBase({ entregas: [], comprobantesEntrega: {} }));
    const pdfs = Object.keys(zip.files).filter((n) => n.endsWith(".pdf"));
    expect(pdfs).toEqual([]);
    expect(zip.file("README_errores.txt")).toBeNull();
  });
});

describe("barrido estático — la cadena servidor → navegador no se puede cortar", () => {
  const leer = (rel: string): string =>
    fs.readFileSync(path.join(process.cwd(), rel), "utf8");

  it("la ruta datos-zip sigue cargando y mandando comprobantesEntrega", () => {
    const src = leer("src/app/api/marketing/proyectos/[id]/datos-zip/route.ts");
    expect(src).toContain("cargarComprobantes");
    expect(src).toContain("comprobantesEntrega");
  });

  it("generar-zip dibuja el comprobante SIN bultos (el papel de la marca)", () => {
    const src = leer("src/lib/marketing/generar-zip.ts");
    expect(src).toMatch(/incluirBultos:\s*false/);
    expect(src).toContain("carpetasDeComprobante");
  });
});
