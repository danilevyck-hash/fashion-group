// ============================================================================
// CANDADO — períodos por proveedor: sellado al REGISTRAR y cierre por proveedor
//
// Lo que defiende, punto por punto:
//   1. Una factura registrada HOY va al período ABIERTO aunque su
//      `fecha_factura` sea de hace dos meses. El sello es por cuándo se
//      REGISTRÓ, no por la fecha del papel — si fuera por la fecha, una
//      factura atrasada se metería en un período ya reportado y el papel que
//      el proveedor tiene en la mano dejaría de coincidir con el sistema.
//   2. Cerrar PVH NO toca la parte de Reebok del mismo proyecto. Los proyectos
//      no se cierran; se cierra la parte de UN proveedor.
//   3. SIN las tablas de período (la migración la corre Daniel a mano) sellar
//      es un no-op silencioso y guardar una factura sigue funcionando igual.
//   4. Cerrar deja exactamente UN período abierto para ese proveedor. Ni dos
//      (el documento nuevo no sabría en cuál entrar) ni cero (el proveedor se
//      quedaría sin dónde registrar).
//   5. El reporte guardado NO cambia si después cambian los datos.
//
// Corre contra un doble EN MEMORIA de PostgREST: las funciones y los ROUTES
// reales se ejecutan de verdad, con sus queries y su orden de operaciones —
// que es donde vive el riesgo, no en la aritmética.
// ============================================================================
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= "test-anon-key";
  process.env.SESSION_SECRET ||= "test-secret";
});

// ── Doble de PostgREST ──────────────────────────────────────────────────────
type Fila = Record<string, unknown>;

interface Estado {
  tablas: Record<string, Fila[]>;
  /** false = la migración 20260811160000 todavía NO corrió. */
  hayTablasPeriodo: boolean;
  /** Tablas que devuelven error de escritura (para probar el rollback). */
  insertRoto: Set<string>;
  seq: number;
}

const estado: Estado = {
  tablas: {},
  hayTablasPeriodo: true,
  insertRoto: new Set(),
  seq: 0,
};

const TABLAS_PERIODO = new Set(["mk_periodos", "mk_periodo_documentos"]);

function nuevoId(pref: string): string {
  estado.seq += 1;
  return `${pref}-${String(estado.seq).padStart(4, "0")}`;
}

const ERROR_TABLA_AUSENTE = {
  code: "42P01",
  message: 'relation "mk_periodos" does not exist',
};

class Consulta implements PromiseLike<{ data: unknown; error: unknown }> {
  private filtros: Array<(f: Fila) => boolean> = [];
  private op: "select" | "insert" | "update" | "delete" | "upsert" = "select";
  private payload: Fila[] = [];
  private devolver = false;
  private onConflict: string[] = [];
  private ignorarDuplicados = false;
  private ordenCol: string | null = null;
  private ordenAsc = true;

  constructor(private tabla: string) {}

  private get filas(): Fila[] {
    estado.tablas[this.tabla] ??= [];
    return estado.tablas[this.tabla];
  }

  select(_cols?: string) {
    this.devolver = true;
    return this;
  }
  insert(rows: Fila | Fila[]) {
    this.op = "insert";
    this.payload = Array.isArray(rows) ? rows : [rows];
    return this;
  }
  upsert(rows: Fila | Fila[], opts?: { onConflict?: string; ignoreDuplicates?: boolean }) {
    this.op = "upsert";
    this.payload = Array.isArray(rows) ? rows : [rows];
    this.onConflict = (opts?.onConflict ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    this.ignorarDuplicados = Boolean(opts?.ignoreDuplicates);
    return this;
  }
  update(row: Fila) {
    this.op = "update";
    this.payload = [row];
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }
  eq(col: string, val: unknown) {
    this.filtros.push((f) => String(f[col]) === String(val));
    return this;
  }
  in(col: string, vals: unknown[]) {
    const set = new Set(vals.map(String));
    this.filtros.push((f) => set.has(String(f[col])));
    return this;
  }
  is(col: string, val: unknown) {
    this.filtros.push((f) => (val === null ? f[col] == null : f[col] === val));
    return this;
  }
  not(col: string, _op: string, val: unknown) {
    this.filtros.push((f) => (val === null ? f[col] != null : f[col] !== val));
    return this;
  }
  order(col?: string, opts?: { ascending?: boolean }) {
    if (col) {
      this.ordenCol = col;
      this.ordenAsc = opts?.ascending !== false;
    }
    return this;
  }
  limit() {
    return this;
  }

  private aplicar(): Fila[] {
    return this.filas.filter((f) => this.filtros.every((p) => p(f)));
  }

  private ejecutar(): { data: unknown; error: unknown } {
    // La migración de períodos no corrió: PostgREST responde 42P01.
    if (!estado.hayTablasPeriodo && TABLAS_PERIODO.has(this.tabla)) {
      return { data: null, error: ERROR_TABLA_AUSENTE };
    }
    if (
      estado.insertRoto.has(this.tabla) &&
      (this.op === "insert" || this.op === "upsert")
    ) {
      return { data: null, error: { code: "XX000", message: "insert roto (test)" } };
    }

    if (this.op === "insert" || this.op === "upsert") {
      const creadas: Fila[] = [];
      for (const row of this.payload) {
        if (this.op === "upsert" && this.onConflict.length > 0) {
          const yaEsta = this.filas.some((f) =>
            this.onConflict.every((c) => String(f[c]) === String(row[c])),
          );
          // ON CONFLICT DO NOTHING: un documento ya sellado NO se mueve.
          if (yaEsta && this.ignorarDuplicados) continue;
        }
        const nueva = {
          id: nuevoId(this.tabla),
          created_at: "2026-08-11T12:00:00Z",
          ...row,
        };
        this.filas.push(nueva);
        creadas.push(nueva);
      }
      return { data: this.devolver ? creadas : null, error: null };
    }

    if (this.op === "update") {
      const row = this.payload[0] ?? {};
      const afectadas = this.aplicar();
      for (const f of afectadas) Object.assign(f, row);
      return { data: this.devolver ? afectadas : null, error: null };
    }

    if (this.op === "delete") {
      const afectadas = this.aplicar();
      const ids = new Set(afectadas.map((f) => String(f.id)));
      estado.tablas[this.tabla] = this.filas.filter((f) => !ids.has(String(f.id)));
      return { data: this.devolver ? afectadas : null, error: null };
    }

    let out = this.aplicar();
    if (this.ordenCol) {
      const col = this.ordenCol;
      out = [...out].sort((a, b) => {
        const x = String(a[col] ?? "");
        const y = String(b[col] ?? "");
        return this.ordenAsc ? x.localeCompare(y) : y.localeCompare(x);
      });
    }
    // Copia defensiva: el código de producción no puede mutar la "base".
    return { data: out.map((f) => ({ ...f })), error: null };
  }

  async single() {
    const r = this.ejecutar();
    if (r.error) return { data: null, error: r.error };
    const filas = (r.data as Fila[]) ?? [];
    if (filas.length !== 1) {
      return { data: null, error: { code: "PGRST116", message: "no single" } };
    }
    return { data: filas[0], error: null };
  }
  async maybeSingle() {
    const r = this.ejecutar();
    if (r.error) return { data: null, error: r.error };
    const filas = (r.data as Fila[]) ?? [];
    return { data: filas[0] ?? null, error: null };
  }
  then<A, B>(
    onOk?: ((v: { data: unknown; error: unknown }) => A | PromiseLike<A>) | null,
    onErr?: ((r: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve(this.ejecutar()).then(onOk, onErr);
  }
}

vi.mock("@/lib/supabase-server", () => ({
  HAS_SERVICE_ROLE: true,
  supabaseServer: {
    from: (tabla: string) => new Consulta(tabla),
    rpc: async () => ({ data: null, error: { code: "42883", message: "no rpc" } }),
    storage: {
      from: () => ({
        createSignedUrl: async () => ({ data: null, error: { message: "sin storage" } }),
      }),
    },
  },
}));

import { NextRequest } from "next/server";
import { signSession } from "@/lib/session-cookie";
import { setMarcasDeFactura } from "@/lib/marketing/factura-marcas";
import { createFactura } from "@/lib/marketing/mutations";
import {
  armarReportePeriodo,
  cargarDatosPeriodos,
  agregar,
} from "@/lib/marketing/periodos-reporte";
import { periodoAbiertoDe, sellarDocumento } from "@/lib/marketing/periodos-io";
import { POST as cerrarPeriodoRoute } from "@/app/api/marketing/periodos/[id]/cerrar/route";
import { PATCH as renombrarRoute } from "@/app/api/marketing/periodos/[id]/route";
import { GET as reporteRoute } from "@/app/api/marketing/periodos/[id]/reporte/route";

// ── Semilla ─────────────────────────────────────────────────────────────────
const MARCA_TH = "11111111-1111-1111-1111-111111111111";
const MARCA_CK = "22222222-2222-2222-2222-222222222222";
const MARCA_RBK = "33333333-3333-3333-3333-333333333333";
const MARCA_OTR = "44444444-4444-4444-4444-444444444444";

const PROYECTO = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const PER_PVH_CERRADO = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const PER_PVH_ABIERTO = "dddddddd-dddd-dddd-dddd-dddddddddddd";
const PER_RBK_ABIERTO = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";

function sembrar(): void {
  estado.tablas = {
    mk_marcas: [
      { id: MARCA_TH, nombre: "Tommy Hilfiger", codigo: "TH", empresa_codigo: "vistana", tipo: "externa" },
      { id: MARCA_CK, nombre: "Calvin Klein", codigo: "CK", empresa_codigo: "vistana", tipo: "externa" },
      { id: MARCA_RBK, nombre: "Reebok", codigo: "RBK", empresa_codigo: "active_shoes", tipo: "externa" },
      { id: MARCA_OTR, nombre: "Otros", codigo: "OTR", empresa_codigo: null, tipo: "externa" },
    ],
    mk_proyectos: [
      {
        id: PROYECTO,
        nombre: "Apertura Chorrera",
        tienda: "City Moda Chorrera",
        tienda_codigo: "D-30",
        anulado_en: null,
      },
    ],
    mk_facturas: [],
    mk_factura_marcas: [],
    mk_entregas_muebles: [],
    mk_periodos: [
      {
        id: PER_PVH_CERRADO,
        proveedor_key: "pvh",
        nombre: "Gastos Tommy y Calvin",
        estado: "cerrado",
        abierto_en: "2026-01-01T00:00:00Z",
        cerrado_en: "2026-06-30T00:00:00Z",
        cerrado_por: "migracion",
        reporte: null,
      },
      {
        id: PER_PVH_ABIERTO,
        proveedor_key: "pvh",
        nombre: "Período 2026",
        estado: "abierto",
        abierto_en: "2026-07-01T00:00:00Z",
        cerrado_en: null,
        cerrado_por: null,
        reporte: null,
      },
      {
        id: PER_RBK_ABIERTO,
        proveedor_key: "reebok",
        nombre: "Período 2026",
        estado: "abierto",
        abierto_en: "2026-07-01T00:00:00Z",
        cerrado_en: null,
        cerrado_por: null,
        reporte: null,
      },
    ],
    mk_periodo_documentos: [],
  };
  estado.hayTablasPeriodo = true;
  estado.insertRoto = new Set();
  estado.seq = 0;
}

/** Registra una factura con su marca, como lo hace la app. */
async function registrarFactura(opts: {
  numero: string;
  fecha: string;
  total: number;
  marcaIds: string[];
}): Promise<string> {
  const factura = await createFactura({
    proyectoId: PROYECTO,
    numeroFactura: opts.numero,
    fechaFactura: opts.fecha,
    proveedor: "Rótulos Panamá",
    concepto: "Letrero de vidriera",
    subtotal: opts.total,
    itbms: 0,
    tieneImportacion: false,
  });
  await setMarcasDeFactura(
    factura.id,
    opts.marcaIds.map((marcaId) => ({ marcaId })),
  );
  return factura.id;
}

function sellosDe(documentoId: string) {
  return (estado.tablas.mk_periodo_documentos ?? []).filter(
    (s) => String(s.documento_id) === documentoId,
  );
}

function req(body?: unknown): NextRequest {
  const cookie = signSession({
    role: "admin",
    userId: "u1",
    userName: "Daniel",
    sessionToken: "t1",
  });
  return new NextRequest("http://localhost/api/marketing/periodos", {
    method: "POST",
    headers: { cookie: `cxc_session=${cookie}`, "content-type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

beforeEach(() => {
  sembrar();
  vi.restoreAllMocks();
});

// ────────────────────────────────────────────────────────────────────────────
describe("el sello se pone al REGISTRAR, no por la fecha del documento", () => {
  it("una factura de hace dos meses entra en el período ABIERTO", async () => {
    const facturaId = await registrarFactura({
      numero: "F-001",
      fecha: "2026-06-05", // dentro del período YA CERRADO
      total: 1000,
      marcaIds: [MARCA_TH],
    });

    const sellos = sellosDe(facturaId);
    expect(sellos).toHaveLength(1);
    expect(sellos[0].periodo_id).toBe(PER_PVH_ABIERTO);
    expect(sellos[0].periodo_id).not.toBe(PER_PVH_CERRADO);
    expect(sellos[0].proveedor_key).toBe("pvh");
    expect(sellos[0].tipo).toBe("factura");
  });

  it("una factura de dos proveedores recibe UN sello por proveedor", async () => {
    const facturaId = await registrarFactura({
      numero: "F-002",
      fecha: "2026-08-11",
      total: 500,
      marcaIds: [MARCA_TH, MARCA_RBK],
    });

    const sellos = sellosDe(facturaId);
    expect(sellos.map((s) => s.proveedor_key).sort()).toEqual(["pvh", "reebok"]);
    expect(
      sellos.find((s) => s.proveedor_key === "reebok")!.periodo_id,
    ).toBe(PER_RBK_ABIERTO);
  });

  it("Tommy y Calvin son el MISMO proveedor: un solo sello", async () => {
    const facturaId = await registrarFactura({
      numero: "F-003",
      fecha: "2026-08-11",
      total: 800,
      marcaIds: [MARCA_TH, MARCA_CK],
    });
    expect(sellosDe(facturaId)).toHaveLength(1);
  });

  it("una marca SIN proveedor decidido no se sella con nadie", async () => {
    const facturaId = await registrarFactura({
      numero: "F-004",
      fecha: "2026-08-11",
      total: 300,
      marcaIds: [MARCA_OTR],
    });
    expect(sellosDe(facturaId)).toHaveLength(0);
  });

  it("volver a sellar NO mueve un documento ya sellado", async () => {
    const facturaId = await registrarFactura({
      numero: "F-005",
      fecha: "2026-08-11",
      total: 100,
      marcaIds: [MARCA_TH],
    });
    // Cambia el período abierto de PVH por otro y se vuelve a sellar.
    const otro = { ...estado.tablas.mk_periodos[1], id: "otro-abierto" };
    estado.tablas.mk_periodos[1].estado = "cerrado";
    estado.tablas.mk_periodos.push(otro);

    await sellarDocumento({ tipo: "factura", documentoId: facturaId, proveedorKeys: ["pvh"] });

    const sellos = sellosDe(facturaId);
    expect(sellos).toHaveLength(1);
    expect(sellos[0].periodo_id).toBe(PER_PVH_ABIERTO);
  });

  it("cambiar la marca a un proveedor nuevo agrega su sello sin sacar el viejo", async () => {
    const facturaId = await registrarFactura({
      numero: "F-006",
      fecha: "2026-08-11",
      total: 900,
      marcaIds: [MARCA_TH],
    });
    expect(sellosDe(facturaId).map((s) => s.proveedor_key)).toEqual(["pvh"]);

    await setMarcasDeFactura(facturaId, [{ marcaId: MARCA_RBK }]);

    expect(sellosDe(facturaId).map((s) => s.proveedor_key).sort()).toEqual([
      "pvh",
      "reebok",
    ]);
  });
});

// ────────────────────────────────────────────────────────────────────────────
describe("sin la migración corrida, sellar es un no-op silencioso", () => {
  beforeEach(() => {
    estado.hayTablasPeriodo = false;
  });

  it("la factura se guarda igual y no se cae nada", async () => {
    const errores = vi.spyOn(console, "error").mockImplementation(() => {});

    const facturaId = await registrarFactura({
      numero: "F-100",
      fecha: "2026-08-11",
      total: 1234,
      marcaIds: [MARCA_TH],
    });

    expect(facturaId).toBeTruthy();
    expect(estado.tablas.mk_facturas).toHaveLength(1);
    expect(estado.tablas.mk_factura_marcas).toHaveLength(1);
    // "Falta la migración" NO es un error que haya que gritar.
    expect(errores).not.toHaveBeenCalled();
  });

  it("periodoAbiertoDe devuelve null en vez de reventar", async () => {
    await expect(periodoAbiertoDe("pvh")).resolves.toBeNull();
  });

  it("cerrar responde 409 con un mensaje en español, nunca 500", async () => {
    const res = await cerrarPeriodoRoute(req({ nombreSiguiente: "2027" }), {
      params: { id: PER_PVH_ABIERTO },
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/actualización en la base de datos/i);
    expect(body.error).not.toMatch(/mk_periodo|42P01|relation/i);
  });
});

// ────────────────────────────────────────────────────────────────────────────
describe("cerrar un período", () => {
  it("cierra SOLO la parte del proveedor: Reebok sigue viva en el mismo proyecto", async () => {
    await registrarFactura({ numero: "F-PVH", fecha: "2026-08-01", total: 1000, marcaIds: [MARCA_TH] });
    await registrarFactura({ numero: "F-RBK", fecha: "2026-08-02", total: 700, marcaIds: [MARCA_RBK] });

    const antes = agregar(await cargarDatosPeriodos());
    expect(antes.bloques.find((b) => b.key === "pvh")!.total).toBe(1000);
    expect(antes.bloques.find((b) => b.key === "reebok")!.total).toBe(700);

    const res = await cerrarPeriodoRoute(req({ nombreSiguiente: "Temporada 2" }), {
      params: { id: PER_PVH_ABIERTO },
    });
    expect(res.status).toBe(200);

    const despues = agregar(await cargarDatosPeriodos());
    // PVH quedó en cero (su gasto pasó al archivo) y Reebok NO se movió.
    expect(despues.bloques.find((b) => b.key === "pvh")!.total).toBe(0);
    expect(despues.bloques.find((b) => b.key === "reebok")!.total).toBe(700);
    expect(despues.cerrados.find((c) => c.id === PER_PVH_ABIERTO)!.total).toBe(1000);
    // El período de Reebok sigue siendo el mismo, abierto.
    const rbk = estado.tablas.mk_periodos.find((p) => p.id === PER_RBK_ABIERTO)!;
    expect(rbk.estado).toBe("abierto");
  });

  it("deja exactamente UN período abierto para ese proveedor", async () => {
    await registrarFactura({ numero: "F-1", fecha: "2026-08-01", total: 100, marcaIds: [MARCA_CK] });

    const res = await cerrarPeriodoRoute(req({ nombreSiguiente: "Temporada 2" }), {
      params: { id: PER_PVH_ABIERTO },
    });
    expect(res.status).toBe(200);

    const abiertosPvh = estado.tablas.mk_periodos.filter(
      (p) => p.proveedor_key === "pvh" && p.estado === "abierto",
    );
    expect(abiertosPvh).toHaveLength(1);
    expect(abiertosPvh[0].nombre).toBe("Temporada 2");
    expect(abiertosPvh[0].id).not.toBe(PER_PVH_ABIERTO);
  });

  it("si no se puede abrir el siguiente, el cierre se REVIERTE (nunca cero abiertos)", async () => {
    await registrarFactura({ numero: "F-1", fecha: "2026-08-01", total: 100, marcaIds: [MARCA_TH] });
    vi.spyOn(console, "error").mockImplementation(() => {});
    estado.insertRoto.add("mk_periodos");

    const res = await cerrarPeriodoRoute(req({ nombreSiguiente: "Temporada 2" }), {
      params: { id: PER_PVH_ABIERTO },
    });
    expect(res.status).toBe(500);

    const abiertosPvh = estado.tablas.mk_periodos.filter(
      (p) => p.proveedor_key === "pvh" && p.estado === "abierto",
    );
    expect(abiertosPvh).toHaveLength(1);
    expect(abiertosPvh[0].id).toBe(PER_PVH_ABIERTO);
    expect(abiertosPvh[0].reporte).toBeNull();
  });

  it("un período ya cerrado no se cierra dos veces", async () => {
    const res = await cerrarPeriodoRoute(req({ nombreSiguiente: "X" }), {
      params: { id: PER_PVH_CERRADO },
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/ya está cerrado/i);
  });

  it("exige el nombre del próximo período", async () => {
    const res = await cerrarPeriodoRoute(req({ nombreSiguiente: "   " }), {
      params: { id: PER_PVH_ABIERTO },
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/cómo se va a llamar/i);
  });

  it("el gasto de Multifashion no entra en el reporte de ningún proveedor", async () => {
    estado.tablas.mk_proyectos.push({
      id: "mf-1",
      nombre: "Vitrina",
      tienda: "Multifashion",
      tienda_codigo: "D-108",
      anulado_en: null,
    });
    const fMf = await createFactura({
      proyectoId: "mf-1",
      numeroFactura: "F-MF",
      fechaFactura: "2026-08-01",
      proveedor: "Rótulos",
      concepto: "letrero",
      subtotal: 4000,
      itbms: 0,
      tieneImportacion: false,
    });
    await setMarcasDeFactura(fMf.id, [{ marcaId: MARCA_TH }]);
    await registrarFactura({ numero: "F-PVH", fecha: "2026-08-01", total: 1000, marcaIds: [MARCA_TH] });

    const datos = await cargarDatosPeriodos();
    const { reporte } = armarReportePeriodo(datos, {
      id: PER_PVH_ABIERTO,
      proveedor_key: "pvh",
      nombre: "Período 2026",
    });
    expect(reporte.totales.total).toBe(1000);
    expect(reporte.facturas.map((f) => f.numero)).toEqual(["F-PVH"]);
  });
});

// ────────────────────────────────────────────────────────────────────────────
describe("el reporte guardado no se recalcula nunca", () => {
  it("no cambia aunque después cambien los datos", async () => {
    await registrarFactura({ numero: "F-1", fecha: "2026-08-01", total: 1000, marcaIds: [MARCA_TH] });
    await registrarFactura({ numero: "F-2", fecha: "2026-08-02", total: 250, marcaIds: [MARCA_CK] });

    const res = await cerrarPeriodoRoute(req({ nombreSiguiente: "Temporada 2" }), {
      params: { id: PER_PVH_ABIERTO },
    });
    expect(res.status).toBe(200);

    const guardado = estado.tablas.mk_periodos.find((p) => p.id === PER_PVH_ABIERTO)!
      .reporte as { totales: { total: number }; facturas: Array<{ numero: string }> };
    expect(guardado.totales.total).toBe(1250);
    const copia = JSON.parse(JSON.stringify(guardado)) as typeof guardado;

    // Alguien corrige un monto y carga una factura nueva DESPUÉS del cierre.
    estado.tablas.mk_facturas[0].total = 9999;
    await registrarFactura({ numero: "F-3", fecha: "2026-05-01", total: 4000, marcaIds: [MARCA_TH] });

    const otraVez = estado.tablas.mk_periodos.find((p) => p.id === PER_PVH_ABIERTO)!.reporte;
    expect(otraVez).toEqual(copia);
    expect((otraVez as typeof guardado).facturas.map((f) => f.numero)).toEqual([
      "F-1",
      "F-2",
    ]);
  });

  it("la factura vieja que llega DESPUÉS del cierre cae en el período nuevo", async () => {
    await registrarFactura({ numero: "F-1", fecha: "2026-08-01", total: 1000, marcaIds: [MARCA_TH] });
    await cerrarPeriodoRoute(req({ nombreSiguiente: "Temporada 2" }), {
      params: { id: PER_PVH_ABIERTO },
    });

    const tardia = await registrarFactura({
      numero: "F-TARDE",
      fecha: "2026-05-15", // fecha del período que se acaba de cerrar
      total: 400,
      marcaIds: [MARCA_TH],
    });

    const nuevo = estado.tablas.mk_periodos.find(
      (p) => p.proveedor_key === "pvh" && p.estado === "abierto",
    )!;
    expect(sellosDe(tardia)[0].periodo_id).toBe(nuevo.id);

    const resumen = agregar(await cargarDatosPeriodos());
    expect(resumen.bloques.find((b) => b.key === "pvh")!.total).toBe(400);
    expect(resumen.cerrados.find((c) => c.id === PER_PVH_ABIERTO)!.total).toBe(1000);
  });

  it("el Excel sale del reporte guardado; un período abierto no tiene Excel", async () => {
    await registrarFactura({ numero: "F-1", fecha: "2026-08-01", total: 1000, marcaIds: [MARCA_TH] });

    const abierto = await reporteRoute(req(), { params: { id: PER_PVH_ABIERTO } });
    expect(abierto.status).toBe(409);
    expect(((await abierto.json()) as { error: string }).error).toMatch(
      /todavía está abierto/i,
    );

    await cerrarPeriodoRoute(req({ nombreSiguiente: "Temporada 2" }), {
      params: { id: PER_PVH_ABIERTO },
    });

    const cerrado = await reporteRoute(req(), { params: { id: PER_PVH_ABIERTO } });
    expect(cerrado.status).toBe(200);
    expect(cerrado.headers.get("Content-Type")).toContain("spreadsheetml");
    const buf = Buffer.from(await cerrado.arrayBuffer());
    expect(buf.length).toBeGreaterThan(1000);
    expect(buf.subarray(0, 2).toString("latin1")).toBe("PK"); // es un .xlsx real
  });
});

// ────────────────────────────────────────────────────────────────────────────
describe("renombrar", () => {
  it("renombra el período abierto", async () => {
    const res = await renombrarRoute(req({ nombre: "Temporada 1" }), {
      params: { id: PER_PVH_ABIERTO },
    });
    expect(res.status).toBe(200);
    expect(
      estado.tablas.mk_periodos.find((p) => p.id === PER_PVH_ABIERTO)!.nombre,
    ).toBe("Temporada 1");
  });

  it("un período CERRADO no se renombra", async () => {
    const res = await renombrarRoute(req({ nombre: "Otro nombre" }), {
      params: { id: PER_PVH_CERRADO },
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/ya se cerró/i);
    expect(
      estado.tablas.mk_periodos.find((p) => p.id === PER_PVH_CERRADO)!.nombre,
    ).toBe("Gastos Tommy y Calvin");
  });

  it("no acepta un nombre vacío", async () => {
    const res = await renombrarRoute(req({ nombre: "  " }), {
      params: { id: PER_PVH_ABIERTO },
    });
    expect(res.status).toBe(400);
  });
});
