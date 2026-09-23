// ============================================================================
// CANDADO — pieza (D) del rediseño de Marketing (22-sep-2026).
//
// Cuida tres cosas que Daniel decidió mirando papeles reales:
//
//   1. 🔴 TODOS LOS MESES SIN PAGAR de una impulsadora, el más viejo arriba.
//      La tarjeta miraba DOS meses y un mes de hace cinco desaparecía.
//   2. 🔴 EL EXCEL QUE LEE LA MARCA sale limpio: sin la nota interna, sin el
//      nombre de las empresas del grupo en el concepto, con UNA grafía por
//      proveedor, y SOLO con lo que se reporta.
//   3. 🔴 LOS LINKS FIRMADOS DURAN 30 DÍAS, no un año — y cada ZIP que se baja
//      queda anotado sin pisar los anteriores.
//
// El bloque del Excel corre contra un doble EN MEMORIA de PostgREST: el módulo
// se ejecuta de verdad y el test ABRE el archivo que sale. Probar la limpieza
// aparte no habría probado que llega a la celda.
// ============================================================================
import { describe, it, expect, beforeEach, vi } from "vitest";
import XLSX from "xlsx-js-style";

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= "test-anon-key";
  process.env.SESSION_SECRET ||= "test-secret";
});

// ── Doble de PostgREST ──────────────────────────────────────────────────────
type Fila = Record<string, unknown>;
const tablas: Record<string, Fila[]> = {};
/** Columnas que la base dice NO tener (para probar el falla-abierto). */
const columnasAusentes = new Set<string>();

class Consulta implements PromiseLike<{ data: unknown; error: unknown }> {
  private filtros: Array<(f: Fila) => boolean> = [];
  private cols = "";
  constructor(private tabla: string) {}
  select(cols?: string) {
    this.cols = cols ?? "";
    return this;
  }
  eq(col: string, val: unknown) {
    this.filtros.push((f) => f[col] === val);
    return this;
  }
  in(col: string, vals: unknown[]) {
    const set = new Set(vals);
    this.filtros.push((f) => set.has(f[col]));
    return this;
  }
  is(col: string, val: unknown) {
    this.filtros.push((f) => (val === null ? f[col] == null : f[col] === val));
    return this;
  }
  then<A, B>(
    ok?: (v: { data: unknown; error: unknown }) => A | PromiseLike<A>,
    bad?: (r: unknown) => B | PromiseLike<B>,
  ): PromiseLike<A | B> {
    for (const col of columnasAusentes) {
      if (this.cols.includes(col)) {
        return Promise.resolve({
          data: null,
          error: { code: "42703", message: `column ${col} does not exist` },
        }).then(ok, bad);
      }
    }
    const filas = tablas[this.tabla];
    if (!filas) {
      return Promise.resolve({
        data: null,
        error: { code: "PGRST205", message: `no existe ${this.tabla}` },
      }).then(ok, bad);
    }
    // Se devuelven SOLO las columnas pedidas, como PostgREST: si la consulta
    // de respaldo no pide `se_reporta`, la fila llega sin ella — que es
    // exactamente la situación «todavía no corrió la migración».
    const pedidas = this.cols
      .split(",")
      .map((c) => c.trim())
      .filter((c) => c.length > 0 && c !== "*");
    const recortar = (f: Fila): Fila => {
      if (pedidas.length === 0) return { ...f };
      const out: Fila = {};
      for (const c of pedidas) if (c in f) out[c] = f[c];
      return out;
    };
    const data = filas.filter((f) => this.filtros.every((p) => p(f))).map(recortar);
    return Promise.resolve({ data, error: null }).then(ok, bad);
  }
}

const storage: Record<string, Buffer> = {};

vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: {
    from: (t: string) => new Consulta(t),
    storage: {
      from: () => ({
        download: async (path: string) =>
          storage[path]
            ? { data: { arrayBuffer: async () => storage[path] }, error: null }
            : { data: null, error: { message: "no existe" } },
        createSignedUrls: async (paths: string[], ttl: number) => {
          ttlsPedidos.push(ttl);
          return {
            data: paths.map((p) => ({ path: p, signedUrl: `https://firmado/${p}` })),
            error: null,
          };
        },
        createSignedUrl: async (path: string, ttl: number) => {
          ttlsPedidos.push(ttl);
          return { data: { signedUrl: `https://firmado/${path}` }, error: null };
        },
      }),
    },
  },
}));
/** Los TTL con los que se firmó, para el candado de los 30 días. */
const ttlsPedidos: number[] = [];

vi.mock("sharp", () => ({
  default: () => ({
    rotate: function () {
      return this;
    },
    resize: function () {
      return this;
    },
    jpeg: function () {
      return this;
    },
    toBuffer: async () => Buffer.from("jpeg"),
  }),
}));
vi.mock("@/lib/marketing/entrega-comprobante", () => ({
  cargarComprobantes: async (ids: string[]) =>
    new Map(ids.map((id) => [id, { entregaId: id, numero: 1, fecha: "2026-05-02", cliente: "X", items: [] }])),
}));
vi.mock("@/lib/marketing/pdf-entrega-mueble", () => ({
  buildComprobanteEntregaPdf: () => Buffer.from("%PDF"),
  nombreArchivoComprobante: () => "2026-06-22 · Entrega de mobiliario ME-0001",
  numeroComprobante: () => "ME-0001",
}));

import { buildExcelDeMarca } from "@/lib/marketing/zip-marca";
import { mesesSinPagar, resumenDeLoQueDebe } from "@/lib/marketing/meses-sin-pagar";
import {
  grafiaDeProveedor,
  grafiasUnicasDeProveedor,
  limpiarTextoParaLaMarca,
  porcionDeLaFactura,
  proveedorParaLaMarca,
  subtituloParaLaMarca,
  NOMBRES_DE_LAS_EMPRESAS,
} from "@/lib/marketing/papel-de-la-marca";
import {
  TTL_LINK_ZIP_SEGUNDOS,
  TTL_LINK_ZIP_VIEJO_SEGUNDOS,
  ZIP_E_IMPULSADORAS_NUEVO,
  esPathFirmable,
  pathDelZipGuardado,
  ttlDeLinkDelZip,
} from "@/lib/marketing/zip-e-impulsadoras";
import { anotarZip } from "@/lib/marketing/periodo-estado";
import { etiquetaMes } from "@/lib/marketing/meses";

// ────────────────────────────────────────────────────────────────────────────
// 1. IMPULSADORAS — todos los meses sin pagar, el más viejo arriba
// ────────────────────────────────────────────────────────────────────────────

const mes = (m: string, d = 1) => ({ desde: `${m}-01`, hasta: `${m}-${String(d).padStart(2, "0")}` });

describe("impulsadoras — TODOS los meses sin pagar", () => {
  // 🔴 EL CANDADO QUE MÁS IMPORTA DEL BLOQUE. Es el defecto que Daniel
  //    reportó: un mes sin pagar más viejo que los dos que miraba la pantalla
  //    no aparecía en ningún lado.
  it("un mes sin pagar de hace 5 meses SALE en la lista", () => {
    const pagados = [
      mes("2026-03", 31), // abril de 2026 quedó sin pagar
      mes("2026-05", 31),
      mes("2026-06", 30),
      mes("2026-07", 31),
      mes("2026-08", 31),
    ];
    const faltan = mesesSinPagar(pagados, "2026-09-22");
    const meses = faltan.map((m) => m.mes);
    expect(meses).toContain("2026-04-01"); // ← hace 5 meses
    expect(meses[0]).toBe("2026-04-01"); // ← y va ARRIBA
    expect(meses[meses.length - 1]).toBe("2026-09-01");
  });

  it("empieza en el PRIMER pago y termina en el mes de hoy (Panamá)", () => {
    const faltan = mesesSinPagar([mes("2026-06", 30)], "2026-09-22");
    expect(faltan.map((m) => m.mes)).toEqual(["2026-07-01", "2026-08-01", "2026-09-01"]);
  });

  it("sin ningún pago no se inventa una deuda", () => {
    expect(mesesSinPagar([], "2026-09-22")).toEqual([]);
  });

  it("un mes a medias cuenta como sin pagar y DICE qué días faltan", () => {
    const faltan = mesesSinPagar([{ desde: "2026-09-01", hasta: "2026-09-15" }], "2026-09-22");
    expect(faltan).toHaveLength(1);
    expect(faltan[0].estado).toBe("parcial");
    expect(faltan[0].faltan).toBe("16–30");
  });

  it("el resumen dice cuántos debe, cuántos a medias y cuál es el más viejo", () => {
    const faltan = mesesSinPagar([mes("2026-06", 30), { desde: "2026-08-01", hasta: "2026-08-15" }], "2026-09-22");
    const texto = resumenDeLoQueDebe(faltan, (m) => etiquetaMes(m).toLowerCase());
    expect(texto).toContain("3 meses");
    expect(texto).toContain("1 a medias");
    expect(texto).toContain("julio 2026");
    expect(resumenDeLoQueDebe([], etiquetaMes)).toBe("");
  });

  it("una fecha disparatada no dibuja diez mil meses", () => {
    const faltan = mesesSinPagar([{ desde: "1024-01-01", hasta: "1024-01-31" }], "2026-09-22");
    expect(faltan.length).toBeLessThanOrEqual(600);
    // y el mes de HOY nunca se pierde por el recorte
    expect(faltan[faltan.length - 1].mes).toBe("2026-09-01");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 2. EL PAPEL QUE LEE LA MARCA — las tres reglas, en módulo puro
// ────────────────────────────────────────────────────────────────────────────

describe("el papel de la marca — las tres reglas", () => {
  it("el nombre de las empresas del grupo se DERIVA, no se escribe a mano", () => {
    expect(NOMBRES_DE_LAS_EMPRESAS).toContain("fashion wear");
    expect(NOMBRES_DE_LAS_EMPRESAS).toContain("confecciones boston");
    expect(NOMBRES_DE_LAS_EMPRESAS).toContain("fashion wear inc"); // del nombre LEGAL
    // El más largo primero: «confecciones boston» antes que «boston».
    const i = NOMBRES_DE_LAS_EMPRESAS.indexOf("confecciones boston");
    const j = NOMBRES_DE_LAS_EMPRESAS.indexOf("boston");
    expect(i).toBeLessThan(j);
  });

  it("el concepto real de Tommy pierde el nombre de la empresa y nada más", () => {
    expect(limpiarTextoParaLaMarca("Pago de espacio (mueble) en tienda para Fashion Wear Inc.")).toBe(
      "Pago de espacio (mueble) en tienda",
    );
  });

  it("un concepto sin nombre de empresa NO se toca", () => {
    const tal = "Plantilla para instalación y letrero PVC con adhesivo full color para Tommy Hilfiger";
    expect(limpiarTextoParaLaMarca(tal)).toBe(tal);
  });

  it("el proveedor sale en UNA grafía: el sufijo de sociedad, siempre igual", () => {
    const crudos = [
      "Impresora Comercial S a",
      "Grupo City Mall S.a.",
      "Grupo Monat, S.a.",
      "Iluminaciones Tecnicas, S.a",
      "Cerantola Global Corp.",
      "Impreco",
    ];
    const g = grafiasUnicasDeProveedor(crudos);
    const salida = crudos.map((c) => proveedorParaLaMarca(c, g));
    expect(salida).toEqual([
      "Impresora Comercial, S.A.",
      "Grupo City Mall, S.A.",
      "Grupo Monat, S.A.",
      "Iluminaciones Tecnicas, S.A.",
      "Cerantola Global Corp.",
      "Impreco",
    ]);
    // Cuatro formas del sufijo en el archivo real → UNA.
    const colas = new Set(salida.filter((s) => /s\.a\./i.test(s)).map((s) => s.slice(s.lastIndexOf(","))));
    expect(colas.size).toBe(1);
  });

  it("el mismo proveedor escrito de dos formas se unifica en la MÁS USADA", () => {
    const g = grafiasUnicasDeProveedor([
      "Premium Paint Panama",
      "Premium Paint Panama",
      "PREMIUM PAINT PANAMÁ S. A",
    ]);
    expect(proveedorParaLaMarca("PREMIUM PAINT PANAMÁ S. A", g)).toBe("Premium Paint Panama");
  });

  it("un proveedor que es una persona no se toca", () => {
    expect(grafiaDeProveedor("Krysthel Yanneth Morales Martinez")).toBe(
      "Krysthel Yanneth Morales Martinez",
    );
  });

  it("el subtítulo no le cuenta a la marca nada de adentro", () => {
    const hecho = subtituloParaLaMarca({
      nombrePeriodo: "mid 2026",
      estado: "cerrado",
      cerradoEn: null,
      hoyFormateado: "20 sept 2026",
      formatearFecha: (s) => s,
    });
    expect(hecho).not.toContain("sin reporte guardado");
    expect(hecho).not.toContain("calculado");
    expect(hecho).toContain("cerrado");
  });

  it("una marca = 100 %: el reparto ya no divide por la suma de porcentajes", () => {
    // Las 72 facturas guardadas «al 50 %» son el modelo viejo, no un reparto.
    expect(porcionDeLaFactura(26750, [{ marcaId: "th", pct: 50 }], "th")).toBe(26750);
    expect(porcionDeLaFactura(100, [{ marcaId: "th", pct: 100 }], "th")).toBe(100);
    expect(porcionDeLaFactura(100, [{ marcaId: "ck", pct: 100 }], "th")).toBe(0);
    // La red sigue puesta por si alguna vez llegara una repartida.
    expect(
      porcionDeLaFactura(100, [{ marcaId: "th", pct: 30 }, { marcaId: "ck", pct: 70 }], "th"),
    ).toBe(30);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 3. EL EXCEL DE VERDAD — se arma, se abre y se mira
// ────────────────────────────────────────────────────────────────────────────

const M_TH = "m-th";
const P_ABIERTO = "per-abierto";

function sembrar(): void {
  for (const k of Object.keys(tablas)) delete tablas[k];
  for (const k of Object.keys(storage)) delete storage[k];
  columnasAusentes.clear();
  ttlsPedidos.length = 0;

  tablas.mk_marcas = [
    { id: M_TH, nombre: "Tommy Hilfiger", codigo: "TH", empresa_codigo: "fashion_wear" },
  ];
  tablas.mk_periodos = [
    { id: P_ABIERTO, proveedor_key: "pvh", nombre: "Período 2026", estado: "abierto", reporte: null },
  ];
  tablas.mk_proyectos = [
    { id: "p1", nombre: "Letreros", tienda: "City Mall David", tienda_codigo: "D-24", anulado_en: null },
  ];
  tablas.clientes_master = [{ codigo: "D-24", nombre: "City Mall David" }];
  tablas.mk_facturas = [
    fact("f1", "A-1", "2026-03-04", "Pago de espacio (mueble) en tienda para Fashion Wear Inc.", "Impresora Comercial S a", 100),
    fact("f2", "A-2", "2026-03-05", "Letrero PVC", "Grupo Monat, S.a.", 50),
    // 🔴 Apagado: se guarda, se ve en la tienda, NO va al ZIP.
    fact("f3", "A-3", "2026-03-06", "Mueble que no se reporta", "Impreco", 999, { se_reporta: false }),
  ];
  tablas.mk_factura_marcas = [
    { factura_id: "f1", marca_id: M_TH, porcentaje: 50 },
    { factura_id: "f2", marca_id: M_TH, porcentaje: 100 },
    { factura_id: "f3", marca_id: M_TH, porcentaje: 100 },
  ];
  tablas.mk_entregas_muebles = [];
  tablas.mk_periodo_documentos = [];
  tablas.mk_adjuntos = [
    { id: "a1", tipo: "pdf_factura", factura_id: "f1", proyecto_id: null, url: "fact/f1.pdf", nombre_original: "f1.pdf" },
  ];
  for (const a of tablas.mk_adjuntos) storage[String(a.url)] = Buffer.from("bytes");
}

function fact(
  id: string,
  numero: string,
  fecha: string,
  concepto: string,
  proveedor: string,
  total: number,
  extra: Fila = {},
): Fila {
  return {
    id,
    proyecto_id: "p1",
    numero_factura: numero,
    fecha_factura: fecha,
    proveedor,
    concepto,
    subtotal: total,
    total,
    impulsadora_id: null,
    impulsadora_mes: null,
    periodo_desde: null,
    periodo_hasta: null,
    anulado_en: null,
    se_reporta: true,
    ...extra,
  };
}

function hoja(xlsx: Buffer, nombre: string): string[][] {
  const wb = XLSX.read(xlsx, { type: "buffer" });
  return XLSX.utils.sheet_to_json<string[]>(wb.Sheets[nombre], { header: 1, raw: true });
}

beforeEach(sembrar);

describe("el Excel que va dentro del ZIP", () => {
  it("no lleva la nota interna, ni el nombre de una empresa del grupo, ni dos grafías del mismo sufijo", async () => {
    const excel = await buildExcelDeMarca({ marcaCodigo: "TH" });
    const wb = XLSX.read(excel.buffer, { type: "buffer" });
    const todo = wb.SheetNames.flatMap((n) =>
      XLSX.utils
        .sheet_to_json<string[]>(wb.Sheets[n], { header: 1, raw: true })
        .flat()
        .filter((c): c is string => typeof c === "string"),
    );
    const junto = todo.join(" | ");

    expect(junto).not.toContain("sin reporte guardado");
    expect(junto).not.toMatch(/Fashion Wear/i);
    expect(junto).toContain("Pago de espacio (mueble) en tienda");
    // UNA grafía del sufijo: ni «S a» ni «S.a.» sueltos.
    expect(junto).toContain("Impresora Comercial, S.A.");
    expect(junto).toContain("Grupo Monat, S.A.");
    expect(junto).not.toMatch(/Impresora Comercial S a/);
    expect(junto).not.toMatch(/Grupo Monat, S\.a\./);
  });

  it("lo que NO se reporta no entra al Excel ni suma", async () => {
    const excel = await buildExcelDeMarca({ marcaCodigo: "TH" });
    const wb = XLSX.read(excel.buffer, { type: "buffer" });
    const junto = wb.SheetNames.flatMap((n) =>
      XLSX.utils.sheet_to_json<string[]>(wb.Sheets[n], { header: 1, raw: true }).flat(),
    ).join(" | ");
    expect(junto).not.toContain("Mueble que no se reporta");
    // 100 (la del «50 %», que es el total entero) + 50. Los 999 quedan afuera.
    expect(excel.total).toBe(150);
    expect(excel.gastos).toBe(2);
  });

  it("sin la columna `se_reporta` el archivo sale como antes — falla ABIERTO", async () => {
    columnasAusentes.add("se_reporta");
    const excel = await buildExcelDeMarca({ marcaCodigo: "TH" });
    expect(excel.gastos).toBe(3); // entran las tres, como hoy
    expect(excel.total).toBe(1149);
  });

  it("una marca al «50 %» cobra el total entero, no la mitad", async () => {
    const excel = await buildExcelDeMarca({ marcaCodigo: "TH" });
    const filas = hoja(excel.buffer, "City Mall David");
    const laDeF1 = filas.find((f) => String(f[2] ?? "").startsWith("Pago de espacio"));
    expect(laDeF1?.[5]).toBe(100);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 4. LOS LINKS DE 30 DÍAS Y EL REGISTRO DE CADA ZIP
// ────────────────────────────────────────────────────────────────────────────

describe("los links del ZIP y el registro de lo que se bajó", () => {
  it("30 días con el interruptor, un año sin él", () => {
    expect(TTL_LINK_ZIP_SEGUNDOS).toBe(60 * 60 * 24 * 30);
    expect(TTL_LINK_ZIP_VIEJO_SEGUNDOS).toBe(60 * 60 * 24 * 365);
    expect(ttlDeLinkDelZip()).toBe(
      ZIP_E_IMPULSADORAS_NUEVO ? TTL_LINK_ZIP_SEGUNDOS : TTL_LINK_ZIP_VIEJO_SEGUNDOS,
    );
  });

  it("el Excel firma sus links con ese TTL y no con el año viejo", async () => {
    await buildExcelDeMarca({ marcaCodigo: "TH" });
    expect(ttlsPedidos.length).toBeGreaterThan(0);
    for (const t of ttlsPedidos) expect(t).toBe(ttlDeLinkDelZip());
    if (ZIP_E_IMPULSADORAS_NUEVO) {
      expect(ttlsPedidos).not.toContain(TTL_LINK_ZIP_VIEJO_SEGUNDOS);
    }
  });

  it("el ZIP guardado vive en periodos/<id>/<fecha>.zip", () => {
    expect(pathDelZipGuardado("per-1", "2026-09-22")).toBe("periodos/per-1/2026-09-22.zip");
  });

  it("volver a firmar NO es una llave maestra de Storage", () => {
    expect(esPathFirmable("periodos/per-1/2026-09-22.zip")).toBe(true);
    expect(esPathFirmable("fact/f1.pdf")).toBe(true);
    expect(esPathFirmable("")).toBe(false);
    expect(esPathFirmable("/etc/passwd")).toBe(false);
    expect(esPathFirmable("../otro-bucket/secreto.pdf")).toBe(false);
    expect(esPathFirmable("https://otro.sitio/archivo.pdf")).toBe(false);
  });

  it("anotar un ZIP NO pisa lo anotado antes", () => {
    const primero = anotarZip([], {
      bajado_en: "2026-09-20T10:00:00Z",
      bajado_por: "daniela",
      gastos: 40,
      monto: 94104.43,
      archivo_path: "periodos/p1/2026-09-20.zip",
    });
    const segundo = anotarZip(primero, {
      bajado_en: "2026-09-22T10:00:00Z",
      bajado_por: "daniel",
      gastos: 41,
      monto: 95000,
      archivo_path: "periodos/p1/2026-09-22.zip",
    });
    expect(segundo).toHaveLength(2);
    expect(segundo[0].archivo_path).toBe("periodos/p1/2026-09-20.zip");
    expect(segundo[0].monto).toBe(94104.43);
    expect(segundo[1].bajado_por).toBe("daniel");
    // La lista de entrada no se muta: se devuelve una nueva.
    expect(primero).toHaveLength(1);
  });
});
