// ─────────────────────────────────────────────────────────────────────────────
// 🔴 CANDADO — «DESCARGAR» ES UN SOLO BOTÓN (25-sep-2026, la «6a»).
//
// 🩸 QUÉ REEMPLAZA, medido en `activity_logs`: las **tres** descargas de Ventas
// que hay en toda la historia de la tabla son del **20-sep-2026, entre las
// 08:35 y las 08:36**, todas de Daniel, **una por pestaña, en 90 segundos**.
// Es la huella de querer UN archivo y tener que hacer tres viajes. Y el botón
// se llamaba igual en las tres pestañas pero bajaba cosas distintas, y en DOS
// de ellas se llevaba un renglón entero él solo (166 × 44 px).
// ⚠️ El contador solo empezó a grabar el 18-sep-2026: son 3 descargas en 7
// días, no en 90.
//
// 🔴 LO QUE ESTE CANDADO SOSTIENE:
//   1. Hay UN botón y la hoja pregunta: esta pestaña, o las tres juntas.
//   2. 🔴 NO HAY UN GENERADOR NUEVO: el libro de las tres llama a los TRES de
//      siempre. Si alguien escribe una columna acá, esto cae.
//   3. Sale por `workbookBytes` —o sea con el filtro desde A1 y la fila de
//      encabezados fija—, como TODO export del sistema.
//   4. Una pestaña sin datos no deja una hoja vacía.
//   5. Se sigue anotando en `activity_logs`.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

import {
  DETALLE_LAS_TRES,
  NOMBRE_DE_LA_PESTANA,
  OPCION_ESTA_PESTANA,
  OPCION_LAS_TRES,
  TITULO_HOJA_DESCARGA,
  detalleDeEstaPestana,
} from "@/lib/ventas/descarga-un-boton";
import {
  HOJAS_DE_LAS_TRES,
  hojasDeLasTresPestanas,
  nombreDeLasTres,
} from "@/lib/ventas/excel-tres-pestanas";
import { ACCION_DESCARGA_EXCEL, MODULO_ACTIVIDAD_VENTAS } from "@/lib/ventas/descarga";

const RAIZ = process.cwd();
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");

// ─────────────────────────────────────────────────────────────────────────────
// 1 · La hoja pregunta
// ─────────────────────────────────────────────────────────────────────────────

describe("la hoja de «Descargar»", () => {
  it("tiene DOS opciones y nada más", () => {
    expect(TITULO_HOJA_DESCARGA).toBe("Descargar");
    expect(OPCION_ESTA_PESTANA).toBe("Esta pestaña en Excel");
    expect(OPCION_LAS_TRES).toBe("Las tres pestañas en un solo Excel");
    expect(DETALLE_LAS_TRES).toBe("Resumen · Clientes · Productos, una hoja cada una");
  });

  it("la primera opción dice QUÉ pestaña y de qué período", () => {
    expect(detalleDeEstaPestana("resumen", "año 2026")).toBe("Resumen · año 2026");
    expect(NOMBRE_DE_LA_PESTANA).toEqual({
      resumen: "Resumen", clientes: "Clientes", productos: "Productos",
    });
  });

  it("🔴 en el celular el botón vive detrás del «···», con «Actualizar ahora»", () => {
    const menu = leer("src/components/ventas/celular/MenuVentasCelular.tsx");
    expect(menu).toContain("data-abrir-descargar");
    expect(menu).toContain("SyncNowButton");
    expect(menu).toContain('clave: "esta-pestana"');
    expect(menu).toContain('clave: "las-tres"');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2 · El libro de las tres
// ─────────────────────────────────────────────────────────────────────────────

describe("las tres pestañas en un solo Excel", () => {
  it("las hojas son tres y se llaman como las pestañas", () => {
    expect([...HOJAS_DE_LAS_TRES]).toEqual(["Resumen", "Clientes", "Productos"]);
    expect(nombreDeLasTres(2026)).toBe("ventas-2026.xlsx");
  });

  it("🔴 NO hay un generador nuevo: llama a los TRES de siempre", () => {
    const fuente = leer("src/lib/ventas/excel-tres-pestanas.ts");
    expect(fuente).toContain('await import("./excel")');
    expect(fuente).toContain('await import("./clientes-excel")');
    expect(fuente).toContain('await import("./productos")');
    // Y no escribe ni una columna por su cuenta.
    expect(fuente).not.toMatch(/aoa\s*[:=]/);
    expect(fuente).not.toContain("buildReportSheet");
  });

  it("🔴 sale por `workbookBytes`, como todo export del sistema", () => {
    const fuente = leer("src/lib/ventas/excel-tres-pestanas.ts");
    expect(fuente).toContain("downloadWorkbook");
    // `downloadWorkbook` es la puerta que pasa por `workbookBlob`/`workbookBytes`.
    expect(leer("src/lib/excel-export.ts")).toContain("export function downloadWorkbook");
    expect(leer("src/lib/excel-export.ts")).toContain("workbookBlob(wb)");
  });

  it("una pestaña sin datos NO deja una hoja vacía", async () => {
    const resumenFalso = { year: 2026, kpis: {}, empresas: [], mesActual: 9 } as never;
    vi.doMock("@/lib/ventas/excel", () => ({ buildResumenSheet: async () => ({ "!ref": "A1" }) }));
    const hojas = await hojasDeLasTresPestanas({
      resumen: { data: resumenFalso, modo: "ventas" },
      clientes: null,
      productos: null,
    });
    expect(hojas.map((h) => h.name)).toEqual(["Resumen"]);
    vi.doUnmock("@/lib/ventas/excel");
  });

  it("se sigue anotando en `activity_logs` con la misma acción y el mismo módulo", () => {
    expect(ACCION_DESCARGA_EXCEL).toBe("descarga_excel");
    expect(MODULO_ACTIVIDAD_VENTAS).toBe("ventas");
    expect(leer("src/app/ventas/VentasShell.tsx")).toContain('anotarDescarga("resumen", { alcance: "las-tres"');
  });
});
