// ============================================================================
// Candado — la lista de una marca PARTIDA POR PERÍODO y la fila "General"
// (12-ago-2026). Daniel: *"nova lux si era de verdad, pero esta mezclado en el
// cierre anterior… no quiero friccion, quiero orden simple"*.
//
// Lo que protege:
//   1. La SECCIÓN la decide el clasificador ÚNICO (`crearClasificadorPeriodos`
//      de resumen-bloques): sello a período CERRADO = reportado; sello a un
//      período ABIERTO —incluido el fantasma `pvh · abierto` que hoy llevan
//      16/17 pagos de impulsadora— o sin sello = actual. Así la pantalla queda
//      bien ANTES y DESPUÉS de que Daniel repare los sellos sucios.
//   2. Un documento con sello DUPLICADO (el caso real: la entrega de Nova Lux,
//      sellada a CK abierto Y a pvh abierto) se clasifica UNA vez — no duplica.
//   3. Un proyecto con gasto actual Y reportado va en el ACTUAL (es donde se
//      trabaja), con `tambienEn` para decir su historia. Solo-reportado va
//      bajo su período cerrado más nuevo. Sin documentos va al actual.
//   4. La fila GENERAL junta impulsadoras y gastos sin cliente por la marca
//      REAL (mk_factura_marcas) — nunca por la clave del sello — y excluye
//      solo lo sellado a un período CERRADO.
//   5. La ruta proyectos-lista usa estos módulos (no una segunda copia).
//
// Verificado por mutación: hacer que un sello a período abierto cuente como
// reportado rompe 3, mandar el proyecto mixto al cerrado rompe 2, y escribir
// un segundo mapa de sellos en la ruta rompe 1.
// ============================================================================
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import {
  crearClasificadorPeriodos,
  type PeriodoRow,
  type SelloRow,
} from "@/lib/marketing/resumen-bloques";
import {
  armarGastoGeneral,
  compararPeriodosCerrados,
  descripcionDeGastoSuelto,
  ordenarSubsecciones,
  seccionDeProyecto,
  type PeriodoCerradoRef,
} from "@/lib/marketing/lista-por-periodo";

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

describe("seccionDeProyecto — dónde va cada proyecto", () => {
  const mid: PeriodoCerradoRef = { id: "per-mid", nombre: "mid 2026", cerradoEn: "2026-08-12T01:20:45Z" };

  it("con gasto actual va en ACTUAL, aunque también haya reportado (mixto)", () => {
    const s = seccionDeProyecto(2, [mid, mid]);
    expect(s.seccion).toBe("actual");
    expect(s.periodo).toBeNull();
    // La historia se dice UNA vez, sin duplicados.
    expect(s.tambienEn).toEqual(["mid 2026"]);
  });

  it("solo reportado va bajo su período cerrado", () => {
    const s = seccionDeProyecto(0, [mid]);
    expect(s.seccion).toBe("cerrado");
    expect(s.periodo?.nombre).toBe("mid 2026");
    expect(s.tambienEn).toEqual([]);
  });

  it("con gasto en DOS cerrados va bajo el más NUEVO", () => {
    const viejo: PeriodoCerradoRef = { id: "per-v", nombre: "early 2026", cerradoEn: "2026-03-01T00:00:00Z" };
    const s = seccionDeProyecto(0, [viejo, mid]);
    expect(s.periodo?.nombre).toBe("mid 2026");
  });

  it("sin documentos va al ACTUAL (recién creado se trabaja hoy)", () => {
    const s = seccionDeProyecto(0, []);
    expect(s.seccion).toBe("actual");
    expect(s.tambienEn).toEqual([]);
  });

  it("el archivo legacy (sin cerrado_en) queda al final del orden", () => {
    const legacy: PeriodoCerradoRef = { id: null, nombre: "Gastos Tommy y Calvin", cerradoEn: null };
    expect(compararPeriodosCerrados(mid, legacy)).toBeLessThan(0);
    expect(ordenarSubsecciones([legacy, mid]).map((p) => p.nombre)).toEqual([
      "mid 2026",
      "Gastos Tommy y Calvin",
    ]);
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
});

describe("barrido estático — una sola verdad, en la ruta y en la vista", () => {
  const ruta = leer("app/api/marketing/proyectos-lista/route.ts");
  const vista = leer("app/marketing/components/ProyectosHomeView.tsx");

  it("la ruta usa el clasificador único y el módulo de partición", () => {
    expect(ruta).toContain("crearClasificadorPeriodos");
    expect(ruta).toContain("seccionDeProyecto");
    expect(ruta).toContain("armarGastoGeneral");
    // Nada de un segundo mapa de sellos escrito a mano en la ruta.
    expect(ruta).not.toMatch(/selloDe\s*=/);
    expect(ruta).not.toMatch(/new Map[^;]*periodo_id/);
  });

  it("🔴 General sale de la marca REAL (mk_factura_marcas), no del sello", () => {
    // Los gastos sueltos se leen aparte (proyecto_id null)…
    expect(ruta).toMatch(/\.is\("proyecto_id", null\)/);
    // …y su marca se decide con el índice marca→bloque, nunca con la clave
    // del sello (el estado sucio de hoy dice 'pvh' donde debería decir TH/CK).
    expect(ruta).toMatch(/pctBloque/);
    expect(ruta).not.toMatch(/proveedor_key[^\n]*impulsadora/);
  });

  it("la vista dibuja las dos secciones y la fila General con su detalle", () => {
    expect(vista).toContain("Período actual");
    expect(vista).toContain("Ya reportado");
    expect(vista).toContain("También reportó en");
    expect(vista).toMatch(/setVerGeneral\(true\)/);
    expect(vista).toContain("ordenarSubsecciones");
    // El proyecto mixto va arriba: la vista NO puede reordenarlo al cerrado.
    expect(vista).toMatch(/p\.seccion !== "cerrado"/);
  });
});
