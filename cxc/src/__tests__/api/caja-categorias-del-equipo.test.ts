/**
 * ─────────────────────────────────────────────────────────────────────────────
 * CAJA — LAS CATEGORÍAS SON DEL EQUIPO (20-sep-2026).
 *
 * Daniel, textual: *«si algún momento hay una categoría nueva, pon el más para
 * configurarla y que los que tengan el módulo las puedan crear para siempre en
 * todos los usuarios»*.
 *
 * Lo que este archivo vigila, del lado del servidor:
 *  - 🔴 CREAR ES DE CUALQUIERA CON EL MÓDULO (antes solo el dueño: la
 *    secretaria, que es quien carga la caja, no podía);
 *  - 🔴 la repetida se rechaza por CLAVE EXACTA (minúsculas y sin acentos),
 *    jamás por parecido — «Material» y «Materiales» son DOS;
 *  - 🔴 SOFT DELETE FIRMADO, NUNCA DELETE, y la quitada se puede volver a
 *    agregar (se revive su fila);
 *  - QUITAR sigue siendo del dueño, y una categoría en uso no se quita;
 *  - 🔴 FALLA ABIERTA: sin la DDL 20261212120000 se lee y se crea como hoy.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

let rol = "secretaria";
let esDueno = false;

vi.mock("@/lib/requireRole", () => ({
  requireRole: () => ({ role: rol, userName: "Angela", userId: "u-1", isOwner: esDueno }),
}));
vi.mock("@/lib/log-activity", () => ({ logActivity: async () => undefined }));

/** Categorías vivas en la base de mentira. */
let activas: string[];
/** Categorías con `deleted = true`. */
let quitadas: string[];
/** ¿La base todavía NO tiene la columna `deleted`? (la DDL sin correr) */
let sinColumnaDeleted: boolean;
/** Cuántos gastos vivos usan la categoría que se quiere quitar. */
let gastosConLaCategoria: number;
let ops: Array<{ tabla: string; op: string; datos?: Record<string, unknown>; filtros: Record<string, unknown> }>;

function cadena(tabla: string) {
  const filtros: Record<string, unknown> = {};
  let op = "select";
  let datos: Record<string, unknown> | undefined;
  let conteo = false;

  function resolver(): { data: unknown; error: unknown; count?: number } {
    // La DDL que falta es la de `caja_categorias`; `caja_gastos` SÍ tiene su
    // columna `deleted` desde siempre.
    const faltaColumna = sinColumnaDeleted && tabla === "caja_categorias"
      && ("deleted" in filtros || (datos && "deleted" in datos));
    if (faltaColumna) return { data: null, error: { message: 'column "deleted" does not exist' } };

    if (op === "update" || op === "insert" || op === "delete") {
      if (sinColumnaDeleted && datos && "created_by" in datos) {
        return { data: null, error: { message: 'column "created_by" does not exist' } };
      }
      const objetivo = String(filtros.nombre ?? "");
      if (op === "update" && datos?.deleted === false) {
        // Revivir: solo pega si esa categoría estaba quitada.
        const estaba = quitadas.includes(objetivo);
        if (estaba) { quitadas = quitadas.filter((c) => c !== objetivo); activas = [...activas, objetivo]; }
        ops.push({ tabla, op, datos, filtros });
        return { data: estaba ? [{ nombre: objetivo }] : [], error: null };
      }
      if (op === "update" && datos?.deleted === true) {
        activas = activas.filter((c) => c !== objetivo);
        quitadas = [...quitadas, objetivo];
      }
      if (op === "insert") activas = [...activas, String(datos?.nombre ?? "")];
      if (op === "delete") activas = activas.filter((c) => c !== objetivo);
      ops.push({ tabla, op, datos, filtros });
      return { data: datos ? [datos] : [], error: null };
    }

    if (tabla === "caja_gastos") return { data: [], error: null, count: gastosConLaCategoria };
    if (conteo) return { data: [], error: null, count: gastosConLaCategoria };
    // Sin la columna, un SELECT plano trae TODAS las filas (activas y quitadas).
    const lista = sinColumnaDeleted ? [...activas, ...quitadas] : activas;
    return { data: lista.map((nombre) => ({ nombre })), error: null };
  }

  const c: Record<string, unknown> = {};
  Object.assign(c, {
    select: (_s?: string, o?: { head?: boolean }) => { if (o?.head) conteo = true; return c; },
    eq: (col: string, val: unknown) => { filtros[col] = val; return c; },
    order: () => c,
    limit: () => c,
    update: (d: Record<string, unknown>) => { op = "update"; datos = d; return c; },
    insert: (d: Record<string, unknown>) => { op = "insert"; datos = d; return c; },
    delete: () => { op = "delete"; return c; },
    maybeSingle: async () => resolver(),
    single: async () => resolver(),
    then: (onOk: (v: unknown) => unknown) => Promise.resolve(resolver()).then(onOk),
  });
  return c;
}

vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: { from: (tabla: string) => cadena(tabla) },
}));

beforeEach(() => {
  rol = "secretaria";
  esDueno = false;
  activas = ["Alimentación", "Materiales", "Otros", "Transporte"];
  quitadas = [];
  sinColumnaDeleted = false;
  gastosConLaCategoria = 0;
  ops = [];
});

const req = (cuerpo: unknown) => ({ json: async () => cuerpo }) as never;

async function crear(nombre: unknown) {
  const { POST } = await import("@/app/api/caja/categorias/route");
  const res = await POST(req({ nombre }));
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}
async function quitar(nombre: unknown) {
  const { DELETE } = await import("@/app/api/caja/categorias/route");
  const res = await DELETE(req({ nombre }));
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}
async function listar() {
  const { GET } = await import("@/app/api/caja/categorias/route");
  const res = await GET(req({}));
  return (await res.json()) as string[];
}

describe("🔴 CREAR ES DE CUALQUIERA QUE TENGA EL MÓDULO", () => {
  it("la secretaria crea una categoría y queda para todos", async () => {
    const r = await crear("materiales de aseo");
    expect(r.status).toBe(200);
    // Se guarda con la grafía de la casa: primera en mayúscula.
    const alta = ops.find((o) => o.op === "insert");
    expect(alta?.datos?.nombre).toBe("Materiales de aseo");
    expect(await listar()).toContain("Materiales de aseo");
  });

  it("queda firmada: se guarda quién la creó", async () => {
    await crear("Rifa");
    expect(ops.find((o) => o.op === "insert")?.datos?.created_by).toBe("Angela");
  });

  it("un nombre vacío no crea nada", async () => {
    const r = await crear("   ");
    expect(r.status).toBe(400);
    expect(ops.filter((o) => o.op === "insert")).toHaveLength(0);
  });
});

describe("🔴 LA REPETIDA SE RECHAZA POR CLAVE EXACTA, NUNCA POR PARECIDO", () => {
  it("«alimentacion» sin acento es la MISMA que «Alimentación»: no se crea", async () => {
    const r = await crear("alimentacion");
    expect(r.status).toBe(400);
    expect(String(r.json.error)).toContain("Alimentación");
    expect(ops.filter((o) => o.op === "insert")).toHaveLength(0);
  });

  it("🔴 CONTROL: «Material» NO es «Materiales» — se crea, son dos categorías", async () => {
    const r = await crear("Material");
    expect(r.status).toBe(200);
    expect(ops.find((o) => o.op === "insert")?.datos?.nombre).toBe("Material");
  });
});

describe("🔴 QUITAR: SOFT DELETE FIRMADO, NUNCA DELETE", () => {
  it("el dueño la quita y la fila se marca, no se borra", async () => {
    esDueno = true; rol = "admin";
    const r = await quitar("Transporte");
    expect(r.status).toBe(200);
    const baja = ops.find((o) => o.tabla === "caja_categorias" && o.op === "update");
    expect(baja?.datos?.deleted).toBe(true);
    expect(baja?.datos?.deleted_by).toBe("Angela");
    expect(baja?.datos?.deleted_at).toBeTruthy();
    expect(ops.some((o) => o.op === "delete")).toBe(false);
    expect(await listar()).not.toContain("Transporte");
  });

  it("🔴 la quitada se puede volver a agregar: se REVIVE su fila, no nace otra", async () => {
    esDueno = true; rol = "admin";
    await quitar("Transporte");
    ops = [];
    esDueno = false; rol = "secretaria";

    const r = await crear("Transporte");
    expect(r.status).toBe(200);
    expect(ops.some((o) => o.op === "insert")).toBe(false);
    expect(ops.find((o) => o.op === "update")?.datos?.deleted).toBe(false);
    expect(await listar()).toContain("Transporte");
  });

  it("CONTROL: quitar sigue siendo del dueño, y la categoría EN USO no se quita", async () => {
    const ajeno = await quitar("Transporte");
    expect(ajeno.status).toBe(403);

    esDueno = true; rol = "admin";
    gastosConLaCategoria = 10;
    const enUso = await quitar("Transporte");
    expect(enUso.status).toBe(400);
    expect(ops.some((o) => o.tabla === "caja_categorias")).toBe(false);
  });
});

describe("🔴 FALLA ABIERTA: sin la DDL, todo como hoy", () => {
  it("la lista se lee igual sin la columna `deleted`", async () => {
    sinColumnaDeleted = true;
    expect(await listar()).toEqual(["Alimentación", "Materiales", "Otros", "Transporte"]);
  });

  it("se crea igual sin la columna `created_by`", async () => {
    sinColumnaDeleted = true;
    const r = await crear("Rifa");
    expect(r.status).toBe(200);
    const alta = ops.filter((o) => o.op === "insert").pop();
    expect(alta?.datos?.nombre).toBe("Rifa");
    expect(alta?.datos).not.toHaveProperty("created_by");
  });

  it("quitar cae al borrado de siempre cuando el soft delete no existe", async () => {
    sinColumnaDeleted = true;
    esDueno = true; rol = "admin";
    const r = await quitar("Transporte");
    expect(r.status).toBe(200);
    expect(ops.some((o) => o.op === "delete" && o.tabla === "caja_categorias")).toBe(true);
  });
});
