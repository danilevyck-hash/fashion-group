// ─────────────────────────────────────────────────────────────────────────────
// 🔴 CANDADO — «MANDAR» LA COMISIÓN AL VENDEDOR (25-sep-2026, la «9r»).
//
// 🩸 QUÉ VINO A ARREGLAR: el papel de un vendedor se BAJABA al teléfono y de
// ahí había que buscarlo en la carpeta de descargas y adjuntarlo a mano.
//
// 🩸 Y QUÉ SE CORRIGIÓ EL MISMO DÍA. La primera versión abría una hoja NUESTRA
// con tres salidas —Correo · WhatsApp · Copiar el link—, y dos de ellas colgaban
// de un cajón de Storage (`comisiones-papeles`) que nunca existió. Daniel,
// textual: *«¿Copiar link y WhatsApp es necesario? Si se me abre el PDF como en
// Guías, se manda a su chat y ya; así quitas esos botones extra»*.
//
// 🔴 LO QUE ESTE CANDADO SOSTIENE:
//   1. «Mandar» abre la HOJA DE COMPARTIR DEL TELÉFONO con el PDF, por la MISMA
//      puerta que «Compartir» de Guías (`lib/compartir-archivo.ts`), y en la
//      computadora lo DESCARGA.
//   2. No hay «Copiar el link» ni «WhatsApp» ni un formulario de correo, y no
//      queda una ruta ni un cajón de Storage.
//   3. 🔴 EL PDF ES EL MISMO QUE BAJA «DESCARGAR»: `construirPdfComision`. No
//      hay un segundo generador.
//   4. 🩸 EL ARCHIVO SE ARMA SIN UN `await` EN EL MEDIO (iOS bloquea la hoja de
//      compartir si el gesto se pierde).
//   5. El botón vive en el DETALLE del vendedor, no en la fila de la lista.
//   6. Queda rastro en `activity_logs`, DESPUÉS de que salió.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

import {
  CAJON_QUE_NO_SE_CREO,
  PAPEL_DESCARGADO,
  archivoDeLaComision,
  compartirComision,
  textoDeLoQueSeComparte,
  tituloDeLoQueSeComparte,
} from "@/lib/comisiones/mandar";
import { ROTULO_MANDAR } from "@/lib/comisiones/celular";
import { ACCION_MANDAR, MODULO_ACTIVIDAD_COMISIONES } from "@/lib/comisiones/rastro";

const RAIZ = process.cwd();
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");
const existe = (rel: string) => fs.existsSync(path.join(RAIZ, rel));
/** El archivo sin sus comentarios: lo que el código HACE, no lo que cuenta. */
const puro = (rel: string) =>
  leer(rel)
    .split("\n")
    .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*") && !l.trim().startsWith("/*"))
    .join("\n");

const MODAL = "src/components/comisiones/ComisionesDetalleModal.tsx";

describe("🔴 se manda por la hoja del teléfono, como en Guías", () => {
  it("usa la MISMA puerta que «Compartir» de Guías", () => {
    const mandar = puro("src/lib/comisiones/mandar.ts");
    expect(mandar).toContain('from "@/lib/compartir-archivo"');
    expect(mandar).toContain("compartirArchivo(");
    // La misma función que usa Guías: una sola puerta para todo el sistema.
    expect(puro("src/lib/guias/papel-de-la-guia.ts")).toContain("compartirArchivo(");
  });

  it("y en la computadora el papel se DESCARGA (lo decide `compartir-archivo`)", () => {
    const puerta = puro("src/lib/compartir-archivo.ts");
    expect(puerta).toContain("descargarArchivo(archivo)");
    expect(puerta).toContain("puedeCompartirArchivos");
    expect(PAPEL_DESCARGADO).toBe("Listo, el papel se bajó");
  });

  it("el título y el texto dicen de quién es y de qué mes", () => {
    expect(tituloDeLoQueSeComparte("Reynaldo Espinosa", "Agosto 2026"))
      .toBe("Comisión de Agosto 2026 — Reynaldo Espinosa");
    expect(textoDeLoQueSeComparte("Reynaldo Espinosa", "Agosto 2026"))
      .toContain("Reynaldo Espinosa");
    expect(textoDeLoQueSeComparte("Reynaldo Espinosa", "Agosto 2026"))
      .toContain("Agosto 2026");
    expect(ROTULO_MANDAR).toBe("Mandar");
  });
});

describe("🔴 se fueron «Copiar el link» y «WhatsApp» — y el cajón nunca se creó", () => {
  it("no queda hoja de tres salidas ni ruta que mandar", () => {
    expect(existe("src/components/comisiones/celular/HojaMandarComision.tsx")).toBe(false);
    expect(existe("src/app/api/comisiones/mandar/route.ts")).toBe(false);
  });

  it("ni un botón de link, WhatsApp o correo propio en el detalle", () => {
    const modal = puro(MODAL);
    expect(modal).not.toContain("wa.me");
    expect(modal).not.toContain("Copiar el link");
    expect(modal).not.toContain("clipboard");
    expect(modal).not.toContain("HojaMandarComision");
    // No se pide una dirección de correo: la hoja del teléfono ya la ofrece.
    expect(modal).not.toContain('type="email"');
  });

  it("🩸 y NADIE sube nada a `comisiones-papeles`: el cajón no existe", () => {
    expect(CAJON_QUE_NO_SE_CREO).toBe("comisiones-papeles");
    // Solo se nombra donde se cuenta que no se creó; ni un lector más.
    const lectores = ["src/lib/comisiones/mandar.ts", MODAL]
      .map((f) => puro(f))
      .join("\n");
    expect(lectores).not.toContain("storage");
    expect(lectores).not.toContain("createSignedUrl");
  });
});

describe("🔴 el papel es el MISMO que baja «Descargar»", () => {
  it("lo arma `construirPdfComision`, el generador de siempre", () => {
    const mandar = puro("src/lib/comisiones/mandar.ts");
    expect(mandar).toContain("construirPdfComision(hojas)");
    // Y el detalle le pasa las MISMAS hojas que le pasa a «Descargar».
    const modal = puro(MODAL);
    expect(modal).toContain("compartirComision(");
    expect(modal).toContain("{ data, descuentos, empresaNombre, vendedor, year, mes }");
  });

  it("🩸 y se arma SIN un `await` en el medio (iOS pierde el gesto)", () => {
    const mandar = puro("src/lib/comisiones/mandar.ts");
    // `archivoDeLaComision` es síncrona: devuelve un File, no una promesa.
    expect(mandar).toContain("export function archivoDeLaComision");
    expect(mandar).not.toContain("export async function archivoDeLaComision");
    // Y en `compartirComision` el archivo se arma ANTES del único `await`.
    const cuerpo = mandar.slice(mandar.indexOf("export async function compartirComision"));
    expect(cuerpo.indexOf("archivoDeLaComision(")).toBeLessThan(cuerpo.indexOf("compartirArchivo("));
    // En la pantalla, el único `await` de «Mandar» es el de compartir.
    const fn = puro(MODAL);
    const desde = fn.indexOf("async function mandar()");
    const hasta = fn.indexOf("const encabezado");
    expect(desde).toBeGreaterThan(-1);
    expect((fn.slice(desde, hasta).match(/await /g) ?? []).length).toBe(1);
  });

  it("el archivo sale con el nombre de siempre y en PDF", () => {
    // `construirPdfComision` arrastra jsPDF; se prueba la forma sin dibujar un
    // papel real: lo que este candado sostiene es el nombre y el tipo.
    const mandar = puro("src/lib/comisiones/mandar.ts");
    expect(mandar).toContain('`${nombreSinExtension}.pdf`');
    expect(mandar).toContain('type: "application/pdf"');
    expect(typeof archivoDeLaComision).toBe("function");
    expect(typeof compartirComision).toBe("function");
  });
});

describe("el botón", () => {
  it("🔴 vive en el DETALLE del vendedor, no en la fila de la lista", () => {
    expect(puro(MODAL)).toContain("data-boton-mandar");
    // La lista no manda nada al deslizar (la «9s», que Daniel NO eligió).
    expect(puro("src/components/comisiones/ComisionesTarjetas.tsx")).not.toContain("Mandar");
  });

  it("se apaga sin el detalle cargado — el papel se arma con lo que ya está", () => {
    expect(puro(MODAL)).toContain("disabled={!data || mandando}");
  });
});

describe("el rastro", () => {
  it("🔴 UNA acción, anotada DESPUÉS de que el papel salió", () => {
    expect(ACCION_MANDAR).toBe("mandar");
    expect(MODULO_ACTIVIDAD_COMISIONES).toBe("comisiones");
    const modal = puro(MODAL);
    const salio = modal.indexOf("await compartirComision(");
    const anota = modal.indexOf("anotarMandarComision(");
    expect(salio).toBeGreaterThan(-1);
    expect(anota).toBeGreaterThan(salio);
  });

  it("🩸 y ya no hay dos acciones de servidor que anotar", () => {
    const rastro = puro("src/lib/comisiones/rastro.ts");
    expect(rastro).not.toContain("ACCION_MANDAR_CORREO");
    expect(rastro).not.toContain("ACCION_MANDAR_LINK");
  });
});
