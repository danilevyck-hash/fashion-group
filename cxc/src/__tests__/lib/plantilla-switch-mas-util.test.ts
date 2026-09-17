// ─────────────────────────────────────────────────────────────────────────────
// LAS DOS PANTALLAS DE PLANTILLA SWITCH, MÁS ÚTILES (17-sep-2026)
//
// Daniel miró las dos pantallas —la de Reebok y la de Calvin/Tommy/KL— y pidió
// que fueran más eficientes. Cinco mejoras; TRES son el mismo código en las dos.
//
// 🔴 LA REGLA QUE MANDA SOBRE TODAS: **ESTO ES TODO PANTALLA.** No se movió un
// número del cálculo —ni el costo, ni el precio, ni el redondeo, ni la
// talla-muestra— y el Excel que se descarga sale con LAS MISMAS CELDAS que
// antes. Lo único que se le agregó es el filtro desde A1 y la fila de
// encabezados fija, que `cxc/CLAUDE.md` ya exigía para todo Excel del sistema y
// del que estos archivos se habían escapado.
//
// Lo que este candado exige:
//   1 · el costo del archivo se SUMA, no se recalcula, y un artículo sin costo
//       no vale cero: se saca de la suma y se cuenta;
//   2 · las facturas se dicen solo si el archivo las trae;
//   3 · «nuevo contra Switch» se cuenta por código, sin repetir, y falla ABIERTA;
//   4 · los dos rótulos salen de UNA constante compartida;
//   5 · el ámbar de CATEGORY de Reebok se separa del de Department/GENDER;
//   6 · el filtro de la vista previa sigue siendo UNO SOLO;
//   7 · 🔴 EL EXCEL NO CAMBIA: celda por celda, en las tres plantillas.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx-js-style";

import {
  costoDelArchivo,
  costoDeArticulos,
  facturasDelArchivo,
  contarContraSwitch,
  normalizarCodigo,
  plural,
} from "@/lib/depurador/resumen-del-archivo";
import { ROTULO_DESCARGAR_PLANTILLA, ROTULO_SUBIR_OTRO_ARCHIVO } from "@/lib/depurador/rotulos";
import { categoriasQueFaltan, inesperadosQueSeRevisan, listaConY } from "@/lib/depurador/reebok-categorias";
import { FILTRO_AMBAR, filaVisible, rotuloFiltro } from "@/lib/depurador/filtro-ambar";
import { filtroDesdeA1, workbookBytes } from "@/lib/excel-export";
import { OUT_COLS, TEXT_COLS, processRows, buildAoa, type SheetRow } from "@/lib/depurador/logic";
import {
  parseDespacho,
} from "@/lib/depurador/reebok-despacho";
import {
  buildSwitchRows,
  buildSwitchAoa,
  buildCatalogo,
  buildCatalogoAoa,
  valoresInesperados,
  REEBOK_FORMULA_A_DEFAULT,
  REEBOK_FORMULA_B_DEFAULT,
  REEBOK_EMPRESA_KEY,
  type ValorInesperado,
} from "@/lib/depurador/reebok";

const fila = (cols: Record<string, string | number | null>) => ({ cols });

/* ═══════════════ 1 · EL COSTO DEL ARCHIVO ════════════════════════════════ */

describe("🔴 el costo del archivo se SUMA, nunca se recalcula", () => {
  it("multiplica el costo de cada artículo por sus unidades", () => {
    const r = costoDelArchivo([
      fila({ "Costo FOB *": 4.02, "Costo CIF *": 4.42, "Stock Ideal": 12 }),
      fila({ "Costo FOB *": 10, "Costo CIF *": 11, "Stock Ideal": 3 }),
    ]);
    expect(r.fob).toBe(78.24);
    expect(r.cif).toBe(86.04);
    expect(r.conCosto).toBe(2);
    expect(r.sinCosto).toBe(0);
  });

  it("🔴 un artículo SIN costo no vale cero: sale de la suma y se cuenta", () => {
    const r = costoDelArchivo([
      fila({ "Costo FOB *": 10, "Costo CIF *": 11, "Stock Ideal": 2 }),
      fila({ "Costo FOB *": null, "Costo CIF *": null, "Stock Ideal": 100 }),
      fila({ "Costo FOB *": "", "Costo CIF *": "", "Stock Ideal": 50 }),
    ]);
    expect(r.fob).toBe(20);
    expect(r.cif).toBe(22);
    expect(r.sinCosto).toBe(2);
    expect(r.conCosto).toBe(1);
  });

  it("⚠️ medio costo es SIN costo: falta el CIF y el artículo no entra", () => {
    const r = costoDelArchivo([fila({ "Costo FOB *": 10, "Costo CIF *": null, "Stock Ideal": 5 })]);
    expect(r.fob).toBe(0);
    expect(r.sinCosto).toBe(1);
  });

  it("⚠️ un costo que de verdad es 0 SÍ cuenta (los servicios de CK/TH)", () => {
    const r = costoDelArchivo([fila({ "Costo FOB *": 0, "Costo CIF *": 0, "Stock Ideal": 0 })]);
    expect(r.sinCosto).toBe(0);
    expect(r.conCosto).toBe(1);
  });

  it("la preforma de Reebok usa LA MISMA suma (una sola en el módulo)", () => {
    const porColumnas = costoDelArchivo([fila({ "Costo FOB *": 3.52, "Costo CIF *": 3.87, "Stock Ideal": 7 })]);
    const porArticulos = costoDeArticulos([{ fob: 3.52, cif: 3.87, unidades: 7 }]);
    expect(porArticulos).toEqual(porColumnas);
  });
});

/* ═══════════════ 2 · LAS FACTURAS DEL ARCHIVO ════════════════════════════ */

describe("🔴 las facturas se dicen solo si el archivo las trae", () => {
  it("sin repetir y en orden de aparición", () => {
    expect(facturasDelArchivo([3971, 3971, 3970, 3971])).toEqual(["3971", "3970"]);
  });

  it("🔴 un archivo sin facturas no inventa ninguna", () => {
    expect(facturasDelArchivo(["", null, undefined, "   "])).toEqual([]);
  });

  it("⚠️ el valor va TAL CUAL: un cero adelante no se cae", () => {
    expect(facturasDelArchivo([" 0039 "])).toEqual(["0039"]);
  });
});

/* ═══════════════ 3 · NUEVO CONTRA SWITCH ═════════════════════════════════ */

describe("🔴 qué es nuevo y qué ya está en Switch", () => {
  it("cuenta por código, sin repetir", () => {
    const r = contarContraSwitch(["A1", "A1", "B2", "C3"], new Set(["A1"]));
    expect(r).toEqual({ nuevos: 2, yaEstan: 1 });
  });

  it("normaliza recortando y subiendo a mayúsculas", () => {
    expect(normalizarCodigo(" accs055 ")).toBe("ACCS055");
    expect(contarContraSwitch([" accs055 "], new Set(["ACCS055"]))).toEqual({ nuevos: 0, yaEstan: 1 });
  });

  it("⚠️ FALLA ABIERTA: sin nada en Switch, todo es nuevo y nada revienta", () => {
    expect(contarContraSwitch(["A1", "B2"], new Set())).toEqual({ nuevos: 2, yaEstan: 0 });
  });

  it("Reebok pregunta por SU empresa, que es constante del servidor", () => {
    expect(REEBOK_EMPRESA_KEY).toBe("active_shoes");
  });
});

/* ═══════════════ 4 · LOS DOS RÓTULOS COMPARTIDOS ═════════════════════════ */

describe("🔴 los botones se llaman igual en las dos pantallas", () => {
  const ARCHIVOS = [
    "src/app/productos/cargar/ReebokClient.tsx",
    "src/app/productos/cargar/DepuradorClient.tsx",
  ];
  const fuente = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

  it("los rótulos son los que Daniel aprobó", () => {
    expect(ROTULO_DESCARGAR_PLANTILLA).toBe("Descargar plantilla Switch");
    expect(ROTULO_SUBIR_OTRO_ARCHIVO).toBe("Subir otro archivo");
  });

  it("las dos pantallas los leen de la constante", () => {
    for (const p of ARCHIVOS) {
      const s = fuente(p);
      expect(s, p).toContain("ROTULO_DESCARGAR_PLANTILLA");
      expect(s, p).toContain("ROTULO_SUBIR_OTRO_ARCHIVO");
    }
  });

  it("🔴 barrido: ninguna de las dos vuelve a escribirlos a mano", () => {
    for (const p of ARCHIVOS) {
      const s = fuente(p);
      expect(s, p).not.toContain('"Descargar plantilla Switch"');
      expect(s, p).not.toContain('"Descargar plantilla"');
      expect(s, p).not.toMatch(/>\s*Otro archivo\s*</);
    }
  });
});

/* ═══════════════ 5 · EL ÁMBAR DE REEBOK ══════════════════════════════════ */

const inesperado = (columna: ValorInesperado["columna"], valor: string, articulos: string[]): ValorInesperado =>
  ({ columna, valor, articulos });

describe("🔴 el ámbar de CATEGORY deja de pedir que se revise nada", () => {
  const LISTA = [
    inesperado("CATEGORY", "T-SHIRTS", Array.from({ length: 22 }, (_, i) => `T${i}`)),
    inesperado("CATEGORY", "BRA", ["B1", "B2", "B3"]),
    inesperado("CATEGORY", "TOPS", ["O1", "O2", "O3"]),
    inesperado("CATEGORY", "JACKETS", ["J1", "J2"]),
    inesperado("GENDER", "BOYS", ["G1"]),
    inesperado("Department", "", ["D1"]),
  ];

  it("las CATEGORY se cuentan aparte, con sus productos sin repetir", () => {
    const r = categoriasQueFaltan(LISTA)!;
    expect(r.categorias).toEqual(["T-SHIRTS", "BRA", "TOPS", "JACKETS"]);
    expect(r.productos).toBe(30);
  });

  it("⚠️ el aviso de Department y GENDER NO cambia: sigue pidiendo revisar", () => {
    const r = inesperadosQueSeRevisan(LISTA);
    expect(r.map((v) => v.columna)).toEqual(["GENDER", "Department"]);
  });

  it("sin CATEGORY rara, el aviso de categorías no existe", () => {
    expect(categoriasQueFaltan([inesperado("GENDER", "BOYS", ["G1"])])).toBeNull();
  });

  it("🔴 una CATEGORY VACÍA no es una categoría que falte: va al aviso de revisar", () => {
    const vacia = [inesperado("CATEGORY", "(vacío)", ["Z1"])];
    expect(categoriasQueFaltan(vacia)).toBeNull();
    expect(inesperadosQueSeRevisan(vacia)).toHaveLength(1);
  });

  it("la lista se lee como se habla", () => {
    expect(listaConY(["T-SHIRTS", "BRA", "TOPS", "JACKETS"])).toBe("T-SHIRTS, BRA, TOPS y JACKETS");
    expect(listaConY(["BRA"])).toBe("BRA");
  });

  it("🔴 una columna NUEVA cae del lado que pide revisar, nunca en silencio", () => {
    const rara = { columna: "AGE GROUP", valor: "?", articulos: ["X"] } as unknown as ValorInesperado;
    expect(inesperadosQueSeRevisan([rara])).toHaveLength(1);
    expect(categoriasQueFaltan([rara])).toBeNull();
  });
});

/* ═══════════════ 6 · UN SOLO MECANISMO DE FILTRADO ═══════════════════════ */

describe("🔴 el ámbar de CK/TH lleva a los estilos, sin un segundo filtro", () => {
  const filas = [
    { cols: { "Descripción *": "Men-Polos S/S" }, fallback: false },
    { cols: { "Descripción *": "Men-T-Shirts S/S" }, fallback: true },
  ];

  it("«» = todas", () => {
    expect(filas.filter((f) => filaVisible(f, ""))).toHaveLength(2);
  });

  it("el valor ámbar deja solo las que hay que revisar", () => {
    const v = filas.filter((f) => filaVisible(f, FILTRO_AMBAR));
    expect(v).toHaveLength(1);
    expect(v[0].cols["Descripción *"]).toBe("Men-T-Shirts S/S");
  });

  it("una descripción filtra por igualdad, nunca por parecido", () => {
    expect(filas.filter((f) => filaVisible(f, "Men-Polos S/S"))).toHaveLength(1);
    expect(filas.filter((f) => filaVisible(f, "Men-Polos"))).toHaveLength(0);
  });

  it("⚠️ el valor crudo del filtro ámbar no se le muestra a nadie", () => {
    expect(rotuloFiltro(FILTRO_AMBAR)).toBe("los que hay que revisar");
    expect(rotuloFiltro(FILTRO_AMBAR)).not.toContain("__");
    expect(rotuloFiltro("Men-Polos S/S")).toBe("Men-Polos S/S");
  });

  it("🔴 la pantalla usa el filtro compartido, no su propia comparación", () => {
    const s = fs.readFileSync(path.join(process.cwd(), "src/app/productos/cargar/DepuradorClient.tsx"), "utf8");
    expect(s).toContain("filaVisible(d, descFilter)");
    expect(s).not.toContain('norm(d.cols["Descripción *"]) === q');
  });
});

/* ═══════════════ singular y plural ═══════════════════════════════════════ */

describe("«1 marca(s)» pasa a «1 marca»", () => {
  it("elige la forma según el número", () => {
    expect(plural(1, "marca", "marcas")).toBe("marca");
    expect(plural(2, "marca", "marcas")).toBe("marcas");
    expect(plural(0, "marca", "marcas")).toBe("marcas");
  });

  it("🔴 ni «marca(s)» ni «estilo(s)» vuelven a la fila de totales", () => {
    const s = fs.readFileSync(path.join(process.cwd(), "src/app/productos/cargar/DepuradorClient.tsx"), "utf8");
    expect(s).not.toContain("marca(s)");
    expect(s).not.toContain("estilo(s)");
  });
});

/* ═══════════════ 7 · 🔴 EL EXCEL NO CAMBIA ═══════════════════════════════ */
//
// La prueba es celda por celda: se arma el MISMO libro dos veces —como salía
// antes (sin filtro, `XLSX.write` a secas) y como sale hoy (con filtro, por
// `workbookBytes`)—, se leen los dos de vuelta y se comparan todas las celdas
// de todas las hojas. Lo único que puede diferir es el `<autoFilter>`, su
// `_xlnm._FilterDatabase` y el `<pane>` — y eso se exige que ESTÉ.

const FIXTURES = path.join(process.cwd(), "src/__tests__/fixtures");
const leerHoja = (archivo: string): { rows: SheetRow[]; hoja: string } => {
  const wb = XLSX.read(fs.readFileSync(path.join(FIXTURES, archivo)), { type: "buffer" });
  const hoja = wb.SheetNames[0];
  return {
    rows: XLSX.utils.sheet_to_json(wb.Sheets[hoja], { header: 1, raw: true, defval: null }) as SheetRow[],
    hoja,
  };
};

/** Las celdas de un .xlsx, hoja por hoja: valor, tipo y formato. */
function celdasDe(bytes: Uint8Array): Record<string, Record<string, unknown>> {
  const wb = XLSX.read(bytes, { type: "array" });
  const out: Record<string, Record<string, unknown>> = {};
  for (const nombre of wb.SheetNames) {
    const ws = wb.Sheets[nombre] as Record<string, { v?: unknown; t?: string; z?: string }>;
    const celdas: Record<string, unknown> = {};
    for (const addr of Object.keys(ws)) {
      if (addr.startsWith("!")) continue;
      const c = ws[addr];
      celdas[addr] = { v: c.v, t: c.t, z: c.z };
    }
    out[nombre] = celdas;
  }
  return out;
}

/** Arma la hoja igual que la pantalla: AOA → texto forzado → anchos. */
function hojaDeAoa(aoa: (string | number)[][], textCols: number[]): XLSX.WorkSheet {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const range = XLSX.utils.decode_range(ws["!ref"] as string);
  for (let R = 1; R <= range.e.r; R++) {
    for (const C of textCols) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      const celda = (ws as Record<string, { t?: string; v?: unknown; z?: string }>)[addr];
      if (celda) { celda.t = "s"; celda.v = String(celda.v); celda.z = "@"; }
    }
  }
  return ws;
}

const libroCon = (ws: XLSX.WorkSheet, nombre: string): XLSX.WorkBook => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, nombre);
  return wb;
};

const texto = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);

describe("🔴 EL EXCEL DESCARGADO NO CAMBIA — celda por celda", () => {
  const casos: { nombre: string; aoa: () => (string | number)[][]; textCols: number[]; hoja: string }[] = [
    {
      nombre: "plantilla Switch de Reebok (despacho de ropa)",
      hoja: "upload",
      textCols: TEXT_COLS,
      aoa: () => {
        const { rows } = leerHoja("reebok-despacho-nuevo-ropa.xlsx");
        const { items } = parseDespacho(rows);
        return buildSwitchAoa(buildSwitchRows(items, {
          formula: REEBOK_FORMULA_A_DEFAULT, temporada: "2026-09", tasa: "07",
        }));
      },
    },
    {
      nombre: "preforma de Reebok (pedido para cliente)",
      hoja: "Pedido",
      textCols: [1],
      aoa: () => {
        const { rows } = leerHoja("reebok-despacho-viejo-calzado.xlsx");
        const { items } = parseDespacho(rows);
        return buildCatalogoAoa(
          buildCatalogo(items, { formulaA: REEBOK_FORMULA_A_DEFAULT, formulaB: REEBOK_FORMULA_B_DEFAULT }),
          "SEPTIEMBRE",
        );
      },
    },
    {
      nombre: "plantilla Switch de Calvin/Tommy/KL",
      hoja: "upload",
      textCols: TEXT_COLS,
      aoa: () => {
        const filas: SheetRow[] = [
          ["REFERENCIA", "FACT.", "P_CATEGORY", "EAN", "TALLA", "CANTIDAD", "COSTO", "PRECIO2", "MARCA", "PROVEEDOR"],
          ["CK-1", "0039", "Men-Polos S/S", "7612345678901", "M", 4, 10, 25, "CK Underwear", "American Designer Fashion"],
          ["CK-2", "0039", "Women-Sandals", "7612345678902", "38", 2, 20, 50, "CK Footwear", "American Designer Fashion"],
        ];
        return buildAoa(processRows(filas, { factor: 1.1, tasa: "7", mesIdx: 8, anio: "2026" }).rows);
      },
    },
  ];

  for (const caso of casos) {
    it(`${caso.nombre}: mismas celdas antes y después`, () => {
      const aoa = caso.aoa();
      expect(aoa.length).toBeGreaterThan(1);

      // Como salía ANTES: sin filtro y con `XLSX.write` a secas.
      const antes = new Uint8Array(
        XLSX.write(libroCon(hojaDeAoa(aoa, caso.textCols), caso.hoja), { bookType: "xlsx", type: "array" }) as ArrayBuffer,
      );
      // Como sale HOY: con el filtro desde A1, por el camino común.
      const wsHoy = hojaDeAoa(aoa, caso.textCols);
      wsHoy["!autofilter"] = { ref: filtroDesdeA1(aoa) };
      const hoy = workbookBytes(libroCon(wsHoy, caso.hoja));

      expect(celdasDe(hoy)).toEqual(celdasDe(antes));
    });

    it(`${caso.nombre}: gana el filtro desde A1 y la fila de encabezados fija`, () => {
      const aoa = caso.aoa();
      const ws = hojaDeAoa(aoa, caso.textCols);
      ws["!autofilter"] = { ref: filtroDesdeA1(aoa) };
      const bytes = texto(workbookBytes(libroCon(ws, caso.hoja)));
      expect(bytes).toContain(`<autoFilter ref="A1:`);
      expect(bytes).toContain(`<pane ySplit="1"`);
      expect(bytes).toContain(`state="frozen"`);
    });
  }

  it("el `ref` del filtro cubre la tabla entera y arranca en A1", () => {
    expect(filtroDesdeA1([OUT_COLS.slice(), OUT_COLS.slice(), OUT_COLS.slice()])).toBe("A1:Y3");
    expect(filtroDesdeA1([["a"]])).toBe("A1:A1");
  });

  it("🔴 las 25 columnas y su orden no se tocaron", () => {
    expect(OUT_COLS).toHaveLength(25);
    expect(OUT_COLS[0]).toBe("Código *");
    expect(OUT_COLS[6]).toBe("Costo FOB *");
    expect(OUT_COLS[7]).toBe("Costo CIF *");
    expect(TEXT_COLS).toEqual([0, 1, 2]);
  });

  it("🔴 el «Document Number» NO entra a ninguna de las 25 columnas", () => {
    const { rows } = leerHoja("reebok-despacho-nuevo-ropa.xlsx");
    const { items } = parseDespacho(rows);
    // El dato SÍ se leyó (la pantalla lo dice)…
    expect(facturasDelArchivo(items.map((it) => it.documento)).length).toBeGreaterThan(0);
    // …y NO aparece en una sola celda del Excel.
    const aoa = buildSwitchAoa(buildSwitchRows(items, {
      formula: REEBOK_FORMULA_A_DEFAULT, temporada: "2026-09", tasa: "07",
    }));
    const preforma = buildCatalogoAoa(
      buildCatalogo(items, { formulaA: REEBOK_FORMULA_A_DEFAULT, formulaB: REEBOK_FORMULA_B_DEFAULT }),
      "SEPTIEMBRE",
    );
    const facturas = new Set(facturasDelArchivo(items.map((it) => it.documento)));
    for (const fila of [...aoa.slice(1), ...preforma.slice(1)]) {
      for (const celda of fila) expect(facturas.has(String(celda))).toBe(false);
    }
  });

  it("🔴 la preforma tampoco lleva el costo: el `fob` nuevo es solo de pantalla", () => {
    const { rows } = leerHoja("reebok-despacho-viejo-calzado.xlsx");
    const { items } = parseDespacho(rows);
    const filas = buildCatalogo(items, { formulaA: REEBOK_FORMULA_A_DEFAULT, formulaB: REEBOK_FORMULA_B_DEFAULT });
    expect(filas.some((f) => f.fob !== null)).toBe(true);
    const aoa = buildCatalogoAoa(filas, "SEPTIEMBRE");
    expect(aoa[0]).not.toContain("Costo");
    expect(aoa[0]).toHaveLength(10);
  });
});

/* ═══════════════ el costo medido sobre los archivos reales ═══════════════ */

describe("el costo sale de las mismas filas que el Excel", () => {
  it("despacho de ropa: FOB y CIF cuadran con lo que suma el archivo", () => {
    const { rows } = leerHoja("reebok-despacho-nuevo-ropa.xlsx");
    const { items } = parseDespacho(rows);
    const filas = buildSwitchRows(items, { formula: REEBOK_FORMULA_A_DEFAULT, temporada: "2026-09", tasa: "07" });
    const r = costoDelArchivo(filas);
    // A mano, desde las 25 columnas: la misma cuenta, sin el módulo.
    const aMano = filas.reduce((s, f) => s + Number(f.cols["Costo FOB *"]) * Number(f.cols["Stock Ideal"]), 0);
    expect(r.fob).toBe(Math.round(aMano * 100) / 100);
    expect(r.sinCosto).toBe(0);
    expect(r.conCosto).toBe(filas.length);
    // 🔴 Y LOS NÚMEROS MEDIDOS, clavados: el CIF es MAYOR que el FOB (lleva el
    // flete encima) y las dos columnas no se pueden cambiar de lugar sin que
    // esto se ponga rojo. Medido el 17-sep-2026 sobre este archivo.
    expect(r.fob).toBe(481.56);
    expect(r.cif).toBe(529.68);
    expect(r.cif).toBeGreaterThan(r.fob);
    expect(filas).toHaveLength(5);
    expect(filas.reduce((s, f) => s + f.piezas, 0)).toBe(48);
  });

  it("despacho de calzado: los mismos números, medidos", () => {
    const { rows } = leerHoja("reebok-despacho-viejo-calzado.xlsx");
    const { items } = parseDespacho(rows);
    const filas = buildSwitchRows(items, { formula: REEBOK_FORMULA_A_DEFAULT, temporada: "2026-09", tasa: "07" });
    const r = costoDelArchivo(filas);
    expect(r.fob).toBe(1352.16);
    expect(r.cif).toBe(1487.40);
    expect(filas).toHaveLength(4);
    expect(filas.reduce((s, f) => s + f.piezas, 0)).toBe(42);
  });

  it("las facturas del despacho son las del archivo, sin repetir", () => {
    const { rows } = leerHoja("reebok-despacho-nuevo-ropa.xlsx");
    const { items } = parseDespacho(rows);
    expect(facturasDelArchivo(items.map((it) => it.documento))).toEqual(["3971"]);
  });

  it("el ámbar de CATEGORY del despacho de ropa habla de categorías, no de artículos", () => {
    const { rows } = leerHoja("reebok-despacho-nuevo-ropa.xlsx");
    const { items } = parseDespacho(rows);
    const faltan = categoriasQueFaltan(valoresInesperados(items));
    expect(faltan?.categorias).toContain("T-SHIRTS");
    expect(faltan?.categorias).toContain("JACKETS");
  });
});
