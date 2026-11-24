/**
 * Candados de los arreglos de ROBUSTEZ del 24-nov-2026: lecturas que se
 * cortaban en 1.000 filas en silencio, errores que se veían como «vacío» y los
 * descuentos de préstamo que un cierre podía perder sin decirlo.
 * Ningún número cambia: solo que no se pierda ni se calle nada.
 */
import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const RAIZ = path.resolve(__dirname, "../../..");
const leer = (p: string) =>
  fs.readFileSync(path.join(RAIZ, p), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

// ── Supabase falso: cada `from(tabla)` arma una consulta y al esperarla
//    contesta `responder(tabla, operaciones)`. ──────────────────────────────
type Op = { m: string; a: unknown[] };
type Resp = { data: unknown; error: { message: string } | null; count?: number | null };
let responder: (tabla: string, ops: Op[]) => Resp = () => ({ data: [], error: null });
const llamadas: Array<{ tabla: string; ops: Op[] }> = [];

function consulta(tabla: string) {
  const ops: Op[] = [];
  const q: Record<string, unknown> = {};
  for (const m of ["select", "insert", "update", "eq", "in", "or", "is", "gte", "lte", "order", "range", "limit", "single", "maybeSingle"]) {
    q[m] = (...a: unknown[]) => {
      ops.push({ m, a });
      return q;
    };
  }
  q.then = (ok: (r: Resp) => unknown, ko: (e: unknown) => unknown) => {
    llamadas.push({ tabla, ops });
    return Promise.resolve(responder(tabla, ops)).then(ok, ko);
  };
  return q;
}

vi.mock("@/lib/supabase-server", () => ({ supabaseServer: { from: (t: string) => consulta(t) } }));
const enviarSistema = vi.fn(async () => true);
vi.mock("@/lib/alertas/canal", () => ({ enviarSistema: (...a: unknown[]) => enviarSistema(...(a as [])) }));

const tiene = (ops: Op[], m: string) => ops.some((o) => o.m === m);

beforeEach(() => {
  llamadas.length = 0;
  enviarSistema.mockClear();
  responder = () => ({ data: [], error: null });
});

describe("1 · el respaldo lista Storage por páginas", () => {
  it("una carpeta de 1.654 fotos sale entera, no 1.000", async () => {
    const { listarTodoElBucket } = await import("@/lib/backup/listar-storage");
    const fotos = Array.from({ length: 1654 }, (_, i) => ({ name: `f${i}.jpg`, id: `id${i}`, metadata: { size: 1 } }));
    const archivos = await listarTodoElBucket("product-images", async (prefix, { limit, offset }) => {
      if (prefix === "") return { data: [{ name: "products", id: null }], error: null };
      return { data: fotos.slice(offset, offset + limit), error: null };
    });
    expect(archivos).toHaveLength(1654);
    expect(archivos[1653].path).toBe("products/f1653.jpg");
  });

  it("la ruta usa el lister paginado y respalda las cédulas (no las selfies)", () => {
    const ruta = leer("src/app/api/cron/backup/route.ts");
    expect(ruta).toMatch(/listarTodoElBucket\(/);
    expect(ruta).not.toMatch(/list\(prefix, \{ limit: 1000 \}\)/);
    expect(ruta).toMatch(/"asistencia-cedulas"/);
    expect(ruta).not.toMatch(/"asistencia-marcaciones"/);
  });
});

describe("3, 4, 8, 9, 10 · lecturas sin el tope silencioso de 1.000", () => {
  it.each([
    "src/lib/asistencia/aprobaciones-server.ts",
    "src/lib/asistencia/correcciones-server.ts",
    "src/lib/marcacion/reporte-server.ts",
    "src/lib/integrity-checks.ts",
    "src/app/api/asistencia/justificaciones/route.ts",
  ])("%s pagina con leerTodoPaginado y sin .limit(N)", (archivo) => {
    const codigo = leer(archivo);
    expect(codigo).toMatch(/leerTodoPaginado/);
    expect(codigo).not.toMatch(/\.limit\((500|1000)\)/);
  });

  it("aprobaciones: 1.500 filas en un rango largo llegan todas (lo aprobado no sale pendiente)", async () => {
    const filas = Array.from({ length: 1500 }, (_, i) => ({
      empleado_codigo: String(i), fecha: "2026-10-01", aprobado: true, decision: "si", minutos_vistos: 30,
    }));
    responder = (_t, ops) => {
      const r = ops.find((o) => o.m === "range")!.a as [number, number];
      return { data: filas.slice(r[0], r[1] + 1), error: null, count: filas.length };
    };
    const { leerAprobaciones } = await import("@/lib/asistencia/aprobaciones-server");
    const { filas: leidas } = await leerAprobaciones("2026-09-01", "2026-11-15");
    expect(leidas.filter((f) => f.decision === "si").length).toBeGreaterThanOrEqual(1500);
  });

  it("marcas del teléfono: un error de verdad NO se ve como «sin marcas»", async () => {
    responder = () => ({ data: null, error: { message: "connection reset" } });
    const { leerMarcasDelTelefono } = await import("@/lib/marcacion/reporte-server");
    await expect(leerMarcasDelTelefono("2026-11-01", "2026-11-15")).rejects.toThrow(/connection reset/);
  });
});

describe("5, 6 · Caja no cierra ni exporta a ciegas", () => {
  it("cerrar el período contesta 500 si no pudo leer los gastos", () => {
    const ruta = leer("src/app/api/caja/periodos/[id]/route.ts");
    const iError = ruta.indexOf("if (errorGastos)");
    expect(iError).toBeGreaterThan(-1);
    expect(ruta.indexOf("cerrarCon(", iError)).toBeGreaterThan(iError);
  });
  it("el Excel falla en vez de salir vacío", () => {
    expect(leer("src/app/api/caja/export-excel/route.ts")).toMatch(/if \(gErr\) throw/);
  });
  it("7 · las fechas de caja son las de Panamá", () => {
    expect(leer("src/lib/caja/abrir-periodo.ts")).toMatch(/hoyPanama\(\)/);
    expect(leer("src/app/api/caja/periodos/[id]/route.ts")).toMatch(/hoyPanama\(\)/);
  });
});

describe("11 · los descuentos de préstamo del cierre no se pierden en silencio", () => {
  const pago = (codigo: string) => ({
    fichaId: `ficha-${codigo}`, codigo, nombrePrestamos: `Persona ${codigo}`, cuenta: "prestamo" as const,
    concepto: "Pago", monto: 25, fecha: "2026-11-15", origenPago: "Quincena",
  });
  const plan = (cods: string[]) => ({ pagos: cods.map(pago), omisiones: [], total: 25 * cods.length });

  it("un pago que falla siempre vuelve en `fallidos` y no corta a los demás", async () => {
    responder = (tabla, ops) => {
      if (tabla === "prestamos_movimientos" && tiene(ops, "insert")) {
        const fila = ops.find((o) => o.m === "insert")!.a[0] as { empleado_id: string };
        if (fila.empleado_id === "ficha-A") return { data: null, error: { message: "timeout" } };
        return { data: { id: "mov-B" }, error: null };
      }
      return { data: [], error: null };
    };
    const { escribirPagosDelCierre } = await import("@/lib/asistencia/cierre-prestamo-server");
    const r = await escribirPagosDelCierre({ planillaId: "p1", plan: plan(["A", "B"]) as never });
    expect(r.escritos).toBe(1);
    expect(r.fallidos).toEqual([expect.objectContaining({ nombre: "Persona A", monto: 25 })]);
  });

  it("reintentar NO anota dos veces: si el movimiento quedó escrito sin amarre, se reusa", async () => {
    let movimientos: string[] = [];
    let amarreFalla = true;
    responder = (tabla, ops) => {
      if (tabla === "prestamos_movimientos" && tiene(ops, "insert")) {
        movimientos = [...movimientos, `mov-${movimientos.length + 1}`];
        return { data: { id: movimientos[movimientos.length - 1] }, error: null };
      }
      if (tabla === "prestamos_movimientos") return { data: movimientos.map((id) => ({ id })), error: null };
      if (tabla === "asistencia_planilla_prestamo" && tiene(ops, "insert")) {
        if (amarreFalla) {
          amarreFalla = false;
          return { data: null, error: { message: "red caída" } };
        }
        return { data: null, error: null };
      }
      return { data: [], error: null };
    };
    const { escribirPagosDelCierre } = await import("@/lib/asistencia/cierre-prestamo-server");
    const r = await escribirPagosDelCierre({ planillaId: "p1", plan: plan(["A"]) as never });
    expect(r.fallidos).toEqual([]);
    expect(r.escritos).toBe(1);
    expect(movimientos).toHaveLength(1);
  });

  it("lo que falla se avisa por 🔧 SISTEMA y viaja en la respuesta del cierre", async () => {
    const { avisarPagosSinAnotar } = await import("@/lib/asistencia/cierre-prestamo-server");
    await avisarPagosSinAnotar({
      empresa: "Vistana", desde: "2026-11-01", hasta: "2026-11-15",
      fallidos: [{ nombre: "Persona A", cuenta: "prestamo", monto: 25, error: "timeout" }],
    });
    expect(enviarSistema).toHaveBeenCalledTimes(1);
    expect(String((enviarSistema.mock.calls[0] as unknown[])[0])).toMatch(/Persona A/);
    const ruta = leer("src/app/api/asistencia/planilla-guardada/route.ts");
    expect(ruta).toMatch(/await avisarPagosSinAnotar\(/);
    expect(ruta).toMatch(/prestamosSinAnotar,/);
  });
});
