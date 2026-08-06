// ─────────────────────────────────────────────────────────────────────────────
// La guía que se COMPARTE tiene que ser la misma que se IMPRIME.
//
// Daniel: *"al finalizar una guia de despacho, quiero un boton de compartir
// guia (o pdf) o imagen asi se comparta por whatsapp u otros medios."*
//
// ⚠️ EL RIESGO NO ES QUE EL PDF SALGA FEO: es que se separe del papel. Son dos
// dibujos del mismo documento —`PrintDocument.tsx` (pantalla e impresora) y
// `pdf-guia.ts` (el archivo que se manda)— y la guía es el RESPALDO FIRMADO de
// una entrega. Si alguien agrega un campo a la hoja y no al PDF, lo que viaja
// por WhatsApp deja de ser lo que se firmó, y nadie se entera hasta que hay un
// reclamo.
//
// Por eso el candado principal no mira píxeles: lee los DOS archivos y exige
// que todo campo de la guía que la hoja pinta también esté en el PDF.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { construirPdfGuia, nombreArchivoGuia } from "@/lib/guias/pdf-guia";
import { fmtGuia } from "@/lib/format";
import type { Guia } from "@/app/guias/components/types";

const raiz = process.cwd();
const hoja = readFileSync(path.join(raiz, "src/app/guias/components/PrintDocument.tsx"), "utf8");
const pdf = readFileSync(path.join(raiz, "src/lib/guias/pdf-guia.ts"), "utf8");
const detalle = readFileSync(path.join(raiz, "src/app/guias/components/GuiaDetail.tsx"), "utf8");
const compartir = readFileSync(path.join(raiz, "src/lib/compartir-archivo.ts"), "utf8");

const GUIA: Guia = {
  id: "g1",
  numero: 412,
  fecha: "2026-08-05",
  transportista: "Transporte Rápido S.A.",
  placa: "AB-1234",
  observaciones: "Dos bultos van en caja aparte.",
  total_bultos: 7,
  item_count: 2,
  monto_total: 0,
  estado: "Completada",
  receptor_nombre: "Luis Pérez",
  cedula: "8-888-8888",
  entregado_por: "Angela García",
  numero_guia_transp: "GT-99120",
  tipo_despacho: "transportista",
  // 1×1 PNG transparente — sirve para contar imágenes sin arrastrar un archivo.
  firma_base64:
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  firma_entregador_base64:
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  guia_items: [
    { orden: 1, cliente: "CITY MALL DAVID", direccion: "David, Chiriquí", empresa: "Fashion Shoes", facturas: "F-1001", bultos: 4, numero_guia_transp: "" },
    { orden: 2, cliente: "LA FRONTERA", direccion: "Paso Canoa", empresa: "Fashion Wear", facturas: "F-1002, F-1003", bultos: 3, numero_guia_transp: "" },
  ],
};

describe("🔴 el PDF no se puede separar del papel", () => {
  // Campos de la guía que la hoja impresa pinta (`g.<campo>`), menos los que
  // son de armado interno y no dato de la guía.
  const IGNORAR = new Set(["guia_items"]);

  it("todo campo que imprime PrintDocument está también en el PDF", () => {
    const campos = [...new Set([...hoja.matchAll(/\bg\.([a-z_][a-z0-9_]*)/gi)].map((m) => m[1]))]
      .filter((c) => !IGNORAR.has(c));
    expect(campos.length).toBeGreaterThan(8); // que el regex no se haya quedado mudo
    const faltantes = campos.filter((c) => !pdf.includes(`.${c}`));
    expect(faltantes, `campos en la hoja que el PDF no dibuja: ${faltantes.join(", ")}`).toEqual([]);
  });

  it("toda columna de la tabla está también en el PDF", () => {
    const cols = [...new Set([...hoja.matchAll(/\bitem\.([a-z_][a-z0-9_]*)/gi)].map((m) => m[1]))];
    expect(cols).toContain("bultos");
    expect(cols.filter((c) => !pdf.includes(`.${c}`))).toEqual([]);
  });

  it("el texto legal es EL MISMO, palabra por palabra", () => {
    // Es la cláusula de responsabilidad del transportista: que difiera entre lo
    // firmado en papel y lo mandado por WhatsApp sería el peor error posible.
    const enHoja = /La firma del transportista constituye aceptacion expresa[\s\S]{0,400}?transportista\./.exec(
      hoja.replace(/\s+/g, " "),
    );
    expect(enHoja).not.toBeNull();
    expect(pdf.replace(/[\s"+]+/g, " ")).toContain(enHoja![0].replace(/\s+/g, " "));
  });

  it("distingue entrega directa de transportista externo, igual que la hoja", () => {
    expect(pdf).toContain('g.tipo_despacho === "directo"');
    expect(pdf).toContain("Entrega directa");
    expect(pdf).toContain("Transportista externo");
    expect(pdf).toContain("Recibido Conforme — Transportista");
  });
});

describe("🔴 el PDF sale de verdad", () => {
  it("genera un PDF con los datos de la guía", () => {
    const salida = construirPdfGuia(GUIA).output("datauristring");
    expect(salida.startsWith("data:application/pdf")).toBe(true);
    expect(salida.length).toBeGreaterThan(5000);
  });

  it("dibuja logo y las DOS firmas — no se pierden en un catch mudo", () => {
    // `addImage` va en try/catch (un base64 roto desaparecería sin error), así
    // que se cuentan los XObject de imagen del PDF ya armado.
    const crudo = construirPdfGuia(GUIA).output("arraybuffer");
    const texto = Buffer.from(crudo).toString("latin1");
    const imagenes = (texto.match(/\/Subtype\s*\/Image/g) ?? []).length;
    expect(imagenes).toBeGreaterThanOrEqual(3); // logo + 2 firmas
  });

  it("una guía sin firmas ni observaciones no revienta", () => {
    const pelada: Guia = { ...GUIA, firma_base64: undefined, firma_entregador_base64: undefined, observaciones: "", receptor_nombre: "", cedula: "" };
    expect(() => construirPdfGuia(pelada).output("blob")).not.toThrow();
  });

  it("una guía de entrega directa usa el chofer, no el transportista", () => {
    const directa: Guia = { ...GUIA, tipo_despacho: "directo", nombre_chofer: "Marcos R." };
    expect(() => construirPdfGuia(directa).output("blob")).not.toThrow();
  });

  it("el nombre del archivo dice qué es y de cuándo", () => {
    // Se lee en el chat de WhatsApp: "Guia-000412-2026-08-05.pdf" y no "documento.pdf".
    const n = nombreArchivoGuia(GUIA);
    expect(n).toBe(`Guia-${fmtGuia(GUIA.numero)}-2026-08-05.pdf`);
    expect(n).toContain("412");
  });
});

describe("🔴 compartir de verdad abre la hoja del sistema", () => {
  it("pregunta canShare({files}), no solo si existe share", () => {
    // `navigator.share` existe en navegadores que NO aceptan archivos: mandarle
    // un archivo ahí abre una hoja vacía o revienta.
    expect(compartir).toContain("canShare({ files: [archivo] })");
  });

  it("si el navegador no comparte archivos, lo descarga", () => {
    expect(compartir).toContain("descargarArchivo(archivo)");
    expect(compartir).toContain('return "descargado"');
  });

  it("cerrar la hoja sin elegir nada NO es un error", () => {
    expect(compartir).toContain('e.name === "AbortError"');
    expect(compartir).toContain('return "cancelado"');
  });

  it("⚠️ el PDF se arma ANTES de share — Safari exige el gesto del toque", () => {
    // Un `await` entre el clic y `share()` hace que iOS deje de contarlo como
    // gesto y lo bloquee con NotAllowedError.
    const cuerpo = /async function compartir\(\)[\s\S]*?\n  }/.exec(detalle)?.[0] ?? "";
    expect(cuerpo).toContain("construirPdfGuia(guia).output(\"blob\")");
    // Lo que importa: nada se espera ANTES de armar el archivo. El único
    // `await` permitido es el de la propia hoja de compartir.
    const antesDelPdf = cuerpo.slice(0, cuerpo.indexOf("construirPdfGuia"));
    expect(antesDelPdf).not.toContain("await ");
    expect((cuerpo.match(/await /g) ?? []).length).toBe(1);
  });

  it("el botón vive en la guía y muestra que está trabajando", () => {
    expect(detalle).toContain("Compartir");
    expect(detalle).toContain("Preparando…");
    expect(detalle).toContain('min-h-[44px]'); // blanco táctil de la casa
  });

  it("no se pierde el botón Imprimir", () => {
    expect(detalle).toContain("window.print()");
    expect(detalle).toContain("Imprimir");
  });

  it("la ruta /guias tiene ToastProvider — sin él la pantalla se cae", () => {
    const layout = readFileSync(path.join(raiz, "src/app/guias/layout.tsx"), "utf8");
    expect(layout).toContain("ToastProvider");
  });
});
