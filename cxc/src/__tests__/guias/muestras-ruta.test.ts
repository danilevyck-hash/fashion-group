// 🔴 Despachos › «Muestras» (24-nov-2026): el SERVIDOR decide quién hace qué,
// «Enviar todas», «No llegó», la espera automática del pedido, y que lo
// recibido o facturado se caiga solo de la lista. Base en memoria.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

type Fila = Record<string, unknown>;
const db: Record<string, Fila[]> = {};
const logs: unknown[][] = [];
let sesion = { role: "bodega", userId: "u1", userName: "julio" };
let proximoId = 1;

vi.mock("@/lib/log-activity", () => ({ logActivity: vi.fn(async (...a: unknown[]) => { logs.push(a); }) }));
vi.mock("@/lib/requireRole", async () => {
  const { NextResponse } = await import("next/server");
  return {
    requireRole: (_req: unknown, roles: string[]) =>
      roles.includes(sesion.role) || sesion.role === "admin" ? sesion : NextResponse.json({ error: "No" }, { status: 403 }),
  };
});
vi.mock("@/lib/supabase-server", () => {
  const consulta = (tabla: string) => {
    const filtros: Array<(f: Fila) => boolean> = [];
    let cambio: Fila | null = null;
    let nuevas: Fila[] | null = null;
    let soloCuenta = false;
    const tabl = () => (db[tabla] ??= []);
    const q: Record<string, unknown> = {
      select: (_c?: string, o?: { head?: boolean }) => { if (o?.head) soloCuenta = true; return q; },
      update: (f: Fila) => { cambio = f; return q; },
      insert: (f: Fila[]) => { nuevas = f; return q; },
      eq: (c: string, v: unknown) => { filtros.push((f) => f[c] === v); return q; },
      in: (c: string, v: unknown[]) => { filtros.push((f) => v.includes(f[c])); return q; },
      is: (c: string, v: unknown) => { filtros.push((f) => (f[c] ?? null) === v); return q; },
      not: (c: string) => { filtros.push((f) => f[c] != null); return q; },
      order: () => q,
      limit: () => q,
      maybeSingle: () => Promise.resolve({ data: tabl().find((f) => filtros.every((p) => p(f))) ?? null, error: null }),
      then: (ok: (r: unknown) => unknown) => {
        if (nuevas) {
          for (const n of nuevas) {
            const choca = tabl().some((f) => !f.deleted && f.empresa_key === n.empresa_key && f.pedido_switch_id === n.pedido_switch_id && f.codigo === n.codigo);
            if (choca) return Promise.resolve({ data: null, error: { code: "23505", message: "dup" } }).then(ok);
          }
          const creadas = nuevas.map((n) => ({ id: proximoId++, deleted: false, enviada_por: null, enviada_en: null, reclamada_por: null, reclamada_en: null, ...n }));
          tabl().push(...creadas);
          return Promise.resolve({ data: creadas, error: null }).then(ok);
        }
        const tocadas = tabl().filter((f) => filtros.every((p) => p(f)));
        if (cambio) tocadas.forEach((f) => Object.assign(f, cambio));
        if (soloCuenta) return Promise.resolve({ count: tocadas.length, error: null }).then(ok);
        return Promise.resolve({ data: tocadas.map((f) => ({ ...f })), error: null }).then(ok);
      },
    };
    return q;
  };
  return { supabaseServer: { from: consulta } };
});

import { GET, POST, PATCH } from "@/app/api/guias/muestras/route";

const req = (metodo: string, cuerpo?: unknown, qs = "") =>
  new NextRequest(`http://x/api/guias/muestras${qs}`, { method: metodo, ...(cuerpo ? { body: JSON.stringify(cuerpo), headers: { "content-type": "application/json" } } : {}) });
const como = (role: string, userName: string) => { sesion = { role, userId: userName, userName }; };
const muestras = () => db.pedidos_muestras ?? [];
const espera = (empresa: string, id: number) => db.pedidos_bodega_estado.find((f) => f.empresa_key === empresa && f.pedido_switch_id === id)?.espera_muestra_desde ?? null;

beforeEach(() => {
  for (const k of Object.keys(db)) delete db[k];
  logs.length = 0;
  proximoId = 1;
  db.switch_pedidos = [
    { empresa_key: "fashion_shoes", pedido_switch_id: 2228, secuencial: "16-000002228", cliente_nombre: "City Mall Paso Canoa" },
    { empresa_key: "vistana", pedido_switch_id: 2483, secuencial: "16-000002483", cliente_nombre: "Golden Mall" },
  ];
  db.pedidos_bodega_estado = [
    { empresa_key: "fashion_shoes", pedido_switch_id: 2228, estado: "en_preparacion", espera_muestra_desde: null },
    { empresa_key: "vistana", pedido_switch_id: 2483, estado: "preparado", espera_muestra_desde: null },
  ];
  db.pedidos_lineas = [
    { empresa_key: "fashion_shoes", pedido_switch_id: 2228, codigo: "TWLENILA140", descripcion: "Women-Sneakers" },
    { empresa_key: "fashion_shoes", pedido_switch_id: 2228, codigo: "FM0FM05393YBS", descripcion: "Men-Sneakers" },
    { empresa_key: "vistana", pedido_switch_id: 2483, codigo: "CK001", descripcion: "Boxer" },
  ];
  db.pedidos_muestras = [];
  como("bodega", "julio");
});

async function pedir(empresa: string, id: number, codigos: string[]) {
  return POST(req("POST", { empresa_key: empresa, pedido_switch_id: id, codigos }));
}

describe("bodega pide las muestras", () => {
  it("pide 2 referencias con un botón, y el pedido En preparación queda En espera sola", async () => {
    const r = await pedir("fashion_shoes", 2228, ["TWLENILA140", "FM0FM05393YBS", "NO-EXISTE"]);
    expect(r.status).toBe(200);
    expect(muestras().map((m) => [m.codigo, m.estado, m.pedida_por])).toEqual([
      ["TWLENILA140", "falta", "julio"],
      ["FM0FM05393YBS", "falta", "julio"],
    ]);
    expect(espera("fashion_shoes", 2228)).not.toBeNull();
    expect(logs.some((l) => l[1] === "pedir_muestras")).toBe(true);
  });
  it("pedir la misma otra vez no duplica (409)", async () => {
    await pedir("fashion_shoes", 2228, ["TWLENILA140"]);
    expect((await pedir("fashion_shoes", 2228, ["TWLENILA140"])).status).toBe(409);
    expect(muestras()).toHaveLength(1);
  });
  it("en Preparado las marcas valen, pero la espera del pedido no se toca (CHECK)", async () => {
    expect((await pedir("vistana", 2483, ["CK001"])).status).toBe(200);
    expect(espera("vistana", 2483)).toBeNull();
  });
  it("el vendedor y la secretaria no piden; Jorman solo Vistana (404 en otra empresa)", async () => {
    como("vendedor", "rey");
    expect((await pedir("fashion_shoes", 2228, ["TWLENILA140"])).status).toBe(403);
    como("secretaria", "angela");
    expect((await pedir("fashion_shoes", 2228, ["TWLENILA140"])).status).toBe(403);
    como("bodega", "jorman");
    expect((await pedir("fashion_shoes", 2228, ["TWLENILA140"])).status).toBe(404);
    expect((await pedir("vistana", 2483, ["CK001"])).status).toBe(200);
  });
  it("un pedido recibido no lleva muestras", async () => {
    db.pedidos_bodega_estado[0].estado = "recibido";
    expect((await pedir("fashion_shoes", 2228, ["TWLENILA140"])).status).toBe(403);
  });
});

describe("el vendedor las manda", () => {
  beforeEach(async () => {
    await pedir("fashion_shoes", 2228, ["TWLENILA140", "FM0FM05393YBS"]);
    await pedir("vistana", 2483, ["CK001"]);
    logs.length = 0;
  });
  const listaDe = async () => (await (await GET(req("GET"))).json()) as { pedidos: Array<{ secuencial: string; muestras: Array<{ id: number; codigo: string }> }>; total: number };

  it("cada vendedor ve solo lo suyo; bodega no tiene lista", async () => {
    como("vendedor", "rey");
    expect((await listaDe()).total).toBe(2);
    como("vendedor", "edwin");
    const e = await listaDe();
    expect(e.total).toBe(1);
    expect(e.pedidos[0].secuencial).toBe("16-000002483");
    como("admin", "daniel");
    expect((await listaDe()).total).toBe(3);
    como("bodega", "julio");
    expect((await GET(req("GET"))).status).toBe(403);
    como("vendedor", "reinaldo");
    expect((await GET(req("GET"))).status).toBe(403);
  });

  it("«Enviada» solo la marca el vendedor asignado (o admin)", async () => {
    const ck = muestras().find((m) => m.codigo === "CK001")!.id;
    como("vendedor", "rey");
    expect((await PATCH(req("PATCH", { accion: "enviada", ids: [ck] }))).status).toBe(403);
    como("bodega", "julio");
    expect((await PATCH(req("PATCH", { accion: "enviada", ids: [ck] }))).status).toBe(403);
    como("vendedor", "edwin");
    expect((await PATCH(req("PATCH", { accion: "enviada", ids: [ck] }))).status).toBe(200);
    expect(muestras().find((m) => m.id === ck)).toMatchObject({ estado: "enviada", enviada_por: "edwin" });
  });

  it("«Enviar todas» las del pedido: salen de la lista y la espera se apaga sola", async () => {
    como("vendedor", "rey");
    const ids = (await listaDe()).pedidos[0].muestras.map((m) => m.id);
    expect(espera("fashion_shoes", 2228)).not.toBeNull();
    expect((await PATCH(req("PATCH", { accion: "enviada", ids }))).status).toBe(200);
    expect((await listaDe()).total).toBe(0);
    expect(espera("fashion_shoes", 2228)).toBeNull();
    expect(logs.some((l) => l[1] === "muestra_enviada")).toBe(true);
  });

  it("todo o nada: si una no es suya, no se marca ninguna", async () => {
    como("admin", "daniel");
    const todas = muestras().map((m) => m.id as number);
    como("vendedor", "rey");
    expect((await PATCH(req("PATCH", { accion: "enviada", ids: todas }))).status).toBe(403);
    expect(muestras().every((m) => m.estado === "falta")).toBe(true);
  });

  it("«No llegó» la devuelve a la lista del vendedor y vuelve a prender la espera", async () => {
    como("vendedor", "rey");
    const tw = muestras().find((m) => m.codigo === "TWLENILA140")!.id as number;
    const fm = muestras().find((m) => m.codigo === "FM0FM05393YBS")!.id as number;
    await PATCH(req("PATCH", { accion: "enviada", ids: [tw, fm] }));
    expect(espera("fashion_shoes", 2228)).toBeNull();
    // el vendedor no reclama
    expect((await PATCH(req("PATCH", { accion: "no_llego", ids: [tw] }))).status).toBe(403);
    como("bodega", "julio");
    expect((await PATCH(req("PATCH", { accion: "no_llego", ids: [tw] }))).status).toBe(200);
    expect(muestras().find((m) => m.id === tw)).toMatchObject({ estado: "no_llego", reclamada_por: "julio" });
    expect(espera("fashion_shoes", 2228)).not.toBeNull();
    como("vendedor", "rey");
    const l = await listaDe();
    expect(l.total).toBe(1);
    expect(l.pedidos[0].muestras[0].codigo).toBe("TWLENILA140");
  });

  it("una enviada no se quita; una que falta, sí (borrado firmado)", async () => {
    const tw = muestras().find((m) => m.codigo === "TWLENILA140")!.id as number;
    expect((await PATCH(req("PATCH", { accion: "quitar", ids: [tw] }))).status).toBe(200);
    expect(muestras().find((m) => m.id === tw)).toMatchObject({ deleted: true, deleted_por: "julio" });
  });

  it("si el pedido se recibe (o se factura y Switch lo saca), sus muestras desaparecen de la lista", async () => {
    como("vendedor", "rey");
    expect((await listaDe()).total).toBe(2);
    db.pedidos_bodega_estado[0].estado = "recibido";
    expect((await listaDe()).total).toBe(0);
    db.pedidos_bodega_estado[0].estado = "en_preparacion";
    db.switch_pedidos = db.switch_pedidos.filter((p) => p.pedido_switch_id !== 2228);
    expect((await listaDe()).total).toBe(0);
  });
});
