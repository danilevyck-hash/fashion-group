// ============================================================================
// Candado — el Excel de un período CERRADO sin reporte congelado se calcula
// EN VIVO y lo declara (12-ago-2026).
//
// 🩸 El bug que esto arregla, reproducido contra producción: "mid 2026" está
// cerrado con `reporte` NULL (la migración #475 insertó la fila cerrada sin
// pasar por el cierre real). GET /api/marketing/periodos/[id]/reporte
// respondía 409 "Este período no tiene reporte guardado" y el chip del inicio
// fallaba SIEMPRE con el toast rojo "No se pudo bajar el reporte". El ZIP del
// mismo chip ya sabía calcular en vivo; el Excel no.
//
// Lo que protege:
//   1. `soloSelladosAEste`: en el reporte en vivo de un período CERRADO entran
//      SOLO los documentos que el clasificador único atribuye a ESE período.
//      Sin sello o sellado a un período ABIERTO (el fantasma `pvh · abierto`)
//      = gasto de ahora, NO entra en el archivo.
//   2. `marca`: el período conjunto legacy ('pvh' junta TH+CK+KL) se puede
//      bajar POR marca — el chip de Calvin trae SOLO lo de Calvin.
//   3. Los totales salen de `agregarPorBloques().cerrados` — la MISMA cifra
//      que el chip muestra — no de una segunda suma.
//   4. El Excel DICE que fue calculado hoy (subtítulo), nunca se hace pasar
//      por un congelado.
//   5. El camino del CIERRE (sin opciones) no cambió, y un reporte congelado
//      se sigue sirviendo tal cual — jamás se recalcula.
//
// Verificado contra producción (12-ago-2026, solo lectura): CK mid 2026 =
// $17.842,14 (30 facturas) y TH mid 2026 = $44.539,43 (29) — idénticos al
// chip y al ZIP; el conjunto da $62.381,57 / 59 facturas (la cifra
// certificada).
// ============================================================================
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";
import path from "path";

// periodos-reporte importa supabase-server (I/O) a nivel de módulo; acá solo
// se ejercitan las funciones PURAS, así que con las env de mentira alcanza.
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://test.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-key";
});

import {
  armarReportePeriodo,
  agregar,
  type DatosPeriodos,
} from "@/lib/marketing/periodos-reporte";

const RAIZ = path.join(__dirname, "..", "..");
const leer = (rel: string) => readFileSync(path.join(RAIZ, rel), "utf8");

// --- Fixture: la forma de producción en miniatura ---------------------------
// mid 2026 (pvh, CERRADO, sin reporte) + abiertos por marca + el pvh fantasma.
function datos(): DatosPeriodos {
  return {
    facturas: [
      // Reportada en mid 2026 con sello por CÓDIGO de marca.
      { id: "f-th", proyecto_id: "p1", total: 100, grupo_legacy: true, impulsadora_id: null, numero_factura: "001", fecha_factura: "2026-05-01", proveedor: "Rotulos SA", concepto: "Letrero" },
      // Reportada en mid 2026 con la clave VIEJA 'pvh'.
      { id: "f-ck", proyecto_id: "p2", total: 50, grupo_legacy: true, impulsadora_id: null, numero_factura: "002", fecha_factura: "2026-05-02", proveedor: "Rotulos SA", concepto: "Caja de luz" },
      // Del período ACTUAL (sin sello): no puede entrar en el archivo.
      { id: "f-hoy", proyecto_id: "p1", total: 999, grupo_legacy: false, impulsadora_id: null, numero_factura: "003", fecha_factura: "2026-08-10", proveedor: "Rotulos SA", concepto: "Nuevo" },
      // El sello sucio: pago de impulsadora al pvh ABIERTO → gasto de ahora.
      { id: "f-imp", proyecto_id: null, total: 800, grupo_legacy: false, impulsadora_id: "imp-1", numero_factura: "004", fecha_factura: "2026-08-04", proveedor: "", concepto: "Impulsadora Ana" },
    ],
    facturaMarcas: [
      { factura_id: "f-th", marca_id: "m-th", porcentaje: 100 },
      { factura_id: "f-ck", marca_id: "m-ck", porcentaje: 100 },
      { factura_id: "f-hoy", marca_id: "m-th", porcentaje: 100 },
      { factura_id: "f-imp", marca_id: "m-th", porcentaje: 100 },
    ],
    proyectos: [
      { id: "p1", nombre: "Remodelacion", tienda: "City Mall David", tienda_codigo: "D-24" },
      { id: "p2", nombre: "Apertura", tienda: "Nova Lux, S.a.", tienda_codigo: "D-90" },
    ],
    marcas: [
      { id: "m-th", nombre: "Tommy Hilfiger", codigo: "TH", empresa_codigo: null },
      { id: "m-ck", nombre: "Calvin Klein", codigo: "CK", empresa_codigo: null },
    ],
    entregas: [
      // Doble sello a ABIERTOS (el caso Nova Lux): actual, y una sola vez.
      { id: "e-nova", proyecto_id: "p2", total: 1040, total_por_marca: { "m-ck": 1040 }, total_por_empresa_interna: null, notas: null, created_at: "2026-08-11T12:00:00Z" },
    ],
    adjuntos: [],
    periodos: [
      { id: "per-mid", proveedor_key: "pvh", nombre: "mid 2026", estado: "cerrado", cerrado_en: "2026-08-12T01:20:45Z" },
      { id: "per-th", proveedor_key: "TH", nombre: "Período 2026", estado: "abierto" },
      { id: "per-ck", proveedor_key: "CK", nombre: "Período 2026", estado: "abierto" },
      { id: "per-pvh", proveedor_key: "pvh", nombre: "Período 2026", estado: "abierto" },
    ],
    sellos: [
      { periodo_id: "per-mid", proveedor_key: "TH", tipo: "factura", documento_id: "f-th" },
      { periodo_id: "per-mid", proveedor_key: "pvh", tipo: "factura", documento_id: "f-ck" },
      { periodo_id: "per-pvh", proveedor_key: "pvh", tipo: "factura", documento_id: "f-imp" },
      { periodo_id: "per-ck", proveedor_key: "CK", tipo: "entrega", documento_id: "e-nova" },
      { periodo_id: "per-pvh", proveedor_key: "pvh", tipo: "entrega", documento_id: "e-nova" },
    ],
    hayTablas: true,
  };
}

const MID = { id: "per-mid", proveedor_key: "pvh", nombre: "mid 2026" };

describe("el reporte en vivo de un período cerrado", () => {
  it("entra SOLO lo sellado a ese período — lo de hoy y lo del fantasma, no", () => {
    const { reporte } = armarReportePeriodo(datos(), MID, { soloSelladosAEste: true });
    const numeros = reporte.facturas.map((f) => f.numero).sort();
    expect(numeros).toEqual(["001", "002"]);
    expect(reporte.entregas).toEqual([]); // e-nova está en ABIERTOS, no acá
    expect(reporte.totales.total).toBe(150);
    expect(reporte.calculadoEnVivo).toBe(true);
  });

  it("🔴 con `marca` el chip de Calvin trae SOLO lo de Calvin", () => {
    const { reporte } = armarReportePeriodo(datos(), MID, {
      soloSelladosAEste: true,
      marca: "CK",
    });
    expect(reporte.proveedorNombre).toBe("Calvin Klein");
    expect(reporte.facturas.map((f) => f.numero)).toEqual(["002"]);
    expect(reporte.totales.total).toBe(50);
  });

  it("los totales son EXACTAMENTE los de agregarPorBloques().cerrados (el chip)", () => {
    const d = datos();
    const cerrados = agregar(d).cerrados.filter((c) => c.id === "per-mid");
    const { reporte } = armarReportePeriodo(d, MID, { soloSelladosAEste: true });
    expect(reporte.totales.total).toBe(
      Number(cerrados.reduce((s, c) => s + c.total, 0).toFixed(2)),
    );
    const th = armarReportePeriodo(d, MID, { soloSelladosAEste: true, marca: "TH" });
    expect(th.reporte.totales.total).toBe(
      cerrados.find((c) => c.bloqueKey === "TH")?.total,
    );
  });

  it("el Excel DECLARA que fue calculado hoy", () => {
    // El Excel del período ahora sale de zip-marca (buildExcelDeMarca, el
    // MISMO workbook que va dentro del ZIP); la declaración vive en su
    // subtítulo. El comportamiento completo se prueba en
    // marketing-zip-marca.test.ts, que arma el archivo de verdad.
    const fuente = leer("lib/marketing/zip-marca.ts");
    expect(fuente).toContain("se cerró sin reporte guardado");
    // Y el generador viejo de 3 hojas genéricas no puede volver a
    // periodos-reporte: el Excel de un período tiene UN solo generador.
    const reporteLib = leer("lib/marketing/periodos-reporte.ts");
    expect(reporteLib).not.toContain("export function excelDeReporte");
  });

  it("el camino del CIERRE no cambió: sin opciones, lo sin sello SÍ entra", () => {
    const { reporte } = armarReportePeriodo(datos(), {
      id: "per-th",
      proveedor_key: "TH",
      nombre: "Período 2026",
    });
    // f-hoy (sin sello) y f-imp (sellada al pvh abierto) son del período
    // abierto de Tommy: el cierre las toma, igual que siempre.
    expect(reporte.facturas.map((f) => f.numero).sort()).toEqual(["003", "004"]);
    expect(reporte.calculadoEnVivo).toBeUndefined();
  });
});

describe("la ruta y el chip", () => {
  const ruta = leer("app/api/marketing/periodos/[id]/reporte/route.ts");
  // El botón Excel de un período cerrado vive en el NIVEL 3 desde el
  // rediseño de tres niveles (12-ago-2026).
  const detalle = leer("app/marketing/components/DetallePeriodoView.tsx");

  it("la ruta genera el MISMO Excel que el ZIP (buildExcelDeMarca), sin un segundo generador", () => {
    // La garantía "un congelado nunca se recalcula" vive en zip-marca
    // (`congelarEnFilas`, candado en marketing-zip-marca.test.ts): los montos
    // salen del jsonb tal cual. La ruta solo elige marca y sirve el archivo.
    expect(ruta).toContain("buildExcelDeMarca({ marcaCodigo: marca, periodoId: params.id })");
    expect(ruta).not.toContain("excelDeReporte");
    // El período abierto sigue contestando 409: su reporte nace al cerrarlo.
    expect(ruta).toContain("todavía está abierto");
  });

  it("acepta ?marca= validada contra la lista de marcas", () => {
    expect(ruta).toMatch(/searchParams\.get\("marca"\)/);
    expect(ruta).toContain("esMarcaCodigo(marcaRaw)");
  });

  it("sin marca, el período conjunto legacy no mezcla reportes: se pide la marca", () => {
    expect(ruta).toContain("junta varias marcas");
  });

  it("el Excel de un período cerrado pide SU marca", () => {
    // Sin la marca, el período conjunto legacy ('pvh' junta TH+CK+KL)
    // mezclaría los reportes: el botón de Calvin baja SOLO lo de Calvin.
    expect(detalle).toMatch(
      /descargarReporte\(seccion\.id as string, etiqueta, marca\.key\)/,
    );
    // Y el cierre baja el recién cerrado con la marca también.
    expect(detalle).toMatch(/descargarReporte\(periodoId, etiquetaCierre, marca\.key\)/);
  });

  it("un reporte vacío no se manda (mismo criterio que MARCA_SIN_GASTO del ZIP)", () => {
    expect(ruta).toContain("MARCA_SIN_GASTO: 404");
  });
});
