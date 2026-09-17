/* ─────────────────────────────────────────────────────────────────────────────
 * 🔴 CANDADO — EL DESPACHO DE REEBOK ENTRA AL DEPURADOR (17-sep-2026)
 *
 * El flujo Reebok de «Plantilla Switch» come DOS Excel del proveedor:
 *   · la CONFIRMACIÓN de compra — lo que VA A LLEGAR. No cambió;
 *   · el DESPACHO — lo que DE VERDAD LLEGÓ.
 *
 * 🩸 De la confirmación salían tres números mal, y este candado los fija:
 *   1. EL COSTO SE INVENTABA — `WholesalePrice × 0,80` en calzado y `× 0,70` en
 *      ropa. El despacho trae el descuento por fila y los dos archivos reales
 *      traen 20 %, 25 % y 30 % en el mismo embarque. Daniel: *«hay veces que
 *      puede llegar un porcentaje más alto. No siempre será 20»*. Se LEE.
 *   2. EL CÓDIGO DE BARRAS NO ERA UN CÓDIGO DE BARRAS — se escribía el `SKU` de
 *      Reebok (`RBKAPPTR1200M`). Ahora es el `UPC`.
 *   3. LA CANTIDAD ERA UNA PROYECCIÓN — las piezas de la columna del MES. Ahora
 *      es `Quantity`.
 *
 * 🔴 Y LA REGLA QUE MANDA SOBRE TODAS. Daniel, textual (17-sep-2026): *«vendrá
 * con poname y category pero por ahora que el sistema acepte este excel, y
 * cuando llegue con lo otro ya sepa y me lo acepte también sin tener que estar
 * reconfigurando»*. Por eso el bloque grande de abajo corre EL MISMO conjunto de
 * filas DOS VECES —una con las columnas nuevas y otra sin ellas— y exige que las
 * 25 columnas de Switch salgan IGUALES, salvo las dos que la columna aporta
 * (`Composición` y el rubro). Si alguien mañana hace obligatoria una columna que
 * hoy falta, el build se pone rojo.
 *
 * Los fixtures son los DOS archivos REALES del 17-sep-2026, recortados a unos
 * pocos estilos y sin tocar una celda. 🔑 **Son dos GENERACIONES del mismo
 * reporte**, no dos reportes distintos. Daniel, textual (17-sep-2026): *«en el
 * despacho excel que solo trae calzado fue reemplazado por el que tiene
 * accesory donde sí trae category»*:
 *   · `reebok-despacho-nuevo-ropa.xlsx` — **el formato NUEVO**, el que Reebok va
 *     a mandar de acá en adelante para ropa Y para calzado. Hoja `Sheet1`, 26
 *     columnas, CON `Category` y `Color Name`, SIN `Composición` ni `EAN`.
 *   · `reebok-despacho-viejo-calzado.xlsx` — **el formato VIEJO**, el de solo
 *     calzado. Hoja `Despacho`, 25 columnas, CON `Composición` y `EAN`, SIN
 *     `Category` ni `Color Name`.
 * 🔴 Los DOS se tienen que poder subir: los archivos viejos ya existen y alguien
 * los va a soltar en la pantalla. Que no tengan las mismas columnas entre sí no
 * es un descuido: es el estado normal, y es justo lo que este candado protege.
 * ────────────────────────────────────────────────────────────────────────── */

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx-js-style";
import {
  parseDespacho,
  findHeaderRowDespacho,
  departmentDelSegmento,
  rubroDeRespaldo,
  indiceDespacho,
  COLUMNAS_DESPACHO,
  RUBRO_CALZADO,
} from "@/lib/depurador/reebok-despacho";
import {
  parseReebok,
  buildSwitchRows,
  buildSwitchAoa,
  buildCatalogo,
  OUT_COLS,
  REEBOK_FORMULA_A_DEFAULT,
  REEBOK_FORMULA_B_DEFAULT,
} from "@/lib/depurador/reebok";
import type { SheetRow } from "@/lib/depurador/logic";

const RAIZ = process.cwd();
const FIX = (n: string) => path.join(RAIZ, "src/__tests__/fixtures", n);

function libro(nombre: string): { hoja: string; rows: SheetRow[] } {
  const wb = XLSX.read(fs.readFileSync(FIX(nombre)), { type: "buffer" });
  const hoja = wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[hoja], {
    header: 1, raw: true, defval: null,
  }) as SheetRow[];
  return { hoja, rows };
}

const NUEVO = libro("reebok-despacho-nuevo-ropa.xlsx");
const VIEJO = libro("reebok-despacho-viejo-calzado.xlsx");

const CFG_SWITCH = { formula: REEBOK_FORMULA_A_DEFAULT, temporada: "2026-09", tasa: "07" };

/** Las 25 columnas de Switch, indexadas por «Código *». */
const porCodigo = (rows: SheetRow[]) =>
  new Map(
    buildSwitchRows(parseDespacho(rows).items, CFG_SWITCH).map((r) => [
      String(r.cols["Código *"]),
      r.cols,
    ]),
  );

/** Quita columnas del libro (encabezado y datos) — sirve para simular el archivo
 *  de hoy a partir del archivo del futuro, y al revés. */
function sinColumnas(rows: SheetRow[], quitar: string[]): SheetRow[] {
  const H = (rows[0] ?? []).map((h) => String(h ?? "").trim().toUpperCase());
  const fuera = new Set(quitar.map((q) => H.indexOf(q.toUpperCase())).filter((i) => i !== -1));
  return rows.map((r) => (r ?? []).filter((_c, i) => !fuera.has(i)));
}

/** Agrega columnas al final del libro, con un valor por fila. */
function conColumna(rows: SheetRow[], nombre: string, valor: (fila: SheetRow) => string | number | null): SheetRow[] {
  return rows.map((r, i) => (i === 0 ? [...(r ?? []), nombre] : [...(r ?? []), valor(r ?? [])]));
}

/* ═════════════════════════════════════════════════════════════════════════ */

describe("🔴 El archivo se reconoce por CONTENIDO, no por el nombre de la hoja", () => {
  it("las dos hojas se llaman distinto y las dos se reconocen", () => {
    expect(NUEVO.hoja).toBe("Sheet1");
    expect(VIEJO.hoja).toBe("Despacho");
    expect(findHeaderRowDespacho(NUEVO.rows)).toBe(0);
    expect(findHeaderRowDespacho(VIEJO.rows)).toBe(0);
  });

  it("⚠️ el encabezado está en la fila 1 (en la confirmación estaba en la 2)", () => {
    expect(String(NUEVO.rows[0][0])).toBe("Customer/Vendor Code");
  });

  it("la CONFIRMACIÓN de compra NO se confunde con un despacho", () => {
    const hdr: SheetRow = ["PO NAME", "New Article", "SKU", "Name", "Department",
      "CATEGORY", "GENDER", "Talla", "WholesalePrice", "JULIO"];
    expect(findHeaderRowDespacho([[], hdr, []])).toBe(-1);
  });

  it("un libro que no es de Reebok no se lee como despacho", () => {
    expect(findHeaderRowDespacho([["REFERENCIA", "EAN", "TALLA", "COSTO"]])).toBe(-1);
    expect(() => parseDespacho([["REFERENCIA", "COSTO"]])).toThrow(/despacho/i);
  });
});

describe("🩸 Los TRES números que salían mal", () => {
  const calzado = porCodigo(VIEJO.rows);
  const ropa = porCodigo(NUEVO.rows);

  it("1. EL COSTO SE LEE DEL ARCHIVO, no se asume un 20 %", () => {
    // 100272244 viene con 30 % de descuento en el archivo real: Precio Base
    // 30,95 → Precio after Disc 21,67. El costo asumido (× 0,80) daría 24,76,
    // o sea $3,09 de MÁS por par, y el precio de venta sale del CIF.
    const fob = calzado.get("100272244")!["Costo FOB *"];
    expect(fob).toBe(21.67);
    expect(fob).not.toBe(24.76);
    // Y el calzado al 20 % también sale del archivo, no de la cuenta.
    expect(calzado.get("100262679")!["Costo FOB *"]).toBe(43.61);
  });

  it("🔴 la ropa ya NO usa el 0,70 asumido: el archivo dice 20 %", () => {
    // ACCS055: Precio Base 5.03 · 20 % · Precio after Disc 4.02.
    // El asumido para ropa (× 0,70) habría dado 3,52 — 50 centavos menos.
    expect(ropa.get("ACCS055")!["Costo FOB *"]).toBe(4.02);
    expect(ropa.get("ACCS055")!["Costo FOB *"]).not.toBe(3.52);
  });

  it("2. EL CÓDIGO DE BARRAS es un código de barras, no el SKU de Reebok", () => {
    const cb = String(ropa.get("ACCS055")!["Código Barra *"]);
    expect(cb).toMatch(/^\d{12,13}$/);          // un código de barras de verdad
    expect(cb).not.toMatch(/^RBK/);             // el SKU de Reebok empieza así
    // Y es el de la TALLA-MUESTRA (M en ropa), no el de cualquier fila. El
    // formato nuevo solo trae `UPC`, así que ahí es el UPC.
    expect(cb).toBe(columnaDe(NUEVO.rows, "RBKHWACCS055M", "UPC"));
  });

  it("🔴 EL EAN LE GANA AL UPC, y no es un empate: son números distintos", () => {
    // Medido el 17-sep-2026: en el despacho de calzado `EAN` ≠ `UPC` en las
    // 1.579 filas, los dos con dígito verificador válido. Y de los 183 artículos
    // de Active Shoes ya cargados en Switch, 94 tienen un EAN-13 válido —66 con
    // el prefijo `120` del despacho— contra 4 UPC-12. Lo cargado es el EAN.
    const cb = String(calzado.get("100262679")!["Código Barra *"]);
    expect(cb).toBe(columnaDe(VIEJO.rows, "1200186012470", "EAN"));
    expect(cb).toMatch(/^120/);
    expect(cb).not.toBe(columnaDe(VIEJO.rows, "1200186012470", "UPC"));
  });

  it("3. LA CANTIDAD es `Quantity`, lo que llegó", () => {
    // ACCS055 llegó en tres tallas de 4 piezas cada una.
    expect(ropa.get("ACCS055")!["Stock Ideal"]).toBe(12);
    // Y el zapato, en nueve tallas que suman 12 pares.
    expect(calzado.get("100272244")!["Stock Ideal"]).toBe(12);
  });
});

/** Una columna de una fila del fixture, buscada por su SKU. */
function columnaDe(rows: SheetRow[], sku: string, columna: string): string {
  const H = (rows[0] ?? []).map((h) => String(h ?? "").trim());
  const iSku = H.indexOf("SKU");
  const iCol = H.indexOf(columna);
  const fila = rows.slice(1).find((r) => String((r ?? [])[iSku] ?? "").trim() === sku);
  return String((fila ?? [])[iCol] ?? "");
}

describe("El mapeo a las 25 columnas de Switch", () => {
  const calzado = porCodigo(VIEJO.rows);
  const ropa = porCodigo(NUEVO.rows);

  it("las 25 columnas siguen siendo las de siempre, en el mismo orden", () => {
    const aoa = buildSwitchAoa(buildSwitchRows(parseDespacho(VIEJO.rows).items, CFG_SWITCH));
    expect(aoa[0]).toEqual(OUT_COLS);
    expect(aoa[0]).toHaveLength(25);
  });

  it("Código y Referencia salen de `SKU Father`", () => {
    const c = calzado.get("100262679")!;
    expect(c["Código *"]).toBe("100262679");
    expect(c["Referencia *"]).toBe("100262679");
  });

  it("la Descripción sale de `Description SKUs`", () => {
    expect(calzado.get("100262679")!["Descripción *"]).toBe("ZIGNITION");
  });

  it("la Marca se DERIVA del segmento, y el calzado va en PAR", () => {
    expect(calzado.get("100262679")!["Marca *"]).toBe("FOOTWEAR");
    expect(calzado.get("100262679")!["Unidad de medida *"]).toBe("PAR");
    expect(ropa.get("ACCS055")!["Marca *"]).toBe("HARDWARE");
    expect(ropa.get("ACCS055")!["Unidad de medida *"]).toBe("PIEZA");
    expect(ropa.get("APPTR083")!["Marca *"]).toBe("APPAREL");
  });

  it("🔑 el archivo de CALZADO también trae ropa, y sale como APPAREL", () => {
    // 100269032 es «Reebok TRAINING APP MEN» adentro del Excel de calzado:
    // el Department se decide POR FILA, nunca por el archivo.
    expect(calzado.get("100269032")!["Marca *"]).toBe("APPAREL");
    expect(calzado.get("100269032")!["Unidad de medida *"]).toBe("PIEZA");
  });

  it("el subrubro es `Gender`", () => {
    expect(calzado.get("100262679")!["subrubro"]).toBe("MALE");
    expect(ropa.get("ACCS055")!["subrubro"]).toBe("UNISEX");
  });

  it("el rubro: `Category` cuando viene; SHOES cuando no y es calzado", () => {
    expect(ropa.get("ACCS055")!["rubro *"]).toBe("SOCKS");
    expect(ropa.get("APPCL1158")!["rubro *"]).toBe("JACKETS");
    expect(calzado.get("100262679")!["rubro *"]).toBe(RUBRO_CALZADO);
  });

  it("⚠️ sin `Category` y sin ser calzado, el rubro va VACÍO — no se adivina", () => {
    // La ropa que viaja en el archivo de calzado: no hay columna Category y el
    // Department es APPAREL, así que no hay de dónde sacar el rubro.
    expect(calzado.get("100269032")!["rubro *"]).toBe("");
  });

  it("la Composición sale de la columna cuando viene, y vacía cuando no", () => {
    expect(String(calzado.get("100262679")!["Composición"])).toContain("UPPER:");
    expect(ropa.get("ACCS055")!["Composición"]).toBe("");
  });

  it("lo que NO cambió: proveedor, tipo de artículo, tasa y temporada", () => {
    const c = calzado.get("100262679")!;
    expect(c["Proveedor *"]).toBe("LATIN FITNESS GROUP");
    expect(c["Código Tipo de Artículo *"]).toBe("01");
    expect(c["Tasa de Impuesto *"]).toBe("07");
    expect(c["Temporada"]).toBe("2026-09");
  });

  it("🔴 un solo costo: el CIF de la plantilla es el costo del pedido", () => {
    const pedido = new Map(
      buildCatalogo(parseDespacho(VIEJO.rows).items, {
        formulaA: REEBOK_FORMULA_A_DEFAULT, formulaB: REEBOK_FORMULA_B_DEFAULT,
      }).map((r) => [r.newArticle, r.costo]),
    );
    for (const [codigo, cols] of calzado) {
      expect(pedido.get(codigo), codigo).toBe(cols["Costo CIF *"]);
    }
  });
});

describe("La talla-muestra: la misma regla, con las tallas que llegaron", () => {
  const filas = buildSwitchRows(parseDespacho(NUEVO.rows).items, CFG_SWITCH);
  const de = (cod: string) => filas.find((r) => r.cols["Código *"] === cod)!;
  const calzado = buildSwitchRows(parseDespacho(VIEJO.rows).items, CFG_SWITCH);
  const deCalzado = (cod: string) => calzado.find((r) => r.cols["Código *"] === cod)!;

  it("ropa con M → M, sin ámbar", () => {
    expect(de("ACCS055").talla).toBe("M");
    expect(de("ACCS055").fallback).toBe(false);
  });

  it("🔑 ACCS063 llegó SOLO en S: se usa esa talla, no se descarta el artículo", () => {
    // Daniel: «ACCS063 porque solo hay S, es marcarla en ámbar y poner esa no?».
    // La primera mitad ya pasa: se usa la que haya.
    expect(de("ACCS063").talla).toBe("S");
    // ⚠️ LA SEGUNDA MITAD NO, Y ESTÁ MEDIDO: el ámbar de `pickSample` se
    // enciende cuando hay VARIAS tallas y ninguna es la buscada
    // (`fallback: bySize.size > 1`); con UNA sola talla no hay nada que elegir
    // y la fila sale limpia. Encenderlo para toda talla única pondría en ámbar
    // también los bolsos —`ACCB145` viene en `N SZ`, que es talla única de
    // verdad— y un aviso que grita sobre un dato bueno deja de ser un aviso.
    // 🔴 DECISIÓN PENDIENTE DE DANIEL: no se cambia por cuenta propia, y este
    // candado fija la conducta de hoy para que el cambio sea deliberado.
    expect(de("ACCS063").fallback).toBe(false);
    expect(de("ACCB145").fallback).toBe(false);
  });

  it("calzado de hombre → 9 · de dama → 7, y sin ámbar", () => {
    expect(deCalzado("100262679").talla).toBe("9");
    expect(deCalzado("100262679").fallback).toBe(false);
    expect(deCalzado("100260638").talla).toBe("7");
    expect(deCalzado("100260638").fallback).toBe(false);
  });
});

/* ═════════════════════════════════════════════════════════════════════════
 * 🔴 EL MISMO ARCHIVO, CON O SIN LAS COLUMNAS NUEVAS
 * ═════════════════════════════════════════════════════════════════════════ */

describe("🔴 Las mismas filas, con las columnas nuevas y sin ellas", () => {
  /** El calzado de hoy + las tres columnas que Reebok va a mandar. */
  const VIEJO_CON_COLUMNAS_NUEVAS = conColumna(
    conColumna(
      conColumna(VIEJO.rows, "PO NAME", () => "PO-FW26"),
      "Department",
      (f) => (String(f[9] ?? "").includes("APP") ? "APPAREL" : "FOOTWEAR"),
    ),
    "Category",
    () => "SHOES",
  );

  it("el archivo de MAÑANA entra sin que nadie reconfigure nada", () => {
    expect(() => parseDespacho(VIEJO_CON_COLUMNAS_NUEVAS)).not.toThrow();
    const i = indiceDespacho(VIEJO_CON_COLUMNAS_NUEVAS[0]);
    expect(i.po).toBeGreaterThan(-1);
    expect(i.category).toBeGreaterThan(-1);
    expect(i.department).toBeGreaterThan(-1);
  });

  it("🔴 las 25 columnas salen IGUALES, salvo el rubro (que es lo que aporta)", () => {
    const hoy = porCodigo(VIEJO.rows);
    const manana = porCodigo(VIEJO_CON_COLUMNAS_NUEVAS);
    expect([...manana.keys()].sort()).toEqual([...hoy.keys()].sort());
    for (const [codigo, colsHoy] of hoy) {
      const colsManana = manana.get(codigo)!;
      for (const c of OUT_COLS) {
        if (c === "rubro *") continue; // lo aporta `Category`
        expect({ codigo, columna: c, valor: colsManana[c] })
          .toEqual({ codigo, columna: c, valor: colsHoy[c] });
      }
    }
  });

  it("🔴 y si mañana Reebok QUITA columnas, tampoco se rompe nada", () => {
    // La ropa de hoy trae `Category` y `Color Name`; sin ellas el archivo entra
    // igual y solo cambia el rubro.
    const hoy = porCodigo(NUEVO.rows);
    const pelado = porCodigo(sinColumnas(NUEVO.rows, ["Category", "Color Name"]));
    for (const [codigo, colsHoy] of hoy) {
      for (const c of OUT_COLS) {
        if (c === "rubro *") continue;
        expect({ codigo, columna: c, valor: pelado.get(codigo)![c] })
          .toEqual({ codigo, columna: c, valor: colsHoy[c] });
      }
    }
    // Sin `Category` y sin ser calzado, el rubro queda vacío: no se inventa.
    expect(pelado.get("ACCS055")!["rubro *"]).toBe("");
  });

  it("🔴 sin `Composición` el Excel sale igual, con esa celda vacía", () => {
    const con = porCodigo(VIEJO.rows);
    const sin = porCodigo(sinColumnas(VIEJO.rows, ["Composición"]));
    for (const [codigo, cols] of con) {
      for (const c of OUT_COLS) {
        if (c === "Composición") continue;
        expect({ codigo, columna: c, valor: sin.get(codigo)![c] })
          .toEqual({ codigo, columna: c, valor: cols[c] });
      }
    }
    expect(sin.get("100262679")!["Composición"]).toBe("");
  });

  it("🔴 sin `EAN` se cae al `UPC`, y sin ninguno al SKU — nunca se traba", () => {
    // El formato NUEVO ya no trae `EAN`: ahí el código sale del `UPC`, solo.
    const sinEan = porCodigo(sinColumnas(VIEJO.rows, ["EAN"]));
    expect(sinEan.get("100262679")!["Código Barra *"])
      .toBe(columnaDe(VIEJO.rows, "1200186012470", "UPC"));
    expect(porCodigo(NUEVO.rows).get("ACCS055")!["Código Barra *"])
      .toBe(columnaDe(NUEVO.rows, "RBKHWACCS055M", "UPC"));

    // Y sin ninguno de los dos, el SKU — que no es un código de barras en ropa,
    // pero es lo que el sistema ya escribía: nunca se entrega la celda vacía.
    const pelado = porCodigo(sinColumnas(VIEJO.rows, ["UPC", "EAN"]));
    expect(pelado.get("100262679")!["Código Barra *"]).toBe("1200186012470");
  });

  it("⚠️ en el despacho VIEJO el `SKU` ES el EAN: ahí el código no cambió", () => {
    // Medido: idénticos en las 1.579 filas del archivo real. Por eso el defecto
    // del código de barras era REAL solo en ropa.
    const H = (VIEJO.rows[0] ?? []).map((h) => String(h ?? "").trim());
    const iSku = H.indexOf("SKU"), iEan = H.indexOf("EAN");
    for (const r of VIEJO.rows.slice(1)) {
      expect(String((r ?? [])[iEan] ?? "")).toBe(String((r ?? [])[iSku] ?? ""));
    }
  });

  it("🔴 NINGUNA de las columnas que hoy faltan es obligatoria", () => {
    // La lista es la tabla de respaldo, no una copia tecleada a mano.
    const opcionales = COLUMNAS_DESPACHO.filter((c) => !c.obligatoria).map((c) => c.rotulo);
    for (const r of ["PO NAME", "Category", "Department", "Composición", "Color Name", "EAN", "UPC"]) {
      expect(opcionales, `${r} no puede ser obligatoria`).toContain(r);
    }
    // Y cada opcional dice de dónde sale si falta.
    for (const c of COLUMNAS_DESPACHO.filter((x) => !x.obligatoria)) {
      expect(c.respaldo.trim(), c.rotulo).not.toBe("");
    }
  });

  it("🔴 las obligatorias son las que sin ellas el archivo entraría MAL y en silencio", () => {
    const obligatorias = COLUMNAS_DESPACHO.filter((c) => c.obligatoria).map((c) => c.rotulo);
    // `Quantity` y `Precio after Disc` son los dos defectos que se arreglaron.
    expect(obligatorias).toContain("Quantity");
    expect(obligatorias).toContain("Precio after Disc");
    expect(obligatorias).toContain("SKU Father");
    // Sin ellas el archivo NO entra: o no se reconoce como despacho (las dos que
    // lo identifican) o se dice qué columna falta y no se procesa nada.
    for (const r of ["SKU Father", "Quantity"]) {
      expect(() => parseDespacho(sinColumnas(VIEJO.rows, [r])), r).toThrow(/despacho/i);
    }
    for (const r of ["Precio after Disc", "Description SKUs", "Gender", "Talla", "SKU"]) {
      expect(() => parseDespacho(sinColumnas(VIEJO.rows, [r])), r).toThrow(/Faltan columnas/);
    }
  });

  it("⚠️ el `Segmento de negocio` deja de hacer falta el día que llegue `Department`", () => {
    expect(() => parseDespacho(sinColumnas(VIEJO.rows, ["Segmento de negocio"]))).toThrow(/Segmento/);
    const conDept = conColumna(
      sinColumnas(VIEJO.rows, ["Segmento de negocio"]), "Department", () => "FOOTWEAR",
    );
    expect(() => parseDespacho(conDept)).not.toThrow();
    expect(parseDespacho(conDept).items[0].department).toBe("FOOTWEAR");
  });

  it("las columnas que no vinieron se DICEN, con la regla que las reemplaza", () => {
    const { ausentes } = parseDespacho(VIEJO.rows);
    const rotulos = ausentes.map((a) => a.rotulo);
    expect(rotulos).toContain("Category");
    expect(rotulos).toContain("Department");
    expect(ausentes.find((a) => a.rotulo === "Category")!.respaldo).toMatch(/SHOES/);
    // ⚠️ `PO NAME` NO se dice, y está bien: `BP Reference No.` la cubre, así que
    // no hay ningún respaldo que avisar. Solo falta cuando no está ninguna.
    expect(rotulos).not.toContain("PO NAME");
    expect(parseDespacho(sinColumnas(VIEJO.rows, ["BP Reference No."])).ausentes.map((a) => a.rotulo))
      .toContain("PO NAME");
    // La ropa SÍ trae Category: no se dice de más.
    expect(parseDespacho(NUEVO.rows).ausentes.map((a) => a.rotulo)).not.toContain("Category");
  });
});

describe("🔴 El PO NAME tiene TRES escalones, en este orden", () => {
  // Daniel, 17-sep-2026: «por ahora también se puede usar BP Reference No. como
  // poname». En los archivos reales dice `VIC` en calzado y `VIC- APP FW26` en
  // ropa — el mismo dato que la confirmación trae en su columna `PO NAME`.
  it("sin `PO NAME`, se usa `BP Reference No.`", () => {
    expect(parseDespacho(VIEJO.rows).items[0].po).toBe("VIC");
    expect(parseDespacho(NUEVO.rows).items[0].po).toBe("VIC- APP FW26");
  });

  it("con `PO NAME`, gana `PO NAME` — sin tocar nada", () => {
    const con = conColumna(VIEJO.rows, "PO NAME", () => "PO-FW26");
    expect(parseDespacho(con).items[0].po).toBe("PO-FW26");
  });

  it("sin ninguna de las dos, se agrupa por `Orden`", () => {
    const pelado = sinColumnas(VIEJO.rows, ["BP Reference No."]);
    expect(parseDespacho(pelado).items[0].po).toBe("3003902");
  });
});

describe("🔴 El Department se deriva por PALABRA ENTERA, nunca por `includes`", () => {
  it("los 23 segmentos de los dos archivos caen en una de las tres", () => {
    const segmentos = new Set<string>();
    for (const libro of [NUEVO.rows, VIEJO.rows]) {
      const H = (libro[0] ?? []).map((h) => String(h ?? "").trim());
      const i = H.indexOf("Segmento de negocio");
      for (const r of libro.slice(1)) segmentos.add(String((r ?? [])[i] ?? "").trim());
    }
    expect(segmentos.size).toBeGreaterThan(3);
    for (const s of segmentos) {
      expect(["FOOTWEAR", "APPAREL", "HARDWARE"], s).toContain(departmentDelSegmento(s));
    }
  });

  it.each([
    ["Reebok RUNNING CORE FTW MEN", "FOOTWEAR"],
    ["Reebok TRAINING APP MEN", "APPAREL"],
    ["REEBOK TRAINING ACC HW ALL", "HARDWARE"],
  ])("«%s» → %s", (seg, esperado) => expect(departmentDelSegmento(seg)).toBe(esperado));

  it("🩸 una palabra que CONTIENE el token no cuenta: `HWY`, `APPAREL`, `FTWEAR`", () => {
    // El repo ya se quemó con un `includes` («female» contiene «male»).
    expect(departmentDelSegmento("Reebok HWY 12 ALL")).toBe("");
    expect(departmentDelSegmento("Reebok APPAREL MEN")).toBe("");
    expect(departmentDelSegmento("Reebok FTWEAR MEN")).toBe("");
  });

  it("⚠️ lo que no dice ninguna de las tres NO se adivina: vacío y se cuenta", () => {
    expect(departmentDelSegmento("Reebok LO QUE SEA")).toBe("");
    expect(departmentDelSegmento("")).toBe("");
    const raro = VIEJO.rows.map((r, i) =>
      i === 0 ? r : (r ?? []).map((c, j) => (j === 9 ? "Reebok MISTERIO ALL" : c)),
    );
    const { segmentosDesconocidos, items } = parseDespacho(raro);
    expect(segmentosDesconocidos.length).toBeGreaterThan(0);
    expect(segmentosDesconocidos[0].valor).toBe("REEBOK MISTERIO ALL");
    expect(items[0].department).toBe("");
  });

  it("el rubro de respaldo es SHOES solo para el calzado", () => {
    expect(rubroDeRespaldo("FOOTWEAR")).toBe("SHOES");
    expect(rubroDeRespaldo("APPAREL")).toBe("");
    expect(rubroDeRespaldo("")).toBe("");
  });
});

describe("🔴 El archivo LLEGA a la pantalla, y la pantalla DICE cuál se subió", () => {
  const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");
  const dispatcher = leer("src/app/productos/cargar/DepuradorDispatcher.tsx");
  const cliente = leer("src/app/productos/cargar/ReebokClient.tsx");

  it("la dropzone única manda el despacho al flujo Reebok", () => {
    // Sin esto el archivo cae en el Depurador CK/TH y muestra un error.
    expect(dispatcher).toContain("findHeaderRowDespacho");
    expect(dispatcher).toMatch(/findHeaderRow\(rows\) !== -1 \|\| findHeaderRowDespacho\(rows\) !== -1/);
  });

  it("el cliente lo lee con `parseDespacho` y reconoce el formato ANTES que el viejo", () => {
    expect(cliente).toContain("parseDespacho");
    expect(cliente.indexOf("findHeaderRowDespacho(rows) !== -1"))
      .toBeLessThan(cliente.indexOf("parseReebok(rows, detected)"));
  });

  it("🔴 la pantalla dice CUÁL de los dos archivos se subió", () => {
    // Son dos documentos distintos del proveedor: de cada uno sale otro costo.
    expect(cliente).toContain("ROTULO_FORMATO[formato]");
    expect(cliente).toMatch(/confirmacion:\s*"[^"]*va a llegar/);
    expect(cliente).toMatch(/despacho:\s*"[^"]*llegó/);
  });

  it("en el despacho no se pregunta por la columna de mes: se dice `Quantity`", () => {
    expect(cliente).toMatch(/formato === "confirmacion" \? \(\s*<Field label="Columna de piezas \(mes\)">/);
    expect(cliente).toContain("Quantity (del despacho)");
  });

  it("las columnas que faltan y los segmentos raros se DICEN en pantalla", () => {
    expect(cliente).toContain("ausentes.map");
    expect(cliente).toContain("segmentosRaros.slice");
  });
});

/* ═════════════════════════════════════════════════════════════════════════
 * CONTROL — LA CONFIRMACIÓN DE COMPRA NO CAMBIÓ DE CONDUCTA
 * ═════════════════════════════════════════════════════════════════════════ */

describe("🔴 CONTROL: el archivo viejo sigue saliendo EXACTAMENTE igual", () => {
  const H = ["Order", "ClientName", "PO NAME", "New Article", "Old Article ", "SKU", "PREPACK FTW",
    "Name", "Department", "CAMPAÑAS", "PRIORIDAD", "OptionName", "CurveName", "CATEGORY",
    "AGE GROUP", "COLOR NAME", "GENDER", "SELL-IN QUARTER", "SPORTS CATEGORY", "Talla", "RRP",
    "WholesalePrice", "PREVENTA", "DROP", "FW26 FINAL", "JULIO", "COMENTARIOS", "DELIVERY", "UBICACIÓN"];
  const fila = (sku: string, talla: number | string): SheetRow => {
    const r: SheetRow = new Array(29).fill(null);
    r[2] = "VIC"; r[3] = "100000015"; r[5] = sku; r[7] = "CLUB C 85"; r[8] = "FOOTWEAR";
    r[13] = "SHOES"; r[14] = "Adult"; r[16] = "Female"; r[19] = talla; r[20] = 84.95;
    r[21] = 42.9; r[25] = 3;
    return r;
  };
  const rows: SheetRow[] = [[], H, fila("B-6", 6), fila("B-7", 7)];
  const { items } = parseReebok(rows, H.indexOf("JULIO"));
  const r = buildSwitchRows(items, { formula: REEBOK_FORMULA_A_DEFAULT, temporada: "2026-07", tasa: "7" })[0];

  it("el código de barra sigue siendo el SKU de la talla-muestra", () => {
    expect(r.cols["Código Barra *"]).toBe("B-7");
  });
  it("la Composición sigue SIEMPRE vacía", () => {
    expect(r.cols["Composición"]).toBe("");
  });
  it("el costo sigue saliendo del 0,80 asumido (42,90 × 0,80 = 34,32)", () => {
    expect(r.cols["Costo FOB *"]).toBe(34.32);
  });
  it("las piezas siguen siendo las del MES elegido", () => {
    expect(r.cols["Stock Ideal"]).toBe(6);
  });
});
