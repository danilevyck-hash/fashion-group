// ============================================================================
// CANDADO — MARKETING, LA PORTADA ABIERTOS | CERRADOS, EL CIERRE Y LOS
// REPORTES (pieza C del rediseño, 22-sep-2026).
//
// Lo que Daniel definió y este archivo no deja aflojar:
//
//   1. DOS ESTADOS Y NADA MÁS: la portada tiene las pestañas Abiertos |
//      Cerrados (*«no quiero pipeline, cuando lo cierro es porque lo cobré»*).
//   2. CERRAR EXIGE EL NOMBRE y NO GENERA REPORTE: el cierre nuevo escribe el
//      parche de `armarCierre` (nombre, nota como TEXTO), sella lo que
//      pertenece al período, NO escribe `reporte` y abre el siguiente con
//      `abrirSiguiente` (hoy de Panamá). Sin nombre → 400 con
//      `MSG_FALTA_NOMBRE`.
//   3. EL TOTAL EXCLUYE LO NO REPORTADO, en la portada (agregador con
//      `excluirNoReportado`) y en los reportes (`reportes-rediseno`); lo
//      apagado se dice aparte y nunca suma. Con la bandera apagada, ni un
//      centavo se mueve.
//   4. MULTIFASHION NO SALE COMO MARCA: ni en la portada ni en el reporte por
//      marca (es una tienda, D-108).
//   5. LOS GASTOS DE LAS MARCAS NO SE SUMAN ENTRE SÍ: la portada nueva no tiene
//      total del grupo ni «Por marca»/«Por cliente»; el reporte por marca no
//      tiene pie con el interruptor prendido.
//   6. EL REPORTE POR PROYECTO CONTESTA 410 y no vuelve; «Exportar Excel» no
//      existe en ninguna pantalla de Marketing; `exportarExcelReporte` y
//      `reportePorProyecto` no se exportan. Patrón `mayor_lineas`: nada se dropea.
//   7. INTERRUPTOR EN `false` = SIN CAMBIOS: la portada, el modal y el cierre
//      de antes, intactos.
//
// Mutaciones a mano (22-sep-2026): ver el postmortem, § «(C)».
// ============================================================================
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= "test-anon-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-key";
  process.env.SESSION_SECRET ||= "test-secret";
});

vi.mock("next/navigation", () => ({
  usePathname: () => "/marketing",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
}));

// El cierre nuevo se prueba con dobles de las DOS puertas de I/O: lo que
// importa es qué se escribe y en qué orden, no PostgREST.
const io = vi.hoisted(() => ({
  periodo: { id: "per-ck", proveedor_key: "CK", nombre: "Período 2026", estado: "abierto" },
  cerrados: [] as Array<{ id: string; patch: unknown }>,
  abiertos: [] as unknown[],
  sellados: [] as unknown[],
  reabiertos: [] as string[],
  fallaAbrir: false,
}));
vi.mock("@/lib/marketing/periodos-io", () => ({
  getPeriodo: async () => io.periodo,
  cerrarPeriodoConNombre: async (id: string, patch: unknown) => {
    io.cerrados.push({ id, patch });
  },
  abrirPeriodoSiguiente: async (fila: unknown) => {
    if (io.fallaAbrir) throw new Error("insert roto");
    io.abiertos.push(fila);
    return { id: "per-ck-2", ...(fila as object) };
  },
  reabrirPeriodo: async (id: string) => {
    io.reabiertos.push(id);
  },
  contarAbiertos: async () => 1,
  sellarDocumento: async (x: unknown) => {
    io.sellados.push(x);
  },
  // Lo de antes, que el cierre nuevo NO usa:
  abrirPeriodo: async () => {
    throw new Error("abrirPeriodo es del cierre viejo");
  },
  cerrarPeriodo: async () => {
    throw new Error("cerrarPeriodo es del cierre viejo");
  },
  esFaltaDeTablas: () => false,
}));
vi.mock("@/lib/marketing/periodos-reporte", () => ({
  cargarDatosPeriodos: async () => ({
    marcas: [{ id: "m-ck", nombre: "Calvin Klein", codigo: "CK" }],
    hayTablas: true,
  }),
  documentosDelPeriodoAbierto: () => ({ facturas: ["f-1", "f-2"], entregas: ["e-1"] }),
  agregar: () => ({
    bloques: [
      {
        key: "CK",
        total: 150,
        facturas: { count: 2, total: 100 },
        muebles: { count: 1, total: 50 },
        noReportado: { count: 1, total: 30 },
      },
    ],
  }),
  armarReportePeriodo: () => {
    throw new Error("el cierre nuevo no arma reporte");
  },
}));

import { ToastProvider } from "@/components/ToastSystem";
import {
  MARKETING_PORTADA_REDISENO,
  PESTANAS_PORTADA,
  diasDesde,
  esPestanaPortada,
  filaTiendaMultifashion,
  filasAbiertas,
  filasCerradas,
  textoDiasAbierto,
} from "@/lib/marketing/portada-rediseno";
import { ESTADOS_PERIODO, MSG_FALTA_NOMBRE } from "@/lib/marketing/periodo-estado";
import { agregarPorBloques } from "@/lib/marketing/resumen-bloques";
import { MULTIFASHION_KEY } from "@/lib/marketing/bloques";
import {
  partesPorMarca,
  reportePorMarcaDe,
  reportePorTiendaDe,
  type GastoParaReporte,
} from "@/lib/marketing/reportes-rediseno";
import {
  ErrorDeCierre,
  cerrarPeriodoRediseno,
  validarNombreAlCerrar,
  validarNotaCredito,
} from "@/app/api/marketing/periodos/cerrar";
import { GET as reporteProyectoGET } from "@/app/api/marketing/reportes/proyecto/route";
import CerrarPeriodoModal from "@/app/marketing/components/CerrarPeriodoModal";
import InicioMarketing from "@/app/marketing/components/InicioMarketing";

const RAIZ = path.resolve(__dirname, "../../..");
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");
function sinComentarios(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}
const codigo = (rel: string) => sinComentarios(leer(rel));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  io.cerrados.length = 0;
  io.abiertos.length = 0;
  io.sellados.length = 0;
  io.reabiertos.length = 0;
  io.fallaAbrir = false;
});

// ── Fixture del agregador ───────────────────────────────────────────────────
const TH = "m-th";
const CK = "m-ck";
const MARCAS = [
  { id: TH, codigo: "TH", nombre: "Tommy Hilfiger", empresa_codigo: "fashion_wear" },
  { id: CK, codigo: "CK", nombre: "Calvin Klein", empresa_codigo: "vistana" },
];
function entrada(opts: { excluir: boolean }) {
  return agregarPorBloques({
    facturas: [
      { id: "f-on", proyecto_id: "p1", total: 100, se_reporta: true },
      { id: "f-off", proyecto_id: "p1", total: 40, se_reporta: false },
      { id: "f-null", proyecto_id: null, total: 10, se_reporta: null },
      { id: "f-mf", proyecto_id: "p-mf", total: 25, se_reporta: false },
    ],
    facturaMarcas: [
      { factura_id: "f-on", marca_id: TH, porcentaje: 100 },
      { factura_id: "f-off", marca_id: TH, porcentaje: 100 },
      { factura_id: "f-null", marca_id: TH, porcentaje: 100 },
      { factura_id: "f-mf", marca_id: CK, porcentaje: 100 },
    ],
    entregas: [
      { id: "e-on", proyecto_id: "p2", total: 60, total_por_marca: { [CK]: 60 }, se_reporta: true },
      { id: "e-off", proyecto_id: "p2", total: 20, total_por_marca: { [CK]: 20 }, se_reporta: false },
    ],
    marcas: MARCAS,
    proyectos: [
      { id: "p1", tienda: "City Mall", tienda_codigo: "D-25" },
      { id: "p2", tienda: "Nova Lux", tienda_codigo: "D-90" },
      { id: "p-mf", tienda: "Multifashion", tienda_codigo: "D-108" },
    ],
    proyectosMultifashion: new Set(["p-mf"]),
    periodos: [
      { id: "per-th", proveedor_key: "TH", nombre: "Período 2026", estado: "abierto" },
      { id: "per-ck", proveedor_key: "CK", nombre: "Período 2026", estado: "abierto" },
    ],
    sellos: [],
    excluirNoReportado: opts.excluir,
  });
}

// ═════════════════════════════════════════════════════════════════════════════
describe("1 · 🔴 dos estados y nada más", () => {
  it("las pestañas son Abiertos | Cerrados, y son los DOS estados del período", () => {
    expect([...PESTANAS_PORTADA]).toEqual(["abiertos", "cerrados"]);
    expect([...ESTADOS_PERIODO]).toEqual(["abierto", "cerrado"]);
    expect(esPestanaPortada("abiertos")).toBe(true);
    expect(esPestanaPortada("en_proceso")).toBe(false);
  });

  it("la portada no dibuja un tercer estado", () => {
    const src = codigo("src/app/marketing/components/PortadaAbiertosCerrados.tsx");
    expect(src).not.toMatch(/en proceso|enviado|cobrado|pipeline/i);
    expect(src).toContain("PESTANAS_PORTADA.map(");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("2 · 🔴 cerrar exige el nombre y NO genera reporte", () => {
  it("escribe el parche de `armarCierre` sin `reporte`, sella lo que pertenece y abre el siguiente con «Desde el …»", async () => {
    const r = await cerrarPeriodoRediseno({
      periodoId: "per-ck",
      nombreAlCerrar: "  Temporada   2026 ",
      notaCredito: " NC-000123 ",
      cerradoPor: "daniel",
      ahoraISO: "2026-09-22T15:00:00.000Z",
      hoy: "2026-09-22",
    });
    expect(io.cerrados).toHaveLength(1);
    expect(io.cerrados[0].id).toBe("per-ck");
    expect(io.cerrados[0].patch).toEqual({
      estado: "cerrado",
      cerrado_en: "2026-09-22T15:00:00.000Z",
      cerrado_por: "daniel",
      nombre_al_cerrar: "Temporada 2026",
      nota_credito: "NC-000123",
    });
    expect(Object.keys(io.cerrados[0].patch as object)).not.toContain("reporte");
    // Sella los TRES documentos (los apagados también) ANTES de cerrar.
    expect(io.sellados).toHaveLength(3);
    // El siguiente: MISMA marca, nombre por defecto que dice desde cuándo.
    expect(io.abiertos).toHaveLength(1);
    expect(io.abiertos[0]).toMatchObject({ proveedor_key: "CK", estado: "abierto" });
    expect((io.abiertos[0] as { nombre: string }).nombre).toMatch(/^Desde el 22 sept? 2026$/);
    expect(r.cerrado.nombre).toBe("Temporada 2026");
    expect(r.cerrado.notaCredito).toBe("NC-000123");
    expect(r.cerrado.totales).toEqual({ reportado: 150, noReportado: 30, gastos: 3 });
    expect(r.siguiente.id).toBe("per-ck-2");
    expect("zip" in r).toBe(false);
  });

  it("sin nombre no cierra: 400 con MSG_FALTA_NOMBRE, y nada se escribe", async () => {
    await expect(
      cerrarPeriodoRediseno({ periodoId: "per-ck", nombreAlCerrar: "   ", notaCredito: null, cerradoPor: "d" }),
    ).rejects.toMatchObject({ status: 400, message: MSG_FALTA_NOMBRE });
    expect(io.cerrados).toHaveLength(0);
    expect(io.sellados).toHaveLength(0);
    expect(() => validarNombreAlCerrar("")).toThrow(ErrorDeCierre);
    expect(() => validarNombreAlCerrar("x".repeat(121))).toThrow(/muy largo/);
    expect(validarNombreAlCerrar("  mid  2026 ")).toBe("mid 2026");
  });

  it("la nota de crédito es TEXTO: no se convierte en número en ningún lado del cierre", () => {
    expect(validarNotaCredito("  NC-1 (50%) ")).toBe("NC-1 (50%)");
    expect(validarNotaCredito("")).toBeNull();
    expect(validarNotaCredito(undefined)).toBeNull();
    for (const rel of [
      "src/app/api/marketing/periodos/cerrar.ts",
      "src/app/api/marketing/periodos/[id]/cerrar/route.ts",
      "src/app/marketing/components/CerrarPeriodoModal.tsx",
    ]) {
      const src = codigo(rel);
      expect(src, rel).not.toMatch(/Number\(\s*[a-zA-Z.]*[nN]ota/);
      expect(src, rel).not.toMatch(/parseFloat\(\s*[a-zA-Z.]*[nN]ota/);
    }
  });

  it("si no se puede abrir el siguiente, el cierre se revierte (nunca cero abiertos)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    io.fallaAbrir = true;
    await expect(
      cerrarPeriodoRediseno({ periodoId: "per-ck", nombreAlCerrar: "X", notaCredito: null, cerradoPor: "d" }),
    ).rejects.toMatchObject({ status: 500 });
    expect(io.reabiertos).toEqual(["per-ck"]);
  });

  it("🔴 el escritor del cierre nuevo no toca `reporte`, y la ruta usa el cierre nuevo con el interruptor prendido", () => {
    const ioSrc = codigo("src/lib/marketing/periodos-io.ts");
    const fn = ioSrc.slice(ioSrc.indexOf("export async function cerrarPeriodoConNombre"));
    const cuerpo = fn.slice(0, fn.indexOf("export async function abrirPeriodoSiguiente"));
    expect(cuerpo).not.toMatch(/reporte/);
    expect(cuerpo).toContain(".update(patch)");
    const ruta = codigo("src/app/api/marketing/periodos/[id]/cerrar/route.ts");
    expect(ruta).toContain("if (MARKETING_PORTADA_REDISENO)");
    expect(ruta).toContain("cerrarPeriodoRediseno({ periodoId: id, nombreAlCerrar, notaCredito, cerradoPor })");
    // El cierre nuevo no arma reporte ni ZIP.
    const cerrar = codigo("src/app/api/marketing/periodos/cerrar.ts");
    const nuevo = cerrar.slice(cerrar.indexOf("export async function cerrarPeriodoRediseno"));
    expect(nuevo).not.toMatch(/armarReportePeriodo|buildExcel|zip/i);
    expect(nuevo).toContain("documentosDelPeriodoAbierto(datos, fila)");
    expect(nuevo).toContain("abrirSiguiente({ marcaCodigo, hoyPanama: hoy, ahoraISO })");
  });

  it("el modal nuevo pide el nombre con el que se CIERRA y la nota, y no baja reporte", async () => {
    render(
      <ToastProvider>
        <CerrarPeriodoModal
          bloque={
            {
              key: "CK",
              nombre: "Calvin Klein",
              periodoAbierto: { id: "per-ck", nombre: "Período 2026" },
              facturas: { count: 2, total: 300 },
              muebles: { count: 0, total: 0 },
              total: 300,
              proyectos: 2,
              sinComprobante: 0,
              sinFoto: 0,
              noReportado: { count: 1, total: 45 },
            } as never
          }
          periodoId="per-ck"
          onClose={() => {}}
          onCerrado={() => {}}
        />
      </ToastProvider>,
    );
    const nombre = (await screen.findByLabelText(/¿Con qué nombre se cierra este período\?/)) as HTMLInputElement;
    expect(nombre.value).toBe("Período 2026");
    expect(screen.getByLabelText(/Nota de crédito/)).toBeTruthy();
    expect(screen.getByText(/ya lo cobraste/i)).toBeTruthy();
    expect(screen.getByText("$45.00")).toBeTruthy(); // lo apagado, dicho aparte
    expect(screen.getByText("Cerrar período")).toBeTruthy();
    expect(screen.queryByText(/bajar reporte/i)).toBeNull();
    expect(screen.queryByLabelText(/período que empieza/)).toBeNull();
    // Y con el interruptor prendido, el detalle NO baja el Excel al cerrar.
    const detalle = codigo("src/app/marketing/components/DetallePeriodoView.tsx");
    expect(detalle).toMatch(/if \(!MARKETING_PORTADA_REDISENO\) \{\s*await descargarReporte\(periodoId, etiquetaCierre, marca\.key\);/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("3 · 🔴 el total excluye lo no reportado, y lo apagado se dice aparte", () => {
  it("con la bandera, `se_reporta = false` va a `noReportado` y no entra en total, porMarca ni porCliente", () => {
    const r = entrada({ excluir: true });
    const th = r.bloques.find((b) => b.key === "TH")!;
    const ck = r.bloques.find((b) => b.key === "CK")!;
    expect(th.total).toBe(110); // 100 + 10 (null = prendido)
    expect(th.noReportado).toEqual({ count: 1, total: 40 });
    expect(ck.total).toBe(60);
    expect(ck.noReportado).toEqual({ count: 1, total: 20 });
    expect(r.porMarca[TH]).toBe(110);
    expect(r.porMarca[CK]).toBe(60);
    expect(r.porCliente.reduce((s, f) => s + f.total, 0)).toBe(170);
    // Multifashion también aparta lo apagado.
    const mf = r.bloques.find((b) => b.key === MULTIFASHION_KEY)!;
    expect(mf.total).toBe(0);
    expect(mf.noReportado).toEqual({ count: 1, total: 25 });
  });

  it("sin la bandera, ni un centavo se mueve: todo cuenta como antes", () => {
    const r = entrada({ excluir: false });
    expect(r.bloques.find((b) => b.key === "TH")!.total).toBe(150);
    expect(r.bloques.find((b) => b.key === "CK")!.total).toBe(80);
    expect(r.bloques.find((b) => b.key === MULTIFASHION_KEY)!.total).toBe(25);
    for (const b of r.bloques) expect(b.noReportado).toEqual({ count: 0, total: 0 });
  });

  it("las filas de la portada muestran lo reportado y, aparte, lo apagado; los días salen del hoy de Panamá", () => {
    const filas = filasAbiertas(
      entrada({ excluir: true }).bloques,
      { "per-th": { abiertoEn: "2026-08-12T03:21:05Z", nombreAlCerrar: null, notaCredito: null } },
      "2026-09-22",
    );
    const th = filas.find((f) => f.key === "TH")!;
    expect(th.reportado).toBe(110);
    expect(th.noReportado).toBe(40);
    expect(th.diasAbierto).toBe(42);
    expect(textoDiasAbierto(42)).toBe("42 días abierto");
    expect(textoDiasAbierto(0)).toBe("Abrió hoy");
    expect(diasDesde(null, "2026-09-22")).toBeNull();
  });

  it("los reportes: solo lo reportado, una marca = 100 %, «General» al final", () => {
    const gastos: GastoParaReporte[] = [
      { id: "a", tipo: "factura", marcaCodigo: "TH", tiendaCodigo: "D-25", tiendaNombre: "City Mall", monto: 100, seReporta: true, fecha: "2026-05-01" },
      { id: "b", tipo: "factura", marcaCodigo: "TH", tiendaCodigo: "D-25", tiendaNombre: "City Mall", monto: 40, seReporta: false, fecha: "2026-05-02" },
      { id: "c", tipo: "impulsadora", marcaCodigo: "CK", tiendaCodigo: null, monto: 800, seReporta: null, fecha: "2026-06-01" },
      { id: "d", tipo: "mueble", marcaCodigo: "CK", tiendaCodigo: "D-108", tiendaNombre: "Multifashion", monto: 60, seReporta: true, fecha: "2025-12-01" },
    ];
    const nombres = { TH: "Tommy Hilfiger", CK: "Calvin Klein" };
    const porMarca = reportePorMarcaDe(gastos, nombres, 2026);
    expect(porMarca.map((f) => f.codigo)).toEqual(["TH", "CK", "KL", "RBK", "J"]);
    expect(porMarca.find((f) => f.codigo === "TH")).toMatchObject({ reportado: 100, noReportado: 40, cantidadNoReportada: 1 });
    expect(porMarca.find((f) => f.codigo === "CK")!.reportado).toBe(800); // el de 2025 no entra
    const porTienda = reportePorTiendaDe(gastos, nombres);
    expect(porTienda.map((f) => f.tienda)).toEqual(["City Mall", "Multifashion", "General"]);
    expect(porTienda[0]).toMatchObject({ total: 100, noReportado: 40, porMarca: { "Tommy Hilfiger": 100 } });
    expect(porTienda.at(-1)).toMatchObject({ tiendaCodigo: null, total: 800 });
    // Una marca = 100 %; dos marcas (fila vieja) = a partes iguales, y se dice.
    expect(partesPorMarca(100, [{ marcaId: "m1" }])).toEqual({ partes: [{ marcaId: "m1", monto: 100 }], repartido: false });
    expect(partesPorMarca(100, [{ marcaId: "m1" }, { marcaId: "m2" }]).repartido).toBe(true);
    expect(codigo("src/lib/marketing/reportes-rediseno.ts")).not.toMatch(/sumPct/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("4 · 🔴 Multifashion no es una marca", () => {
  it("no sale entre las marcas abiertas; se enlaza aparte como tienda", () => {
    const bloques = entrada({ excluir: false }).bloques;
    expect(bloques.some((b) => b.key === MULTIFASHION_KEY)).toBe(true);
    const filas = filasAbiertas(bloques, {}, "2026-09-22");
    expect(filas.map((f) => f.key)).not.toContain(MULTIFASHION_KEY);
    expect(filaTiendaMultifashion(bloques)).toMatchObject({ key: MULTIFASHION_KEY, total: 25, cantidad: 1 });
  });

  it("el reporte por marca solo conoce las cinco marcas del módulo", () => {
    const filas = reportePorMarcaDe([], {});
    expect(filas.map((f) => f.codigo)).toEqual(["TH", "CK", "KL", "RBK", "J"]);
    expect(codigo("src/lib/marketing/reportes-rediseno.ts")).not.toMatch(/multifashion/i);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("5 · 🔴 los gastos de las marcas no se suman entre sí", () => {
  it("la portada nueva no tiene total del grupo ni «Por marca» / «Por cliente»", () => {
    const src = codigo("src/app/marketing/components/PortadaAbiertosCerrados.tsx");
    expect(src).not.toMatch(/resumen\.total/);
    expect(src).not.toMatch(/gastado en el período actual/);
    expect(src).not.toMatch(/PorClienteModal|PorMarcaModal/);
    expect(src).not.toMatch(/\.reduce\(/);
  });

  it("el reporte por marca no tiene pie con el interruptor prendido", () => {
    const src = codigo("src/app/marketing/components/ReportePorMarcaView.tsx");
    expect(src).toMatch(/MARKETING_PORTADA_REDISENO \? null : filas\.reduce/);
    expect(src).toMatch(/totalDeAntes !== null && \(/);
  });

  it("los cerrados muestran el nombre que se les puso, la fecha y la nota", () => {
    const filas = filasCerradas(
      [
        { id: "per-mid", bloqueKey: "CK", bloqueNombre: "Calvin Klein", nombre: "mid 2026", cerradoEn: "2026-08-12T01:20:45Z", total: 46462.14 },
        { id: "per-x", bloqueKey: "TH", bloqueNombre: "Tommy Hilfiger", nombre: "Período 2026", cerradoEn: "2026-09-22T15:00:00Z", total: 100 },
        { id: null, bloqueKey: "TH", bloqueNombre: "Tommy Hilfiger", nombre: "Gastos Tommy y Calvin", cerradoEn: null, total: 1 },
      ],
      { "per-x": { abiertoEn: null, nombreAlCerrar: "Temporada 2026", notaCredito: "NC-7" } },
    );
    expect(filas.map((f) => f.nombre)).toEqual(["Temporada 2026", "mid 2026"]);
    expect(filas[0]).toMatchObject({ notaCredito: "NC-7", marcaNombre: "Tommy Hilfiger" });
    expect(filas[1]).toMatchObject({ notaCredito: null, total: 46462.14 });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("6 · 🩸 el reporte por proyecto contesta 410 y no hay «Exportar Excel»", () => {
  it("GET /api/marketing/reportes/proyecto → 410, con el porqué", async () => {
    const res = await reporteProyectoGET();
    expect(res.status).toBe(410);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/por marca y por tienda/);
  });

  it("ni la vista, ni la exportación, ni el botón vuelven", () => {
    expect(fs.existsSync(path.join(RAIZ, "src/app/marketing/components/ReportePorProyectoView.tsx"))).toBe(false);
    const reportes = codigo("src/lib/marketing/reportes.ts");
    expect(reportes).not.toMatch(/export (async )?function (reportePorProyecto|exportarExcelReporte)/);
    expect(reportes).not.toMatch(/excel-export/);
    const dir = path.join(RAIZ, "src/app/marketing/components");
    for (const f of fs.readdirSync(dir)) {
      if (!/\.tsx?$/.test(f)) continue;
      expect(codigo(`src/app/marketing/components/${f}`), f).not.toMatch(/Exportar Excel/);
    }
    const tabs = codigo("src/app/marketing/components/ReportesTabs.tsx");
    expect(tabs).not.toMatch(/proyecto/i);
    expect(tabs.match(/value: "(marca|tienda)"/g)).toHaveLength(2);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("7 · el interruptor", () => {
  const datosInicio = {
    bloques: [
      { key: "TH", nombre: "Tommy Hilfiger", periodoAbierto: { id: "per-th", nombre: "Período 2026" }, facturas: { count: 3, total: 21530.98 }, muebles: { count: 0, total: 0 }, total: 21530.98, proyectos: 2, noReportado: { count: 0, total: 0 } },
      { key: MULTIFASHION_KEY, nombre: "Multifashion", periodoAbierto: null, facturas: { count: 4, total: 8061.63 }, muebles: { count: 0, total: 0 }, total: 8061.63, proyectos: 1, noReportado: { count: 0, total: 0 } },
    ],
    cerrados: [],
    resumen: { total: 29592.61, proyectos: 3, clientes: 2 },
    porCliente: [],
    porMarca: {},
    marcas: [],
    conPeriodos: true,
    mobiliario: { entregas: 24, total: 81347 },
    impulsadoras: { count: 2, montoMensual: 1600 },
    periodosMeta: { "per-th": { abiertoEn: "2026-08-12T03:21:05Z", nombreAlCerrar: null, notaCredito: null } },
    hoy: "2026-09-22",
  };
  const props = {
    onSelectBloque: () => {},
    onRegistrarGasto: () => {},
    onOpenImpulsadoras: () => {},
    onOpenInventario: () => {},
    onOpenReportes: () => {},
    refreshKey: 0,
  };

  it("hoy está PRENDIDO: la portada es Abiertos | Cerrados, sin Multifashion como marca y sin total del grupo", async () => {
    expect(MARKETING_PORTADA_REDISENO).toBe(true);
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => datosInicio })));
    render(<InicioMarketing {...props} />);
    await waitFor(() => expect(screen.getByText("Tommy Hilfiger")).toBeTruthy());
    expect(screen.getByRole("tab", { name: /Abiertos/ })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Cerrados/ })).toBeTruthy();
    expect(screen.getByText("$21,530.98")).toBeTruthy();
    expect(screen.getByText(/42 días abierto/)).toBeTruthy();
    expect(screen.queryByText(/gastado en el período actual/)).toBeNull();
    expect(screen.queryByText("$29,592.61")).toBeNull();
    // Multifashion: en Herramientas como tienda, no bajo «Marcas».
    expect(screen.getByText(/Tienda propia · 4 gastos/)).toBeTruthy();
    expect(screen.getByText("Por marca y por tienda")).toBeTruthy();
  });

  it("apagado = la portada de antes, con el mismo archivo, intacta", () => {
    const src = codigo("src/app/marketing/components/InicioMarketing.tsx");
    expect(src).toContain("if (MARKETING_PORTADA_REDISENO) {");
    expect(src).toContain("return <InicioDeAntes {...props} />;");
    expect(src).toContain("gastado en el período actual");
    expect(src).toContain("Tienda propia · sin período");
    const modal = codigo("src/app/marketing/components/CerrarPeriodoModal.tsx");
    expect(modal).toContain("return <CerrarPeriodoModalDeAntes {...props} />;");
    expect(modal).toContain("¿Cómo se llama el período que empieza?");
    const cerrar = codigo("src/app/api/marketing/periodos/cerrar.ts");
    expect(cerrar).toContain("export async function cerrarPeriodoDeMarca");
    const reportes = codigo("src/lib/marketing/reportes.ts");
    expect(reportes).toContain("export async function reportePorMarca(");
    expect(reportes).toContain("export async function reportePorTienda(");
  });
});
