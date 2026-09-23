/**
 * ─────────────────────────────────────────────────────────────────────────────
 * PLANTILLA SWITCH — LOS TRES DETALLES DE PANTALLA (23-sep-2026)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Candado de los tres arreglos que Daniel aprobó en `/productos/cargar`:
 *
 *   1. La caja de soltar el archivo DICE qué reconoció antes de procesar, y lo
 *      que no reconoce NO se procesa (antes caía a Calvin/Tommy en silencio).
 *   2. Los avisos salen COMPLETOS, con plural de verdad y un botón para bajar
 *      la lista como Excel, por el camino común de la casa.
 *   3. El Historial marca la descarga repetida y la última de la serie.
 *
 * 🔴 NINGUNO TOCA EL EXCEL DE LAS 25 COLUMNAS. Este archivo no compara ni una
 * fórmula, ni una tasa, ni un divisor ni un precio: de eso se ocupan
 * `plantilla-switch.test.ts` y `depurador-validate.test.ts`, que no se tocaron.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { render, screen } from "@testing-library/react";
import DepuradorDispatcher from "@/app/productos/cargar/DepuradorDispatcher";
import {
  reconocerArchivo,
  caminoAProcesar,
  TEXTO_NO_RECONOZCO,
  type Detectores,
  type HojaCruda,
} from "@/lib/depurador/reconocer-archivo";
import {
  marcarRepetidas,
  esRepeticion,
  MINUTOS_REPETIDA,
  CHIP_REPETIDA,
  CHIP_ULTIMA,
  type CorridaComparable,
} from "@/lib/depurador/corridas-repetidas";
import { filasDeAvisos, ENCABEZADO_AVISOS, nombreArchivoAvisos } from "@/lib/depurador/avisos-excel";
import { TRES_DETALLES } from "@/lib/depurador/tres-detalles";
import { columnasQueFaltan, marcasDelArchivo } from "@/lib/depurador/logic";
import type { SheetRow } from "@/lib/depurador/logic";

const RAIZ = path.join(__dirname, "..", "..", "..");
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");

const NADA: Detectores = {
  reebokCompra: () => false,
  reebokDespacho: () => false,
  facturaTienda: () => false,
};

/** Un archivo del proveedor como los que llegan de verdad: los encabezados son
 *  los mismos que usan los tests del Excel de 25 columnas. */
function hojaCkth(marca: string): HojaCruda[] {
  const filas: SheetRow[] = [
    ["REFERENCIA", "EAN", "P_CATEGORY", "TALLA", "CANTIDAD", "COSTO", "PRECIO2", "MARCA", "PROVEEDOR"],
    ["REF1", "7612345678901", "MENS SHIRT", "M", 10, 12.5, 30, marca, "Proveedor SA"],
  ];
  return [{ nombre: "HOJA_TXT", filas }];
}

describe("🔴 1 · La caja dice qué archivo reconoció, y lo que no reconoce NO se procesa", () => {
  it("un archivo que nadie reconoce no entra a ningún camino", () => {
    const rec = reconocerArchivo("archivo_raro.xlsx", [{ nombre: "Hoja1", filas: [["a", "b"], [1, 2]] }], NADA);
    expect(rec.camino).toBeNull();
    expect(rec.texto).toBe(TEXTO_NO_RECONOZCO);
    expect(caminoAProcesar(rec, true)).toBeNull();
  });

  it("🔴 con el interruptor APAGADO cae a Calvin/Tommy, como antes", () => {
    const rec = reconocerArchivo("archivo_raro.xlsx", [{ nombre: "Hoja1", filas: [["a"], [1]] }], NADA);
    expect(caminoAProcesar(rec, false)).toBe("ckth");
  });

  it("la caja dice la MARCA y la COMPAÑÍA de un archivo de Calvin", () => {
    const rec = reconocerArchivo("CK_UNDERWEAR_sep.xlsx", hojaCkth("CK Underwear"), NADA);
    expect(rec.camino).toBe("ckth");
    expect(rec.texto).toContain("Calvin");
    expect(rec.texto).toContain("Vistana International");
    expect(rec.empresas).toEqual(["vistana"]);
  });

  it("Tommy calzado va a Fashion Shoes y el resto de Tommy a Fashion Wear", () => {
    expect(reconocerArchivo("a.xlsx", hojaCkth("TH Footwear"), NADA).texto).toContain("Fashion Shoes");
    expect(reconocerArchivo("a.xlsx", hojaCkth("TH Menswear"), NADA).texto).toContain("Fashion Wear");
    expect(reconocerArchivo("a.xlsx", hojaCkth("KL Jeans"), NADA).texto).toContain("Active Wear");
  });

  it("con marcas de DOS compañías NO se adivina: se dice y se elige adentro", () => {
    const filas: SheetRow[] = [
      ["REFERENCIA", "EAN", "P_CATEGORY", "TALLA", "CANTIDAD", "COSTO", "PRECIO2", "MARCA"],
      ["R1", "761", "X", "M", 1, 1, 2, "CK Jeans"],
      ["R2", "762", "X", "M", 1, 1, 2, "TH Menswear"],
    ];
    const rec = reconocerArchivo("mixto.xlsx", [{ nombre: "H", filas }], NADA);
    expect(rec.camino).toBe("ckth");
    expect(rec.empresas.length).toBe(2);
    expect(rec.texto).toContain("eliges una adentro");
  });

  it("Reebok (compra y despacho) y Facturas de tienda se nombran con su compañía", () => {
    const soloCompra: Detectores = { ...NADA, reebokCompra: () => true };
    const soloDespacho: Detectores = { ...NADA, reebokDespacho: () => true };
    const hojas: HojaCruda[] = [{ nombre: "Sheet1", filas: [["x"]] }];
    for (const det of [soloCompra, soloDespacho]) {
      const rec = reconocerArchivo("r.xlsx", hojas, det);
      expect(rec.camino).toBe("reebok");
      expect(rec.texto).toContain("Reebok");
      expect(rec.texto).toContain("Active Shoes");
    }
    const csv = reconocerArchivo("reporte.csv", [], NADA);
    expect(csv.camino).toBe("tienda");
    expect(csv.texto).toContain("Multifashion");
  });

  it("🔴 «archivo del proveedor» se decide con la MISMA lista con la que frena processRows", () => {
    const sinTalla: SheetRow[] = [
      ["REFERENCIA", "EAN", "P_CATEGORY", "CANTIDAD", "COSTO", "PRECIO2", "MARCA"],
      ["R1", "761", "X", 1, 1, 2, "CK Jeans"],
    ];
    expect(columnasQueFaltan(sinTalla[0])).toContain("TALLA");
    expect(reconocerArchivo("a.xlsx", [{ nombre: "H", filas: sinTalla }], NADA).camino).toBeNull();
  });

  it("las marcas salen de la columna MARCA del archivo, no del nombre del archivo", () => {
    expect(marcasDelArchivo(hojaCkth("CK Jeans")[0].filas)).toEqual(["CK Jeans"]);
    expect(marcasDelArchivo([["REFERENCIA", "EAN"], ["a", "b"]])).toEqual([]);
  });

  it("el despachador dibuja lo que reconoció y no se salta el interruptor", () => {
    const src = leer("src/app/productos/cargar/DepuradorDispatcher.tsx");
    expect(src).toContain("reconocerArchivo");
    expect(src).toContain("caminoAProcesar");
    expect(src).toContain("TRES_DETALLES");
    expect(src).toContain("rec.texto");
    // 🔴 La caída silenciosa vive en UN solo lugar: `caminoAProcesar`. Si vuelve
    // a escribirse a mano en el `catch`, este candado se pone rojo.
    expect(src).not.toMatch(/catch[\s\S]{0,200}setKind\("ckth"\)/);
  });

  it("la caja sigue pidiendo el archivo cuando no hay nada soltado", () => {
    render(<DepuradorDispatcher onDownloaded={() => {}} />);
    expect(screen.getByText(/Suelta el archivo aquí/i)).toBeTruthy();
    expect(screen.queryByText(TEXTO_NO_RECONOZCO)).toBeNull();
  });
});

describe("🔴 2 · Los avisos salen completos y se pueden bajar", () => {
  const src = leer("src/app/productos/cargar/DepuradorClient.tsx");

  it("con 12 avisos se dibujan los 12 y dice «12 avisos»", () => {
    // La pantalla dibuja `warnings` entero cuando el interruptor está prendido;
    // acá se comprueba la regla, no el render de 74 KB de componente.
    expect(TRES_DETALLES).toBe(true);
    expect(src).toContain('TRES_DETALLES ? warnings : warnings.slice(0, 8)');
    expect(src).toContain('plural(warnings.length, "aviso", "avisos")');
    // El «…y N más» solo existe con el interruptor apagado.
    expect(src).toMatch(/!TRES_DETALLES && warnings\.length > 8/);
  });

  it("ya no dice «aviso(s)» con el interruptor prendido", () => {
    expect(src).toContain('TRES_DETALLES ? plural(warnings.length, "aviso", "avisos") : "aviso(s)"');
  });

  it("🔴 el Excel de avisos sale por el camino común de la casa", () => {
    expect(src).toContain("workbookBlob");
    expect(src).toContain("filtroDesdeA1");
    expect(src).toContain("filasDeAvisos");
    expect(src).toContain("nombreArchivoAvisos");
    // Nunca `XLSX.write` a mano: eso deja el archivo sin fila de encabezados fija.
    expect(src).not.toContain("XLSX.write(");
  });

  it("las filas del Excel llevan encabezado y un renglón por aviso, sin recortar", () => {
    const avisos = Array.from({ length: 12 }, (_, i) => `Aviso ${i + 1}`);
    const aoa = filasDeAvisos(avisos);
    expect(aoa.length).toBe(13);
    expect(aoa[0]).toEqual([...ENCABEZADO_AVISOS]);
    expect(aoa[1]).toEqual([1, "Aviso 1"]);
    expect(aoa[12]).toEqual([12, "Aviso 12"]);
  });

  it("el nombre del archivo lleva la fecha", () => {
    expect(nombreArchivoAvisos("2026-09-23")).toBe("Avisos-plantilla-switch-2026-09-23.xlsx");
  });
});

describe("🔴 3 · El Historial marca la repetida y la última", () => {
  const corrida = (id: string, min: number, extra: Partial<CorridaComparable> = {}): CorridaComparable => ({
    id,
    marca: "CK Jeans",
    cantidad_estilos: 45,
    total_unidades: 766,
    created_at: new Date(Date.UTC(2026, 8, 18, 11, min, 0)).toISOString(),
    ...extra,
  });

  it("dos corridas iguales a 1 minuto: la vieja «repetida», la nueva «la última»", () => {
    const m = marcarRepetidas([corrida("b", 37), corrida("a", 36)]);
    expect(m.get("a")).toBe("repetida");
    expect(m.get("b")).toBe("ultima");
  });

  it("a 61 minutos no se marca ninguna", () => {
    const m = marcarRepetidas([corrida("a", 0), corrida("b", 61)]);
    expect(m.get("a")).toBeNull();
    expect(m.get("b")).toBeNull();
    expect(MINUTOS_REPETIDA).toBe(60);
  });

  it("distinta cantidad de piezas: ninguna se marca", () => {
    const m = marcarRepetidas([corrida("a", 0), corrida("b", 1, { total_unidades: 765 })]);
    expect(m.get("a")).toBeNull();
    expect(m.get("b")).toBeNull();
  });

  it("distinta cantidad de estilos o distinta marca: ninguna se marca", () => {
    expect(esRepeticion(corrida("a", 0), corrida("b", 1, { cantidad_estilos: 44 }))).toBe(false);
    expect(esRepeticion(corrida("a", 0), corrida("b", 1, { marca: "CK Menswear" }))).toBe(false);
  });

  it("🔴 igualdad EXACTA de la marca, nunca por parecido", () => {
    expect(esRepeticion(corrida("a", 0), corrida("b", 1, { marca: "ck jeans" }))).toBe(false);
    expect(esRepeticion(corrida("a", 0), corrida("b", 1, { marca: "CK Jeans " }))).toBe(false);
  });

  it("una serie de tres deja dos «repetida» y una «la última» (medido: CK Jeans, 29-jun)", () => {
    const m = marcarRepetidas([corrida("c", 60), corrida("b", 55), corrida("a", 5)]);
    expect(m.get("a")).toBe("repetida");
    expect(m.get("b")).toBe("repetida");
    expect(m.get("c")).toBe("ultima");
  });

  it("una corrida sola no lleva chip", () => {
    expect(marcarRepetidas([corrida("a", 0)]).get("a")).toBeNull();
  });

  it("🔴 el Historial no borra ni esconde nada: solo pinta", () => {
    const src = leer("src/app/productos/cargar/HistorialView.tsx");
    expect(src).toContain("marcarRepetidas");
    expect(src).toContain("TRES_DETALLES");
    expect(src).toContain("CHIP_REPETIDA");
    expect(src).toContain("CHIP_ULTIMA");
    // Ni un filter que saque filas por ser repetidas.
    expect(src).not.toMatch(/filter\([^)]*repetid/i);
    expect(CHIP_REPETIDA).toBe("repetida");
    expect(CHIP_ULTIMA).toBe("la última");
  });
});
