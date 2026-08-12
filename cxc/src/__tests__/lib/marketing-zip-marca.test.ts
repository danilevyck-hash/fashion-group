// ============================================================================
// CANDADO — el ZIP de UNA MARCA, y la regla que lo sostiene:
//
//   🔴 LA PLATA SE CONGELA, LOS PAPELES NO.
//
// El test que más importa de todo el archivo es `agregar una foto a un período
// CERRADO no mueve ni un centavo`. Es la decisión de Daniel (*"la foto sí, la
// plata no"*) y es la que hace que volver a bajar el mismo reporte la semana
// que viene traiga los MISMOS números y MÁS fotos. Si algún día alguien cablea
// los montos a un recálculo, ese test se pone rojo antes de que un encargado
// reciba dos papeles distintos por el mismo período.
//
// Los demás candados, en orden de lo que costaría equivocarse:
//   · Multifashion NUNCA entra en el ZIP de una marca (tienda propia).
//   · Los sellos VIEJOS ('pvh'/'reebok'/'joybees') se siguen encontrando —
//     sin eso, con la DDL sin correr el ZIP saldría VACÍO.
//   · Los gastos SIN cliente van a General/: el comprobante a General/facturas/
//     y —esto es lo que se corrigió sobre la marcha— sus fotos de instalación a
//     General/fotos/. Un evento sin cliente tiene fotos igual que una tienda.
//   · Una marca sin gasto NO genera ZIP.
//   · El reporte congelado se PARTE por el campo `marca` de cada línea, y las
//     partes suman exactamente el total del período.
//
// Corre contra un doble EN MEMORIA de PostgREST + Storage: `zip-marca.ts` se
// ejecuta de verdad, arma el ZIP de verdad y el test lo ABRE y lo mira. Probar
// la aritmética aparte no habría probado nada — el riesgo vive en qué archivo
// termina en qué carpeta.
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

import {
  buildZipDeMarca,
  contentDisposition,
  ErrorZipMarca,
} from "@/lib/marketing/zip-marca";

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

async function rutas(buffer: Buffer): Promise<string[]> {
  const z = await JSZip.loadAsync(buffer);
  return Object.keys(z.files)
    .filter((n) => !z.files[n].dir)
    .sort();
}
async function hojaResumen(buffer: Buffer): Promise<string[][]> {
  const z = await JSZip.loadAsync(buffer);
  const xlsx = await z.file("resumen_gastos.xlsx")!.async("nodebuffer");
  const wb = XLSX.read(xlsx, { type: "buffer" });
  return XLSX.utils.sheet_to_json<string[]>(wb.Sheets.Resumen, { header: 1, raw: true });
}

beforeEach(sembrar);

// ────────────────────────────────────────────────────────────────────────────
describe("ZIP por marca — el archivo", () => {
  it("se llama <Marca> · <Período>.zip", async () => {
    const r = await buildZipDeMarca({ marcaCodigo: "TH", periodoId: P_CERRADO });
    expect(r.filename).toBe("Tommy Hilfiger · mid 2026.zip");
  });

  it("trae la MISMA estructura que el ZIP global: resumen + <Cliente>/facturas + fotos", async () => {
    const r = await buildZipDeMarca({ marcaCodigo: "TH", periodoId: P_CERRADO });
    const paths = await rutas(r.buffer);
    expect(paths).toContain("resumen_gastos.xlsx");
    expect(paths.some((p) => p.startsWith("City Mall David/facturas/"))).toBe(true);
    expect(paths.some((p) => p.startsWith("City Mall David/fotos/"))).toBe(true);
    expect(r.carpetas).toEqual(["City Mall David"]);
  });

  it("el nombre de cada comprobante lleva la MARCA", async () => {
    const r = await buildZipDeMarca({ marcaCodigo: "TH", periodoId: P_CERRADO });
    const paths = await rutas(r.buffer);
    expect(paths).toContain("City Mall David/facturas/2026-03-04 · Tommy Hilfiger · letrero.pdf");
  });

  it("el Content-Disposition sobrevive al `·` y a los acentos", () => {
    const cd = contentDisposition("Tommy Hilfiger · mid 2026.zip");
    expect(cd).toContain("filename*=UTF-8''");
    expect(cd).toContain(encodeURIComponent("Tommy Hilfiger · mid 2026.zip"));
    // El respaldo ASCII no puede llevar el `·` crudo ni comillas.
    const ascii = /filename="([^"]*)"/.exec(cd)![1];
    expect(ascii).toBe("Tommy Hilfiger - mid 2026.zip");
  });
});

describe("ZIP por marca — el corte por marca y por período", () => {
  it("encuentra los sellos VIEJOS ('pvh'): sin eso el ZIP saldría vacío", async () => {
    const r = await buildZipDeMarca({ marcaCodigo: "TH", periodoId: P_CERRADO });
    expect(r.gastos).toBe(1);
    expect(r.total).toBe(100);
  });

  it("Tommy + Calvin del período cerrado suman EXACTAMENTE el total del período", async () => {
    const th = await buildZipDeMarca({ marcaCodigo: "TH", periodoId: P_CERRADO });
    const ck = await buildZipDeMarca({ marcaCodigo: "CK", periodoId: P_CERRADO });
    expect(th.total + ck.total).toBe(150);
  });

  it("el ZIP de Tommy no trae ni un gasto de Calvin", async () => {
    const r = await buildZipDeMarca({ marcaCodigo: "TH", periodoId: P_CERRADO });
    const paths = await rutas(r.buffer);
    expect(paths.some((p) => p.includes("vitrina"))).toBe(false);
  });

  it("un período cerrado NO arrastra los gastos del abierto (ni al revés)", async () => {
    const cerrado = await buildZipDeMarca({ marcaCodigo: "TH", periodoId: P_CERRADO });
    const abierto = await buildZipDeMarca({ marcaCodigo: "TH" });
    expect(cerrado.total).toBe(100);
    // abierto = impulsadora 30 + evento 20 + muebles 40
    expect(abierto.total).toBe(90);
    expect(abierto.periodoNombre).toBe("Período 2026");
  });

  it("Multifashion NUNCA entra: es tienda propia, no se le reporta a nadie", async () => {
    const r = await buildZipDeMarca({ marcaCodigo: "TH" });
    const paths = await rutas(r.buffer);
    expect(paths.some((p) => /multifashion/i.test(p))).toBe(false);
    expect(paths.some((p) => p.includes("factura-mf"))).toBe(false);
    // Los $999 de Multifashion no se suman en ningún lado.
    expect(r.total).toBe(90);
  });

  it("una marca SIN gasto no genera ZIP, y lo dice en español simple", async () => {
    await expect(buildZipDeMarca({ marcaCodigo: "KL" })).rejects.toMatchObject({
      codigo: "MARCA_SIN_GASTO",
    });
    const err = await buildZipDeMarca({ marcaCodigo: "RBK" }).catch((e) => e);
    expect(err).toBeInstanceOf(ErrorZipMarca);
    expect(err.message).toContain("Reebok");
    expect(err.message).not.toMatch(/error|null|undefined/i);
  });

  it("un período de otra marca se rechaza en vez de mezclar reportes", async () => {
    await expect(
      buildZipDeMarca({ marcaCodigo: "RBK", periodoId: P_CERRADO }),
    ).rejects.toMatchObject({ codigo: "PERIODO_DE_OTRA_MARCA" });
  });
});

describe("ZIP por marca — General: los gastos SIN cliente", () => {
  it("el comprobante de CADA gasto sin cliente va a General/facturas/", async () => {
    const r = await buildZipDeMarca({ marcaCodigo: "TH" });
    const paths = await rutas(r.buffer);
    const enGeneral = paths.filter((p) => p.startsWith("General/facturas/"));
    // impulsadora (comprobante FOTO) + evento (PDF)
    expect(enGeneral).toHaveLength(2);
    expect(enGeneral.some((p) => p.endsWith(".jpg"))).toBe(true);
    expect(enGeneral.some((p) => p.includes("pago impulsadora junio"))).toBe(true);
  });

  it("las FOTOS de un gasto sin cliente van a General/fotos/ — un evento tiene fotos igual", async () => {
    const r = await buildZipDeMarca({ marcaCodigo: "TH" });
    const paths = await rutas(r.buffer);
    expect(paths).toContain("General/fotos/evento.jpg");
  });

  it("la hoja Resumen tiene una fila General (no 'Impulsadoras') y va al final", async () => {
    const r = await buildZipDeMarca({ marcaCodigo: "TH" });
    const filas = await hojaResumen(r.buffer);
    const etiquetas = filas.map((f) => String(f[0] ?? ""));
    expect(etiquetas).toContain("General");
    expect(etiquetas.some((e) => /impulsadora/i.test(e))).toBe(false);
    const iGeneral = etiquetas.indexOf("General");
    const iCliente = etiquetas.indexOf("City Mall David");
    expect(iCliente).toBeGreaterThan(0);
    expect(iGeneral).toBeGreaterThan(iCliente);
  });

  it("la columna de dinero dice lo que muestra, y el total es el de ESA marca", async () => {
    const r = await buildZipDeMarca({ marcaCodigo: "TH" });
    const filas = await hojaResumen(r.buffer);
    expect(filas[0]).toContain("Total");
    // El encabezado del ZIP global no puede filtrarse acá: los montos llevan ITBMS.
    expect(filas[0]).not.toContain("Subtotal (sin ITBMS)");
    const total = filas.find((f) => String(f[0] ?? "") === "TOTAL");
    expect(Number(total![total!.length - 1])).toBe(90);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 🔴 EL CANDADO CENTRAL
// ────────────────────────────────────────────────────────────────────────────
describe("LA PLATA SE CONGELA, LOS PAPELES NO", () => {
  it("agregar una FOTO a un período cerrado no mueve ni un centavo — y sí agrega la foto", async () => {
    const antes = await buildZipDeMarca({ marcaCodigo: "TH", periodoId: P_CERRADO });

    // Llega la foto de la instalación, días después del cierre.
    tablas.mk_adjuntos.push(
      adj("a99", "foto_instalacion", "f1", null, "fotos/tarde.jpg", "instalado.jpg"),
    );
    storage["fotos/tarde.jpg"] = Buffer.from("bytes");

    const despues = await buildZipDeMarca({ marcaCodigo: "TH", periodoId: P_CERRADO });

    expect(despues.total).toBe(antes.total);
    expect(despues.gastos).toBe(antes.gastos);
    expect(despues.fotosIncluidas).toBe(antes.fotosIncluidas + 1);
    expect(await rutas(despues.buffer)).toContain("City Mall David/fotos/instalado.jpg");

    // Y la hoja Resumen sigue diciendo el mismo número.
    const [fa, fd] = await Promise.all([
      hojaResumen(antes.buffer),
      hojaResumen(despues.buffer),
    ]);
    const totalDe = (filas: string[][]) => {
      const f = filas.find((x) => String(x[0] ?? "") === "TOTAL")!;
      return Number(f[f.length - 1]);
    };
    expect(totalDe(fd)).toBe(totalDe(fa));
  });

  it("con reporte CONGELADO los montos salen de ahí, aunque la base diga otra cosa", async () => {
    // El reporte guardado dice 111 para Tommy y 39 para Calvin: 150 en total,
    // repartido distinto de lo que hoy sale de la base (100 / 50).
    tablas.mk_periodos.find((p) => p.id === P_CERRADO)!.reporte = {
      version: 1,
      totales: { total: 150 },
      facturas: [
        linea("2026-03-04", "A-1", "letrero", "Tommy Hilfiger", 111, "D-24", "City Mall David"),
        linea("2026-03-05", "A-2", "vitrina", "Calvin Klein", 39, "D-24", "City Mall David"),
      ],
      entregas: [],
    };

    const th = await buildZipDeMarca({ marcaCodigo: "TH", periodoId: P_CERRADO });
    const ck = await buildZipDeMarca({ marcaCodigo: "CK", periodoId: P_CERRADO });

    expect(th.fuenteMontos).toBe("congelado");
    expect(th.total).toBe(111);
    expect(ck.total).toBe(39);
    // Las partes suman EXACTAMENTE el total del período congelado.
    expect(th.total + ck.total).toBe(150);
    // Ninguna línea quedó sin marca reconocida.
    expect(th.lineasSinMarca).toBe(0);
  });

  it("con reporte congelado, TOCAR LA BASE tampoco mueve la plata", async () => {
    tablas.mk_periodos.find((p) => p.id === P_CERRADO)!.reporte = {
      version: 1,
      facturas: [
        linea("2026-03-04", "A-1", "letrero", "Tommy Hilfiger", 111, "D-24", "City Mall David"),
      ],
      entregas: [],
    };
    // Alguien corrige el monto de la factura DESPUÉS de haberla reportado.
    tablas.mk_facturas.find((f) => f.id === "f1")!.total = 5000;

    const r = await buildZipDeMarca({ marcaCodigo: "TH", periodoId: P_CERRADO });
    expect(r.total).toBe(111);
    // Pero el papel sigue saliendo, en vivo.
    expect(await rutas(r.buffer)).toContain(
      "City Mall David/facturas/2026-03-04 · Tommy Hilfiger · letrero.pdf",
    );
  });

  it("una línea congelada SIN documento vivo igual aparece: la plata ya se reportó", async () => {
    tablas.mk_periodos.find((p) => p.id === P_CERRADO)!.reporte = {
      version: 1,
      facturas: [
        linea("2026-03-04", "A-1", "letrero", "Tommy Hilfiger", 111, "D-24", "City Mall David"),
        linea("2026-01-01", "VIEJA", "algo borrado", "Tommy Hilfiger", 25, null, ""),
      ],
      entregas: [],
    };
    const r = await buildZipDeMarca({ marcaCodigo: "TH", periodoId: P_CERRADO });
    expect(r.total).toBe(136);
    expect(r.gastos).toBe(2);
    // La que no tiene cliente ni papel cae en General, sin inventarle una tienda.
    const filas = await hojaResumen(r.buffer);
    expect(filas.map((f) => String(f[0] ?? ""))).toContain("General");
  });

  it("el período ABIERTO se puede bajar sin cerrar nada, y sus montos son en vivo", async () => {
    const r = await buildZipDeMarca({ marcaCodigo: "TH" });
    expect(r.periodoEstado).toBe("abierto");
    expect(r.fuenteMontos).toBe("en_vivo");
    expect(r.total).toBe(90);
  });
});

function linea(
  fecha: string,
  numero: string,
  concepto: string,
  marca: string,
  monto: number,
  clienteCodigo: string | null,
  cliente: string,
): Fila {
  return {
    fecha,
    numero,
    proveedor: "Proveedor SA",
    concepto,
    proyecto: "Letreros",
    cliente,
    clienteCodigo,
    marca,
    monto,
  };
}
