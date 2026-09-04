/**
 * ─────────────────────────────────────────────────────────────────────────────
 * /api/guias/destinos-config — la ruta de Guías › Configuración, EJECUTADA.
 * (4-sep-2026)
 *
 * 🔴 Quién escribe: **admin Y secretaria** — Daniel, textual: *«configuraciones
 * también deja a secretaria»* (Angela y Andrea hacen las guías y son quienes
 * notan un destino mal escrito). Bodega y vendedor: 403 — bodega despacha,
 * vendedor solo lee.
 *
 * 🔴 Quitar es SOFT DELETE FIRMADO: la fila SIGUE en la tabla con
 * `activo = false` + quién y cuándo. Se LLAMA al handler real con la base
 * doblada y se mira QUÉ se escribió — un barrido de texto vería el
 * `.update(...)` y se daría por satisfecho aunque el resultado se tirara
 * (el agujero de /api/saldos-banco, ya pagado). Y hay barrido SIN comentarios
 * que prohíbe un `.delete(` en la capa de base.
 *
 * 🔴 El código del cliente pasa por la puerta única (`validarCodigoParaAtar`):
 * un D-XXX que no existe, o un código de Boston (111380), se rechazan.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { NextResponse } from "next/server";

// ── requireRole doblado FIEL: admin siempre pasa; el resto, solo si está en la
// lista que la RUTA le pasa — así una mutación que abra o cierre la lista de
// roles de la ruta cambia el resultado. ──────────────────────────────────────
let rolActual = "admin";
vi.mock("@/lib/requireRole", () => ({
  requireRole: (_req: unknown, permitidos: string[]) => {
    if (rolActual === "admin" || permitidos.includes(rolActual)) {
      return { role: rolActual, userName: rolActual === "secretaria" ? "Angela" : rolActual };
    }
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  },
}));

vi.mock("@/lib/clientes/directorio-cache", () => ({
  leerClientesDelGrupo: async () => [
    { codigo: "D-35", nombre: "City Shoes" },
    { codigo: "D-112", nombre: "Nine Sports 9, S.A." },
    { codigo: "D-142", nombre: "Sporting Shoes N 4" },
  ],
}));

// ── La base doblada: filas vivas + registro de TODO lo que se escribe ────────
interface Escritura {
  tabla: string;
  op: "insert" | "update" | "delete";
  datos: unknown;
  filtros: Record<string, unknown>;
}
let filas: Array<Record<string, unknown>>;
let escrituras: Escritura[];
let errorLectura: { code?: string; message: string } | null;
let errorEscritura: { code?: string; message: string } | null;

function cadena(tabla: string) {
  const filtros: Record<string, unknown> = {};
  let op: Escritura["op"] | "select" = "select";
  let datos: unknown = null;
  let head = false;

  const terminar = (single: boolean) => {
    if (op !== "select") {
      escrituras.push({ tabla, op, datos, filtros });
      if (errorEscritura) {
        const e = errorEscritura;
        errorEscritura = null;
        return { data: null, error: e };
      }
      if (op === "update") {
        const tocadas = filas.filter(
          (f) =>
            (filtros.id === undefined || f.id === filtros.id) &&
            (filtros.activo === undefined || f.activo === filtros.activo),
        );
        return { data: tocadas.map((f) => ({ id: f.id })), error: null };
      }
      return single ? { data: { id: 99 }, error: null } : { data: [{ id: 99 }], error: null };
    }
    if (errorLectura) return { data: null, error: errorLectura, count: null };
    if (head) return { data: null, error: null, count: filas.length };
    return { data: filas, error: null, count: filas.length };
  };

  const c = {
    select: (_cols?: string, opts?: { head?: boolean }) => {
      if (opts?.head) head = true;
      return c;
    },
    eq: (col: string, val: unknown) => {
      filtros[col] = val;
      return c;
    },
    order: () => c,
    insert: (d: unknown) => {
      op = "insert";
      datos = d;
      return c;
    },
    update: (d: unknown) => {
      op = "update";
      datos = d;
      return c;
    },
    delete: () => {
      op = "delete";
      return c;
    },
    single: async () => terminar(true),
    then: (res: (v: unknown) => unknown) => Promise.resolve(terminar(false)).then(res),
  };
  return c;
}

vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: { from: (tabla: string) => cadena(tabla) },
}));

beforeEach(() => {
  rolActual = "admin";
  escrituras = [];
  errorLectura = null;
  errorEscritura = null;
  filas = [
    {
      id: 1,
      cliente_codigo: "D-35",
      destino: "Calle 19",
      tiendas: [],
      orden: 1,
      activo: true,
      creado_por: "daniel",
      creado_en: "2026-09-04T12:00:00-05:00",
    },
  ];
});

const req = (body?: unknown, id?: string) =>
  ({
    json: async () => body,
    nextUrl: { searchParams: new URLSearchParams(id ? { id } : {}) },
    cookies: { get: () => undefined },
  }) as never;

async function ruta() {
  return await import("@/app/api/guias/destinos-config/route");
}

// ─── 1 · quién entra y quién no ──────────────────────────────────────────────

describe("🔴 admin Y secretaria escriben; bodega y vendedor, 403", () => {
  it("admin: GET 200 con las filas y el nombre del cliente resuelto", async () => {
    const { GET } = await ruta();
    const res = await GET(req());
    expect(res.status).toBe(200);
    const json = (await res.json()) as { destinos: Array<{ cliente_nombre: string | null; destino: string }> };
    expect(json.destinos).toHaveLength(1);
    expect(json.destinos[0].destino).toBe("Calle 19");
    expect(json.destinos[0].cliente_nombre).toBe("City Shoes");
  });

  it("🔴 secretaria: GET 200 y POST 201 — Daniel: «configuraciones también deja a secretaria»", async () => {
    rolActual = "secretaria";
    const { GET, POST } = await ruta();
    expect((await GET(req())).status).toBe(200);
    const res = await POST(req({ cliente_codigo: "D-112", destino: "Calle 19 Central" }));
    expect(res.status).toBe(201);
    const alta = escrituras.find((e) => e.op === "insert");
    expect(alta).toBeTruthy();
    expect(alta!.datos).toMatchObject({ cliente_codigo: "D-112", destino: "Calle 19 Central", creado_por: "Angela" });
  });

  it.each(["bodega", "vendedor"])("%s: 403 en los cuatro verbos, sin tocar la base", async (rol) => {
    rolActual = rol;
    const { GET, POST, PATCH, DELETE } = await ruta();
    expect((await GET(req())).status).toBe(403);
    expect((await POST(req({ cliente_codigo: "D-35", destino: "X" }))).status).toBe(403);
    expect((await PATCH(req({ destino: "X" }, "1"))).status).toBe(403);
    expect((await DELETE(req(undefined, "1"))).status).toBe(403);
    expect(escrituras).toHaveLength(0);
  });
});

// ─── 2 · el alta pasa por la puerta única del directorio ─────────────────────

describe("el alta valida el código contra el directorio del GRUPO", () => {
  it("normaliza el código (d-112 → D-112) y guarda tiendas y orden", async () => {
    const { POST } = await ruta();
    const res = await POST(req({ cliente_codigo: " d-112 ", destino: "Calle 19 Central", tiendas: ["5", "6"] }));
    expect(res.status).toBe(201);
    const alta = escrituras.find((e) => e.op === "insert");
    expect(alta!.datos).toMatchObject({ cliente_codigo: "D-112", tiendas: ["5", "6"] });
  });

  it("un D-XXX que no existe en el directorio → 400, sin escribir", async () => {
    const { POST } = await ruta();
    const res = await POST(req({ cliente_codigo: "D-9999", destino: "Albrook" }));
    expect(res.status).toBe(400);
    expect(escrituras).toHaveLength(0);
  });

  it("🔴 un código de Boston (111380) → 400, sin escribir — no es un cliente del grupo", async () => {
    const { POST } = await ruta();
    const res = await POST(req({ cliente_codigo: "111380", destino: "Albrook" }));
    expect(res.status).toBe(400);
    expect(escrituras).toHaveLength(0);
  });

  it("sin destino → 400 con texto para la pantalla", async () => {
    const { POST } = await ruta();
    const res = await POST(req({ cliente_codigo: "D-35", destino: "   " }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toContain("Escribe el destino");
  });

  it("duplicado (23505) → 409: única entre ACTIVAS", async () => {
    errorEscritura = { code: "23505", message: "duplicate key" };
    const { POST } = await ruta();
    const res = await POST(req({ cliente_codigo: "D-35", destino: "Calle 19" }));
    expect(res.status).toBe(409);
  });
});

// ─── 3 · editar y quitar ─────────────────────────────────────────────────────

describe("editar es UPDATE de una fila ACTIVA; quitar es SOFT DELETE firmado", () => {
  it("PATCH cambia el texto del destino (el pedido de Daniel: corregir sin desplegar)", async () => {
    const { PATCH } = await ruta();
    const res = await PATCH(req({ destino: "Calle 19 Central, al lado de la joyería Super Oro" }, "1"));
    expect(res.status).toBe(200);
    const ed = escrituras.find((e) => e.op === "update");
    expect(ed!.datos).toEqual({ destino: "Calle 19 Central, al lado de la joyería Super Oro" });
    expect(ed!.filtros).toMatchObject({ id: 1, activo: true });
  });

  it("PATCH sobre una fila que ya no está → 404", async () => {
    const { PATCH } = await ruta();
    const res = await PATCH(req({ destino: "X" }, "777"));
    expect(res.status).toBe(404);
  });

  it("🔴 DELETE escribe activo=false FIRMADO — la fila NUNCA se borra", async () => {
    const { DELETE } = await ruta();
    const res = await DELETE(req(undefined, "1"));
    expect(res.status).toBe(200);

    // Ni una operación `delete` salió a la base — solo el UPDATE del soft delete.
    expect(escrituras.filter((e) => e.op === "delete")).toHaveLength(0);
    const baja = escrituras.find((e) => e.op === "update");
    expect(baja).toBeTruthy();
    const datos = baja!.datos as Record<string, unknown>;
    expect(datos.activo).toBe(false);
    expect(datos.desactivado_por).toBe("admin");
    expect(typeof datos.desactivado_en).toBe("string");
    expect(baja!.filtros).toMatchObject({ id: 1, activo: true });
  });

  it("DELETE sin id → 400, sin escribir", async () => {
    const { DELETE } = await ruta();
    expect((await DELETE(req())).status).toBe(400);
    expect(escrituras).toHaveLength(0);
  });
});

// ─── 4 · la migración pendiente se DICE, no se disfraza ──────────────────────

describe("con la tabla ausente, la ruta lo dice (503) en vez de inventar un vacío", () => {
  it("GET → 503 con el nombre de la migración", async () => {
    errorLectura = { code: "42P01", message: 'relation "guias_destino_cliente" does not exist' };
    const { GET } = await ruta();
    const res = await GET(req());
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: string }).error).toContain("20260918120000");
  });
});

// ─── 5 · el barrido: NUNCA un .delete( en la capa de base ────────────────────

describe("🔴 barrido sin comentarios: la capa de base no tiene .delete(", () => {
  it("destinos-config-server.ts no contiene .delete( fuera de comentarios", () => {
    const crudo = readFileSync("src/lib/guias/destinos-config-server.ts", "utf8");
    // Los comentarios se borran PRIMERO: este repo ya pagó cuatro veces el
    // candado que se cumple con su propia explicación.
    const sinComentarios = crudo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    expect(sinComentarios).not.toContain(".delete(");
  });
});
