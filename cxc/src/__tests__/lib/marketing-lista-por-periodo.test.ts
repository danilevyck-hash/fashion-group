// ============================================================================
// Candado — los PERÍODOS de una marca como secciones con su detalle, y los
// TRES NIVELES de Marketing (12-ago-2026). Daniel: *"quiero que dentro de
// cada marca aparezca 'periodo uno' periodo dos, y dentro de cada periodo la
// info… que este ordenado"*.
//
// Lo que protege:
//   1. El PERÍODO de cada documento lo decide el clasificador ÚNICO
//      (`crearClasificadorPeriodos`): sello a período CERRADO = reportado;
//      sello a un ABIERTO —incluido el fantasma `pvh · abierto`— o sin sello
//      = actual. La pantalla queda bien ANTES y DESPUÉS de reparar sellos.
//   2. Los montos por proyecto·período salen de `resumen.detalle`, que el
//      agregador acumula EN LAS MISMAS LÍNEAS que arman los totales: la suma
//      del detalle de una sección ES el total de la sección, al centavo.
//   3. `armarSecciones` NO recalcula totales: copia los del agregador. Un
//      proyecto con gasto en DOS períodos aparece en LAS DOS secciones, cada
//      una con SU monto — eso es el orden que pidió Daniel (la línea "También
//      reportó en…" se retiró: la estructura ya lo dice).
//   4. Los slugs de la URL: el nombre del período (`mid-2026`), `actual` como
//      alias permanente del abierto, sufijos ante colisión; la marca resuelve
//      por nombre (`calvin-klein`) Y por código (`ck`, que sobrevive renames).
//   5. La fila GENERAL junta impulsadoras y gastos sin cliente por la marca
//      REAL (mk_factura_marcas) — nunca por la clave del sello — y va EN SU
//      período.
//   6. La ruta y las páginas usan estos módulos (no una segunda cuenta).
//
// Verificado por mutación: recalcular el total desde el detalle rompe 1,
// dejar al proyecto mixto en una sola sección rompe 2, firmar el detalle en
// otra pasada rompe 2, hacer que "actual" no resuelva rompe 1, y escribir un
// segundo mapa de sellos en la ruta rompe 1.
// ============================================================================
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import {
  agregarPorBloques,
  crearClasificadorPeriodos,
  claveDeSeccion,
  SECCION_ABIERTO,
  type PeriodoRow,
  type SelloRow,
} from "@/lib/marketing/resumen-bloques";
import {
  armarGastoGeneral,
  armarSecciones,
  descripcionDeGastoSuelto,
  descripcionGeneral,
  seccionPorSlug,
  type GastoGeneral,
} from "@/lib/marketing/lista-por-periodo";
import {
  asignarSlugsDePeriodo,
  bloqueDeSlug,
  slugDeMarca,
  slugDeNombre,
} from "@/lib/marketing/slugs";

const RAIZ = path.join(__dirname, "..", "..");
const leer = (rel: string) => readFileSync(path.join(RAIZ, rel), "utf8");

// --- Fixture con la forma REAL de producción (medida 12-ago-2026) -----------
const PERIODOS: PeriodoRow[] = [
  { id: "per-mid", proveedor_key: "pvh", nombre: "mid 2026", estado: "cerrado", cerrado_en: "2026-08-12T01:20:45Z" },
  { id: "per-th", proveedor_key: "TH", nombre: "Período 2026", estado: "abierto" },
  { id: "per-ck", proveedor_key: "CK", nombre: "Período 2026", estado: "abierto" },
  // El período FANTASMA: pvh sigue abierto y con sellos viejos apuntándole.
  { id: "per-pvh", proveedor_key: "pvh", nombre: "Período 2026", estado: "abierto" },
];

const SELLOS: SelloRow[] = [
  // Factura reportada en mid 2026 (sello por código de marca).
  { periodo_id: "per-mid", proveedor_key: "TH", tipo: "factura", documento_id: "f-mid-th" },
  // Factura reportada en mid 2026 (sello con la clave VIEJA 'pvh').
  { periodo_id: "per-mid", proveedor_key: "pvh", tipo: "factura", documento_id: "f-mid-ck" },
  // El estado SUCIO de hoy: pago de impulsadora sellado al pvh ABIERTO.
  { periodo_id: "per-pvh", proveedor_key: "pvh", tipo: "factura", documento_id: "f-imp" },
  // Nova Lux: la entrega con sello DUPLICADO (CK abierto + pvh abierto).
  { periodo_id: "per-ck", proveedor_key: "CK", tipo: "entrega", documento_id: "e-nova" },
  { periodo_id: "per-pvh", proveedor_key: "pvh", tipo: "entrega", documento_id: "e-nova" },
];

describe("el clasificador tolera los sellos sucios sin depender de ellos", () => {
  const c = crearClasificadorPeriodos(PERIODOS, SELLOS);

  it("sello a período CERRADO = reportado (por código o por clave vieja)", () => {
    expect(c.cerradoPara("factura", "f-mid-th", "TH", false)?.nombre).toBe("mid 2026");
    expect(c.cerradoPara("factura", "f-mid-ck", "CK", false)?.nombre).toBe("mid 2026");
  });

  it("🔴 el sello al fantasma `pvh · abierto` es GASTO DE AHORA, no reportado", () => {
    // 16 de los 17 pagos de impulsadora están así HOY. Cuando Daniel los
    // repare hacia TH/CK abiertos, la respuesta tiene que ser LA MISMA.
    expect(c.cerradoPara("factura", "f-imp", "TH", false)).toBeNull();
    expect(c.cerradoPara("factura", "f-imp", "CK", false)).toBeNull();
  });

  it("🔴 el sello DUPLICADO de Nova Lux se clasifica una vez y como actual", () => {
    expect(c.cerradoPara("entrega", "e-nova", "CK", false)).toBeNull();
  });

  it("sin sello = actual (documento nuevo)", () => {
    expect(c.cerradoPara("factura", "f-nueva", "TH", false)).toBeNull();
  });
});

// ----------------------------------------------------------------------------
// EL AGREGADOR Y LAS SECCIONES — el detalle sale de la MISMA pasada que los
// totales, y por eso cuadran al centavo por construcción.
// ----------------------------------------------------------------------------

const MARCAS = [
  { id: "m-th", nombre: "Tommy Hilfiger", codigo: "TH", empresa_codigo: null },
  { id: "m-ck", nombre: "Calvin Klein", codigo: "CK", empresa_codigo: null },
];

const PROYECTOS = [
  { id: "p-nova", tienda: "Nova Lux, S.a.", tienda_codigo: null },
  { id: "p-city", tienda: "City Mall David", tienda_codigo: "D-24" },
];

function correrAgregador() {
  return agregarPorBloques({
    facturas: [
      // Reportadas en mid 2026 (una por código, una por clave vieja).
      { id: "f-mid-th", proyecto_id: "p-city", total: 100 },
      { id: "f-mid-ck", proyecto_id: "p-city", total: 50 },
      // La impulsadora: SIN cliente, marcada TH, sellada al pvh ABIERTO.
      { id: "f-imp", proyecto_id: null, total: 800, impulsadora_id: "imp-1" },
      // Gasto de hoy de Nova Lux (CK, sin sello).
      { id: "f-hoy", proyecto_id: "p-nova", total: 200 },
      // City Mall TAMBIÉN gasta hoy (CK): el proyecto queda en DOS períodos.
      { id: "f-hoy2", proyecto_id: "p-city", total: 25 },
    ] as never,
    facturaMarcas: [
      { factura_id: "f-mid-th", marca_id: "m-th", porcentaje: 100 },
      { factura_id: "f-mid-ck", marca_id: "m-ck", porcentaje: 100 },
      { factura_id: "f-imp", marca_id: "m-th", porcentaje: 100 },
      { factura_id: "f-hoy", marca_id: "m-ck", porcentaje: 100 },
      { factura_id: "f-hoy2", marca_id: "m-ck", porcentaje: 100 },
    ] as never,
    entregas: [
      // La entrega de Nova Lux (CK $1.040), con el sello duplicado de arriba.
      { id: "e-nova", proyecto_id: "p-nova", total: 1040, total_por_marca: { "m-ck": 1040 }, total_por_empresa_interna: null },
    ] as never,
    marcas: MARCAS as never,
    proyectos: PROYECTOS,
    proyectosMultifashion: new Set<string>(),
    periodos: PERIODOS,
    sellos: SELLOS,
  });
}

function seccionesDe(bloqueKey: string, generales = new Map<string, GastoGeneral>()) {
  const r = correrAgregador();
  return armarSecciones({
    bloqueKey,
    bloque: r.bloques.find((b) => b.key === bloqueKey) ?? null,
    cerrados: r.cerrados,
    detalle: r.detalle,
    generales,
    conPeriodos: r.conPeriodos,
    ordenProyectos: PROYECTOS.map((p) => p.id),
  });
}

describe("armarSecciones — una sección por período, el abierto primero", () => {
  it("CK: abierto arriba con su total del agregador; mid 2026 debajo", () => {
    const s = seccionesDe("CK");
    expect(s.map((x) => [x.nombre, x.estado, x.total])).toEqual([
      ["Período 2026", "abierto", 1265], // f-hoy 200 + f-hoy2 25 + e-nova 1040
      ["mid 2026", "cerrado", 50],
    ]);
    expect(s[0].puedeCerrar).toBe(true);
    expect(s[1].puedeCerrar).toBe(false);
  });

  it("🔴 el proyecto con gasto en DOS períodos aparece en LAS DOS secciones, cada una con SU monto", () => {
    const s = seccionesDe("CK");
    const abierto = s[0];
    const cerrado = s[1];
    expect(abierto.proyectos).toEqual([
      { id: "p-nova", monto: 1240, facturas: 1, entregas: 1 },
      { id: "p-city", monto: 25, facturas: 1, entregas: 0 },
    ]);
    expect(cerrado.proyectos).toEqual([
      { id: "p-city", monto: 50, facturas: 1, entregas: 0 },
    ]);
  });

  it("🩸 la suma del detalle de cada sección ES su total, al centavo (misma pasada)", () => {
    const r = correrAgregador();
    for (const k of ["TH", "CK"]) {
      const s = armarSecciones({
        bloqueKey: k,
        bloque: r.bloques.find((b) => b.key === k) ?? null,
        cerrados: r.cerrados,
        detalle: r.detalle,
        generales: new Map(),
        conPeriodos: r.conPeriodos,
        ordenProyectos: PROYECTOS.map((p) => p.id),
      });
      for (const sec of s) {
        const proyectos = sec.proyectos.reduce((a, p) => a + p.monto, 0);
        const general = r.detalle
          .filter((d) => d.bloqueKey === k && d.seccion === sec.key && d.proyectoId === null)
          .reduce((a, d) => a + d.monto, 0);
        expect(Number((proyectos + general).toFixed(2))).toBe(sec.total);
      }
    }
  });

  it("🔴 el total de la sección es EL DEL AGREGADOR — nunca se recalcula del detalle", () => {
    // Se le da un detalle deliberadamente incompleto: el total NO se mueve.
    const s = armarSecciones({
      bloqueKey: "CK",
      bloque: {
        periodoAbierto: { id: "per-ck", nombre: "Período 2026" },
        total: 1265,
        facturas: { count: 2, total: 225 },
        muebles: { count: 1, total: 1040 },
      },
      cerrados: [],
      detalle: [],
      generales: new Map(),
      conPeriodos: true,
      ordenProyectos: [],
    });
    expect(s[0].total).toBe(1265);
    expect(s[0].proyectos).toEqual([]);
  });

  it("la impulsadora va como GENERAL de TH en el período ABIERTO (sello fantasma incluido)", () => {
    const r = correrAgregador();
    const general = r.detalle.find(
      (d) => d.bloqueKey === "TH" && d.proyectoId === null,
    );
    expect(general?.seccion).toBe(SECCION_ABIERTO);
    expect(general?.monto).toBe(800);
    // Y el abierto de TH la suma en su total (el chip del inicio).
    expect(r.bloques.find((b) => b.key === "TH")?.total).toBe(800);
  });

  it("el General de cada sección viaja con su clave", () => {
    const g = armarGastoGeneral([
      { id: "f-imp", fecha: "2026-08-01", descripcion: "Pago de impulsadora", monto: 800, esImpulsadora: true },
    ]);
    const s = seccionesDe("TH", new Map([[SECCION_ABIERTO, g]]));
    expect(s[0].general?.total).toBe(800);
    expect(s[1].general).toBeNull();
  });

  it("sin gasto, el abierto existe igual (con puedeCerrar apagado)", () => {
    const s = armarSecciones({
      bloqueKey: "KL",
      bloque: {
        periodoAbierto: { id: "per-kl", nombre: "Período 2026" },
        total: 0,
        facturas: { count: 0, total: 0 },
        muebles: { count: 0, total: 0 },
      },
      cerrados: [],
      detalle: [],
      generales: new Map(),
      conPeriodos: true,
      ordenProyectos: [],
    });
    expect(s).toHaveLength(1);
    expect(s[0].estado).toBe("abierto");
    expect(s[0].puedeCerrar).toBe(false);
  });

  it("el archivo legacy (id null) es una sección con clave legacy:: y sin id", () => {
    expect(claveDeSeccion({ id: null, nombre: "Gastos Tommy y Calvin" })).toBe(
      "legacy::Gastos Tommy y Calvin",
    );
    expect(claveDeSeccion(null)).toBe(SECCION_ABIERTO);
  });
});

// ----------------------------------------------------------------------------
// SLUGS — las URLs de los tres niveles.
// ----------------------------------------------------------------------------
describe("slugs — /marketing/[marca]/[periodo]", () => {
  it("el período va por el slug de su nombre", () => {
    expect(slugDeNombre("mid 2026")).toBe("mid-2026");
    expect(slugDeNombre("Período 2026")).toBe("periodo-2026");
    expect(slugDeNombre("Gastos Tommy y Calvin")).toBe("gastos-tommy-y-calvin");
  });

  it("nombres repetidos: el más nuevo (primero) conserva el slug limpio", () => {
    const s = asignarSlugsDePeriodo([
      { nombre: "Período 2026" },
      { nombre: "mid 2026" },
      { nombre: "mid 2026" },
    ]);
    expect(s.map((x) => x.slug)).toEqual(["periodo-2026", "mid-2026", "mid-2026-2"]);
  });

  it("`actual` es alias permanente del período abierto", () => {
    const s = seccionesDe("CK");
    expect(seccionPorSlug(s, "actual")?.estado).toBe("abierto");
    expect(seccionPorSlug(s, "mid-2026")?.nombre).toBe("mid 2026");
    expect(seccionPorSlug(s, "periodo-2026")?.estado).toBe("abierto");
    expect(seccionPorSlug(s, "no-existe")).toBeNull();
  });

  it("la marca resuelve por NOMBRE (el link lindo) y por CÓDIGO (el estable)", () => {
    expect(bloqueDeSlug("calvin-klein", MARCAS)).toBe("CK");
    expect(bloqueDeSlug("ck", MARCAS)).toBe("CK");
    expect(bloqueDeSlug("CK", MARCAS)).toBe("CK");
    expect(bloqueDeSlug("multifashion", MARCAS)).toBe("multifashion");
    expect(bloqueDeSlug("sin-marca", MARCAS)).toBe("sin_bloque");
    expect(bloqueDeSlug("gucci", MARCAS)).toBeNull();
    // Un rename (French Connection → Karl Lagerfeld) mata el link por nombre
    // viejo, pero el del código sobrevive — por eso existen los dos caminos.
    const renombradas = [{ id: "m-kl", nombre: "Karl Lagerfeld", codigo: "KL" }];
    expect(bloqueDeSlug("french-connection", renombradas)).toBeNull();
    expect(bloqueDeSlug("kl", renombradas)).toBe("KL");
    expect(slugDeMarca("KL", renombradas)).toBe("karl-lagerfeld");
  });
});

describe("la fila General — el gasto sin cliente deja de ser invisible", () => {
  it("suma, cuenta y ordena del más nuevo al más viejo", () => {
    const g = armarGastoGeneral([
      { id: "a", fecha: "2026-08-04", descripcion: "Impulsadora Ana — Feb", monto: 800, esImpulsadora: true },
      { id: "b", fecha: "2026-08-06", descripcion: "Evento", monto: 123.45, esImpulsadora: false },
    ]);
    expect(g.count).toBe(2);
    expect(g.total).toBe(923.45);
    expect(g.items[0].id).toBe("b");
  });

  it("la descripción dice lo primero que exista y diga algo", () => {
    expect(descripcionDeGastoSuelto({ concepto: "Impulsadora Ana — Feb" })).toBe("Impulsadora Ana — Feb");
    expect(descripcionDeGastoSuelto({ concepto: " ", proveedor: "Rotulos SA" })).toBe("Rotulos SA");
    expect(descripcionDeGastoSuelto({ numero_factura: "0042" })).toBe("Factura 0042");
    expect(descripcionDeGastoSuelto({ esImpulsadora: true })).toBe("Pago de impulsadora");
    expect(descripcionDeGastoSuelto({})).toBe("Gasto sin detalle");
  });

  it("el subtítulo dice 'pagos de impulsadora' solo cuando TODOS lo son", () => {
    const imp = armarGastoGeneral([
      { id: "a", fecha: null, descripcion: "x", monto: 800, esImpulsadora: true },
      { id: "b", fecha: null, descripcion: "y", monto: 800, esImpulsadora: true },
    ]);
    expect(descripcionGeneral(imp)).toBe("2 pagos de impulsadora");
    const mixto = armarGastoGeneral([
      { id: "a", fecha: null, descripcion: "x", monto: 800, esImpulsadora: true },
      { id: "b", fecha: null, descripcion: "Evento", monto: 50, esImpulsadora: false },
    ]);
    expect(descripcionGeneral(mixto)).toBe(
      "2 gastos · impulsadoras y gastos sin cliente",
    );
  });
});

// ----------------------------------------------------------------------------
// BARRIDOS ESTÁTICOS — una sola verdad, en la ruta y en las tres páginas.
// ----------------------------------------------------------------------------
describe("barrido estático — una sola verdad", () => {
  const ruta = leer("app/api/marketing/proyectos-lista/route.ts");
  const detalle = leer("app/marketing/components/DetallePeriodoView.tsx");
  const nivel2 = leer("app/marketing/[marca]/page.tsx");
  const nivel3 = leer("app/marketing/[marca]/[periodo]/page.tsx");

  it("la ruta corre el AGREGADOR ÚNICO y arma las secciones con el módulo puro", () => {
    expect(ruta).toContain("agregarPorBloques");
    expect(ruta).toContain("armarSecciones");
    expect(ruta).toContain("crearClasificadorPeriodos");
    expect(ruta).toContain("armarGastoGeneral");
    // Nada de un segundo mapa de sellos escrito a mano en la ruta.
    expect(ruta).not.toMatch(/selloDe\s*=/);
    expect(ruta).not.toMatch(/new Map[^;]*periodo_id/);
  });

  it("🔴 General sale de la marca REAL (mk_factura_marcas), no del sello", () => {
    // La porción de la marca se decide con el índice marca→bloque, nunca con
    // la clave del sello (el estado sucio de hoy dice 'pvh' donde debería
    // decir TH/CK); el clasificador solo elige el PERÍODO.
    expect(ruta).toMatch(/pctBloque/);
    expect(ruta).not.toMatch(/proveedor_key[^\n]*impulsadora/);
  });

  it("🔴 la búsqueda no toca los totales: el agregador corre sobre TODO", () => {
    // Las lecturas van SIN filtro de búsqueda (se filtra en JS después).
    expect(ruta).not.toMatch(/\.or\([^)]*ilike/);
    expect(ruta).toContain("pasaBusqueda");
  });

  it("el nivel 3 dibuja la sección sin recalcular nada", () => {
    expect(detalle).toMatch(/formatearMonto\(seccion\.total\)/);
    expect(detalle).not.toMatch(/\.reduce\([^)]*monto/);
    // La línea "También reportó en…" se retiró: la estructura ya lo dice.
    expect(detalle).not.toContain("También reportó en");
    expect(nivel3).toContain("seccionPorSlug");
  });

  it("el nivel 2 lista los períodos con su ZIP en la fila, y salta con UNO solo", () => {
    expect(nivel2).toContain("bajarZipMarca");
    expect(nivel2).toMatch(/secciones\.length !== 1/);
    // El salto usa replace: Atrás vuelve a /marketing sin rebotar.
    expect(nivel2).toMatch(/router\.replace\(`\/marketing\/\$\{marcaSlug\}\/\$\{secciones\[0\]\.slug\}/);
    // El drill-down normal apila historial (push).
    expect(nivel2).toMatch(/router\.push\(`\/marketing\/\$\{marcaSlug\}\/\$\{s\.slug\}`\)/);
  });

  it("con UN período el volver del nivel 3 va al inicio (el nivel 2 redirige)", () => {
    expect(nivel3).toMatch(/haySeleccionDePeriodos/);
    expect(nivel3).toMatch(/: "\/marketing"/);
  });

  it("🔴 el detalle del agregador se acumula EN LAS MISMAS LÍNEAS que los totales", () => {
    const agg = leer("lib/marketing/resumen-bloques.ts");
    // Cada anotarCerrado de plata va acompañado de su anotarDetalle.
    expect(agg).toMatch(/anotarCerrado\(cer, k, "factura", monto\);\s*\n\s*anotarDetalle\(k, cer, pid, "factura", monto\);/);
    expect(agg).toMatch(/anotarCerrado\(cer, k, "entrega", monto\);\s*\n\s*anotarDetalle\(k, cer, pid, "entrega", monto\);/);
    expect(agg).toMatch(/sumar\(b\.facturas, monto\);\s*\n\s*anotarCliente\(pid, k, monto\);\s*\n\s*anotarDetalle\(k, null, pid, "factura", monto\);/);
    expect(agg).toMatch(/sumar\(b\.muebles, monto\);\s*\n\s*anotarCliente\(pid, k, monto\);\s*\n\s*anotarDetalle\(k, null, pid, "entrega", monto\);/);
  });
});
