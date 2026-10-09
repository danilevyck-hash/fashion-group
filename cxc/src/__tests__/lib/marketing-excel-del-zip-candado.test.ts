// ============================================================================
// 🔴 CANDADO — EL EXCEL Y EL ZIP DE LA MARCA NO CAMBIAN (8-oct-2026).
//
// Daniel, sobre el Marketing nuevo: «Tiene que estar ordenado en el Excel como
// se configuró». La pantalla nueva (Por cobrar · Gastos · Impulsadoras) LEE el
// mismo cálculo del ZIP, pero el archivo que se le manda a la marca se queda
// EXACTAMENTE igual: hojas, columnas, orden, montos, hipervínculos y carpetas.
//
// La foto (`__snapshots__/excel-del-zip-*.json`) se sacó con el código de ANTES
// del Marketing nuevo, sobre estos mismos datos. Si alguien mueve una columna,
// cambia un rótulo o un monto, esto se pone rojo.
//
// 🔴 FORMATO C2 (Daniel lo aprobó el 8-oct-2026). La foto se volvió a sacar con
// el formato C2: donde había UNA columna «Total», ahora van tres —
// Monto (lo que dice la factura) · <empresa de la marca> · <marca> (lo que se
// le cobra)—, en el Resumen y en cada hoja. Todo lo demás, idéntico, y los
// totales a cobrar NO se movieron. Muestras aprobadas:
// `~/Downloads/Excel Marketing - opciones/C2 - Empresa y marca - *.xlsx`.
//
// Y el número: lo que dice la pantalla nueva (`resumenesDeCobro`) es el total
// del Excel, al centavo.
// ============================================================================
import { describe, it, expect, beforeEach, vi } from "vitest";
import JSZip from "jszip";
import XLSX from "xlsx-js-style";

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= "test-anon-key";
  process.env.SESSION_SECRET ||= "test-secret";
});

// ── Doble de PostgREST (solo lectura: es todo lo que este módulo hace) ───────
type Fila = Record<string, unknown>;
const tablas: Record<string, Fila[]> = {};

class Consulta implements PromiseLike<{ data: unknown; error: unknown }> {
  private filtros: Array<(f: Fila) => boolean> = [];
  constructor(private tabla: string) {}
  select() {
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
    const filas = tablas[this.tabla];
    if (!filas) {
      return Promise.resolve({
        data: null,
        error: { code: "PGRST205", message: `no existe ${this.tabla}` },
      }).then(ok, bad);
    }
    const data = filas.filter((f) => this.filtros.every((p) => p(f)));
    return Promise.resolve({ data: data.map((f) => ({ ...f })), error: null }).then(ok, bad);
  }
}

/** Objetos de Storage: path → contenido. */
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
        createSignedUrls: async (paths: string[]) => ({
          data: paths.map((p) => ({ path: p, signedUrl: `https://firmado/${p}` })),
          error: null,
        }),
        createSignedUrl: async (path: string) => ({
          data: { signedUrl: `https://firmado/${path}` },
          error: null,
        }),
      }),
    },
  },
}));

// sharp comprime de verdad en producción; acá solo tiene que devolver bytes.
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
    toBuffer: async () => Buffer.from("jpeg-comprimido"),
  }),
}));

// El comprobante de mobiliario se genera al vuelo (jsPDF). Su dibujo ya tiene
// su propio candado; acá solo importa que el archivo caiga donde corresponde.
vi.mock("@/lib/marketing/entrega-comprobante", () => ({
  cargarComprobantes: async (ids: string[]) =>
    new Map(
      ids.map((id) => [
        id,
        { entregaId: id, numero: 7, fecha: "2026-05-02", cliente: "X", items: [] },
      ]),
    ),
}));
vi.mock("@/lib/marketing/pdf-entrega-mueble", () => ({
  buildComprobanteEntregaPdf: () => Buffer.from("%PDF-comprobante"),
  nombreArchivoComprobante: (d: { fecha: string }) =>
    `${d.fecha} · Entrega de mobiliario ME-0007`,
  numeroComprobante: () => "ME-0007",
}));

import { buildExcelDeMarca, buildZipDeMarca, resumenesDeCobro } from "@/lib/marketing/zip-marca";

// ── Datos ───────────────────────────────────────────────────────────────────
const M_TH = "m-th";
const M_CK = "m-ck";
const M_KL = "m-kl";
const P_CERRADO = "per-cerrado";
const P_ABIERTO = "per-abierto";

function sembrar(): void {
  for (const k of Object.keys(tablas)) delete tablas[k];
  for (const k of Object.keys(storage)) delete storage[k];

  tablas.mk_marcas = [
    { id: M_TH, nombre: "Tommy Hilfiger", codigo: "TH", empresa_codigo: "fashion_wear" },
    { id: M_CK, nombre: "Calvin Klein", codigo: "CK", empresa_codigo: "vistana" },
    { id: M_KL, nombre: "Karl Lagerfeld", codigo: "KL", empresa_codigo: "active_wear" },
    { id: "m-rbk", nombre: "Reebok", codigo: "RBK", empresa_codigo: "active_shoes" },
    { id: "m-j", nombre: "Joybees", codigo: "J", empresa_codigo: "joystep" },
  ];
  tablas.mk_periodos = [
    // 🩸 La clave es la VIEJA ('pvh'): así está en producción con la DDL sin
    //    correr. Si el módulo solo preguntara por 'TH', el ZIP saldría vacío.
    { id: P_CERRADO, proveedor_key: "pvh", nombre: "mid 2026", estado: "cerrado", reporte: null },
    { id: P_ABIERTO, proveedor_key: "pvh", nombre: "Período 2026", estado: "abierto", reporte: null },
    { id: "per-rbk", proveedor_key: "reebok", nombre: "Período 2026", estado: "abierto", reporte: null },
  ];
  tablas.mk_proyectos = [
    { id: "p1", nombre: "Letreros", tienda: "City Mall David", tienda_codigo: "D-24", anulado_en: null },
    { id: "pmf", nombre: "Remodelacion", tienda: "Multifashion Holdings", tienda_codigo: null, anulado_en: null },
  ];
  tablas.clientes_master = [{ codigo: "D-24", nombre: "City Mall David" }];

  tablas.mk_facturas = [
    // Período CERRADO: Tommy 100 + Calvin 50 = 150 (el "62.381,57" del test).
    fact("f1", "p1", "A-1", "2026-03-04", "letrero", 100),
    fact("f2", "p1", "A-2", "2026-03-05", "vitrina", 50),
    // Período ABIERTO: un pago de impulsadora y un evento, los dos SIN cliente.
    fact("f3", null, "IMP-1", "2026-06-01", "pago impulsadora junio", 30, {
      impulsadora_id: "i1",
      impulsadora_mes: "2026-06-01",
    }),
    fact("f4", null, "EV-1", "2026-06-10", "evento apertura", 20),
    // Multifashion: NUNCA entra.
    fact("f5", "pmf", "MF-1", "2026-06-11", "gasto multifashion", 999),
  ];
  tablas.mk_factura_marcas = [
    { factura_id: "f1", marca_id: M_TH, porcentaje: 100 },
    { factura_id: "f2", marca_id: M_CK, porcentaje: 100 },
    { factura_id: "f3", marca_id: M_TH, porcentaje: 100 },
    { factura_id: "f4", marca_id: M_TH, porcentaje: 100 },
    { factura_id: "f5", marca_id: M_TH, porcentaje: 100 },
  ];
  tablas.mk_entregas_muebles = [
    {
      id: "e1",
      proyecto_id: "p1",
      total: 40,
      total_por_marca: { [M_TH]: 40 },
      total_por_empresa_interna: {},
      notas: "muebles apertura",
      created_at: "2026-06-20T10:00:00Z",
    },
  ];
  tablas.mk_periodo_documentos = [
    sello(P_CERRADO, "factura", "f1"),
    sello(P_CERRADO, "factura", "f2"),
    sello(P_ABIERTO, "factura", "f3"),
    sello(P_ABIERTO, "factura", "f4"),
    sello(P_ABIERTO, "factura", "f5"),
    sello(P_ABIERTO, "entrega", "e1"),
  ];

  tablas.mk_adjuntos = [
    adj("a1", "pdf_factura", "f1", null, "fact/f1.pdf", "factura-1.pdf"),
    adj("a2", "pdf_factura", "f2", null, "fact/f2.pdf", "factura-2.pdf"),
    // El comprobante de la impulsadora es una FOTO, y va igual a facturas/.
    adj("a3", "foto_factura", "f3", null, "fact/f3.jpg", "recibo-impulsadora.jpg"),
    adj("a4", "pdf_factura", "f4", null, "fact/f4.pdf", "factura-evento.pdf"),
    adj("a5", "pdf_factura", "f5", null, "fact/f5.pdf", "factura-mf.pdf"),
    // Foto de instalación de un gasto SIN cliente → General/fotos/.
    adj("a6", "foto_instalacion", "f4", null, "fotos/evento.jpg", "evento.jpg"),
    // Foto del proyecto de un cliente → <Cliente>/fotos/.
    adj("a7", "foto_proyecto", null, "p1", "fotos/p1-a.jpg", "letrero-puesto.jpg"),
  ];
  for (const a of tablas.mk_adjuntos) storage[String(a.url)] = Buffer.from("bytes");
}

function fact(
  id: string,
  proyecto_id: string | null,
  numero: string,
  fecha: string,
  concepto: string,
  total: number,
  extra: Fila = {},
): Fila {
  return {
    id,
    proyecto_id,
    numero_factura: numero,
    fecha_factura: fecha,
    proveedor: "Proveedor SA",
    concepto,
    subtotal: total,
    total,
    impulsadora_id: null,
    impulsadora_mes: null,
    periodo_desde: null,
    periodo_hasta: null,
    anulado_en: null,
    ...extra,
  };
}
function sello(periodo_id: string, tipo: string, documento_id: string): Fila {
  // Todos bajo la clave VIEJA, como en producción hoy.
  return { periodo_id, proveedor_key: "pvh", tipo, documento_id };
}
function adj(
  id: string,
  tipo: string,
  factura_id: string | null,
  proyecto_id: string | null,
  url: string,
  nombre: string,
): Fila {
  return { id, tipo, factura_id, proyecto_id, url, nombre_original: nombre };
}


function sembrarMas(): void {
  sembrar();
  // Lo que el Excel de hoy tiene que seguir mostrando igual: una factura con
  // tienda y «Mitad», una entrega de mobiliario repartida a una tienda, y la
  // impulsadora del mes.
  tablas.clientes_master.push({ codigo: "D-170", nombre: "Nova Lux, S.A." });
  tablas.mk_facturas.push(
    fact("f6", null, "0000062711", "2026-09-18", "Instalación de paneles", 2140, {
      tienda_codigo: "D-170",
      pct_a_la_marca: 50,
      proveedor: "Krysthel Morales",
    }),
    fact("f7", null, "0000062800", "2026-09-26", "Caja de luz", 3410, { tienda_codigo: "D-170" }),
  );
  tablas.mk_factura_marcas.push(
    { factura_id: "f6", marca_id: M_TH, porcentaje: 100 },
    { factura_id: "f7", marca_id: M_CK, porcentaje: 100 },
  );
  tablas.mk_entregas_muebles.push({
    id: "e2",
    proyecto_id: null,
    tienda_codigo: "D-170",
    total: 2540,
    total_por_marca: { [M_TH]: 2540 },
    total_por_empresa_interna: {},
    notas: "14 paneles, 40 barras planas",
    created_at: "2026-09-24T15:00:00Z",
  });
  tablas.mk_periodo_documentos.push(
    sello(P_ABIERTO, "factura", "f6"),
    sello(P_ABIERTO, "factura", "f7"),
    sello(P_ABIERTO, "entrega", "e2"),
  );
  tablas.mk_adjuntos.push(adj("a8", "pdf_factura", "f6", null, "fact/f6.pdf", "0000062711.pdf"));
  storage["fact/f6.pdf"] = Buffer.from("bytes");
}

/** Todo lo que lleva el Excel: cada hoja, cada celda, cada vínculo y el ancho de cada columna. */
function volcarExcel(xlsx: Buffer): unknown {
  const wb = XLSX.read(xlsx, { type: "buffer", cellFormula: true, cellStyles: true });
  return wb.SheetNames.map((nombre) => {
    const ws = wb.Sheets[nombre];
    const vinculos = Object.keys(ws)
      .filter((k) => !k.startsWith("!"))
      .map((k) => [k, ws[k] as { l?: { Target?: string }; f?: string }] as const)
      .filter(([, c]) => c.l?.Target || c.f)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, c]) => [k, c.l?.Target ?? null, c.f ?? null]);
    return {
      hoja: nombre,
      celdas: XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null }),
      vinculos,
      columnas: (ws["!cols"] ?? []).map((c: { wch?: number; wpx?: number }) => c?.wch ?? c?.wpx ?? null),
      combinadas: (ws["!merges"] ?? []).map((m: unknown) => JSON.stringify(m)),
    };
  });
}

async function volcarZip(buffer: Buffer): Promise<{ archivos: string[]; excel: unknown }> {
  const z = await JSZip.loadAsync(buffer);
  const archivos = Object.keys(z.files).filter((n) => !z.files[n].dir).sort();
  const xlsx = await z.file("resumen_gastos.xlsx")!.async("nodebuffer");
  return { archivos, excel: volcarExcel(xlsx) };
}

/** El subtítulo lleva la fecha de hoy: se fija para que la foto no dependa del día. */
function sinFechaDeHoy(x: unknown): unknown {
  return JSON.parse(JSON.stringify(x).replace(/\d{1,2} (?:de )?[a-záéíóú]{3,10}\.? (?:de )?\d{4}/gi, "HOY").replace(/\d{4}-\d{2}-\d{2}T[^"]*/g, "AHORA"));
}

const FOTO = (n: string) => `./__snapshots__/excel-del-zip-${n}.json`;

beforeEach(sembrarMas);

describe("🔴 el Excel y el ZIP de la marca, idénticos a los de antes", () => {
  for (const [nombre, op] of [
    ["tommy-abierto", { marcaCodigo: "TH" }],
    ["calvin-abierto", { marcaCodigo: "CK" }],
    ["tommy-cerrado", { marcaCodigo: "TH", periodoId: P_CERRADO }],
    ["calvin-cerrado", { marcaCodigo: "CK", periodoId: P_CERRADO }],
  ] as const) {
    it(`${nombre}: el ZIP (archivos y Excel) no cambia ni una celda`, async () => {
      const r = await buildZipDeMarca(op);
      const volcado = { total: r.total, gastos: r.gastos, carpetas: r.carpetas, ...(await volcarZip(r.buffer)) };
      await expect(JSON.stringify(sinFechaDeHoy(volcado), null, 1)).toMatchFileSnapshot(FOTO(`zip-${nombre}`));
    });
    it(`${nombre}: el botón Excel baja el mismo workbook, sin cambios`, async () => {
      const r = await buildExcelDeMarca(op);
      await expect(JSON.stringify(sinFechaDeHoy({ total: r.total, excel: volcarExcel(r.buffer) }), null, 1)).toMatchFileSnapshot(
        FOTO(`excel-${nombre}`),
      );
    });
  }
});

describe("🔴 un solo número por marca: la pantalla nueva dice el total del ZIP", () => {
  it("Por cobrar de cada marca = el total del Excel del período abierto, al centavo", async () => {
    const { abiertos } = await resumenesDeCobro();
    expect(abiertos.map((a) => a.marcaCodigo).sort()).toEqual(["CK", "TH"]);
    for (const a of abiertos) {
      const zip = await buildZipDeMarca({ marcaCodigo: a.marcaCodigo });
      expect(a.total).toBe(zip.total);
      expect(a.lineas.length).toBe(zip.gastos);
      expect(a.lineas.reduce((s, l) => s + l.monto, 0)).toBeCloseTo(zip.total, 2);
    }
  });
  it("cada cobro anterior = el total del ZIP de ese período cerrado", async () => {
    const { cerrados } = await resumenesDeCobro();
    expect(cerrados.length).toBe(2);
    for (const c of cerrados) {
      const zip = await buildZipDeMarca({ marcaCodigo: c.marcaCodigo, periodoId: c.periodoId });
      expect(c.total).toBe(zip.total);
    }
  });
  it("la tienda sin fotos es la que el Excel cuenta con «# Fotos» en 0", async () => {
    const { abiertos } = await resumenesDeCobro();
    const th = abiertos.find((a) => a.marcaCodigo === "TH")!;
    expect(th.tiendasSinFoto).toEqual(["Nova Lux, S.A."]);
    expect(th.fotosPorCarpeta["City Mall David"]).toBe(1);
  });
});

// 🔴 CANDADO — «No recuperable» al registrar (8-oct-2026). Daniel: «¿cómo meto
// un gasto, por ejemplo unos muebles que compré, no cobrables?». Se guarda sin
// marca ni tienda, con `pct_a_la_marca = 0` y `se_reporta = false`: no entra al
// ZIP de ninguna marca (aunque quedara sellado en un período abierto) y la
// pestaña Gastos lo dice «No recuperable».
describe("🔴 un gasto no recuperable no se le cobra a nadie", () => {
  it("no entra al ZIP de ninguna marca y sale con Estado «No recuperable»", async () => {
    tablas.mk_facturas.push(
      fact("f-nr", null, "145", "2026-10-05", "Barras planas", 545.7, {
        pct_a_la_marca: 0,
        se_reporta: false,
        tienda_codigo: null,
        nota: "Compra de mobiliario",
      }),
    );
    tablas.mk_periodo_documentos.push(sello(P_ABIERTO, "factura", "f-nr"));
    const { abiertos, cerrados, gastos } = await resumenesDeCobro();
    for (const r of [...abiertos, ...cerrados]) {
      expect(r.lineas.some((l) => l.documentoId === "f-nr")).toBe(false);
    }
    for (const m of ["TH", "CK"]) {
      const zip = await buildZipDeMarca({ marcaCodigo: m });
      expect(zip.total).toBe(abiertos.find((a) => a.marcaCodigo === m)!.total);
    }
    const g = gastos.find((x) => x.id === "f-nr")!;
    expect(g.estado).toBe("no_recuperable");
    expect(g.aCobrar).toBe(0);
  });
});

// 🔴 CANDADO — FORMATO C2: MONTO = EMPRESA + MARCA (8-oct-2026). Daniel aprobó
// que cada fila diga lo que dice la factura, lo que pone la empresa y lo que se
// le cobra a la marca. La columna de la marca es EL número de la portada; las
// impulsadoras van al 100 % a la marca.
describe("🔴 formato C2: Monto · empresa · marca", () => {
  type Hoja = (string | number | null)[][];
  const hojas = (xlsx: Buffer): Array<{ nombre: string; filas: Hoja }> => {
    const wb = XLSX.read(xlsx, { type: "buffer" });
    return wb.SheetNames.map((nombre) => ({
      nombre,
      filas: XLSX.utils.sheet_to_json<(string | number | null)[]>(wb.Sheets[nombre], { header: 1, raw: true, defval: null }),
    }));
  };
  /** Las filas de dinero de una hoja: [monto, empresa, marca] bajo el encabezado «Monto». */
  const dinero = (filas: Hoja, empresa: string, marca: string) => {
    const h = filas.findIndex((f) => f.includes("Monto"));
    expect(h).toBeGreaterThanOrEqual(0);
    const c = filas[h].indexOf("Monto");
    expect(filas[h].slice(c, c + 3)).toEqual(["Monto", empresa, marca]);
    const cuerpo = filas.slice(h + 1).filter((f) => typeof f[c] === "number");
    return { c, h, cuerpo };
  };

  for (const [codigo, empresa, marca] of [
    ["TH", "Fashion Wear", "Tommy Hilfiger"],
    ["CK", "Vistana", "Calvin Klein"],
  ] as const) {
    it(`${marca}: la columna de la marca suma lo que dice la portada, y Monto = ${empresa} + marca en cada fila`, async () => {
      const { abiertos } = await resumenesDeCobro();
      const portada = abiertos.find((a) => a.marcaCodigo === codigo)!.total;
      const r = await buildExcelDeMarca({ marcaCodigo: codigo });
      expect(r.total).toBe(portada);
      for (const { nombre, filas } of hojas(r.buffer)) {
        const { c, cuerpo } = dinero(filas, empresa, marca);
        for (const f of cuerpo) {
          const [m, e, k] = [f[c], f[c + 1], f[c + 2]] as number[];
          expect(Math.round((e + k) * 100) / 100, `${nombre}: ${JSON.stringify(f)}`).toBe(m);
          expect(e).toBeGreaterThanOrEqual(0);
        }
        if (nombre === "Resumen") {
          const total = cuerpo.find((f) => f[0] === "TOTAL")!;
          expect(total[c + 2]).toBe(portada);
        }
      }
    });
  }

  it("la factura al 50 % sale entera en Monto y partida mitad y mitad", async () => {
    const r = await buildExcelDeMarca({ marcaCodigo: "TH" });
    const nova = hojas(r.buffer).find((h) => h.nombre === "Nova Lux, S.A.")!;
    const { c } = dinero(nova.filas, "Fashion Wear", "Tommy Hilfiger");
    const f = nova.filas.find((x) => x.includes("0000062711"))!;
    expect([f[c], f[c + 1], f[c + 2]]).toEqual([2140, 1070, 1070]);
  });

  it("las impulsadoras van al 100 % a la marca: la empresa en $0", async () => {
    const r = await buildExcelDeMarca({ marcaCodigo: "TH" });
    const imp = hojas(r.buffer).find((h) => h.nombre === "Impulsadoras")!;
    const { c, cuerpo } = dinero(imp.filas, "Fashion Wear", "Tommy Hilfiger");
    expect(cuerpo.length).toBeGreaterThan(0);
    for (const f of cuerpo) {
      expect(f[c + 1]).toBe(0);
      expect(f[c + 2]).toBe(f[c]);
    }
  });

  it("el nombre de la empresa sale de la configuración de la marca, no escrito a mano", async () => {
    tablas.mk_marcas.find((m) => m.codigo === "TH")!.empresa_codigo = "fashion_shoes";
    const r = await buildExcelDeMarca({ marcaCodigo: "TH" });
    const res = hojas(r.buffer)[0];
    dinero(res.filas, "Fashion Shoes", "Tommy Hilfiger");
  });
});
