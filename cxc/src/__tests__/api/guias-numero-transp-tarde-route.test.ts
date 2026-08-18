/**
 * ─────────────────────────────────────────────────────────────────────────────
 * PATCH /api/guias/[id]/numero-transp — LA ÚNICA EXCEPCIÓN DE UNA GUÍA CERRADA.
 *
 * El N° del transportista dejó de bloquear el despacho (Daniel: *"a veces el
 * transportista lo da, a veces no"*), así que hay guías que salen sin él y
 * quedan marcadas. Completarlo después es para lo que sirve la marca. Daniel:
 * ***"hazle la excepción para ese número"***.
 *
 * 🔑 Es una COPIA del molde de `…/cliente`: UNA columna de UNA línea, sin mirar
 * el estado. Lo que este archivo vigila es que la excepción siga siendo UNA:
 * que por esta puerta no se cuele nada más, y que el candado del PUT sobre una
 * guía despachada quede exactamente igual de duro.
 *
 * Se LLAMA al handler y se mira QUÉ SE ESCRIBIÓ: un barrido de texto vería el
 * `.update(...)` y se daría por satisfecho aunque escribiera de más.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/require-auth", () => ({
  getSession: () => ({ role: "bodega", userName: "Bodega" }),
}));
vi.mock("@/lib/requireRole", () => ({
  requireRole: () => ({ role: "bodega", userName: "Bodega" }),
}));

const logueado: unknown[] = [];
vi.mock("@/lib/log-activity", () => ({
  logActivity: async (...args: unknown[]) => { logueado.push(args); },
}));

const GUIA_ID = "11111111-1111-4111-8111-111111111111";
const ITEM_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

let guiaFila: Record<string, unknown> | null;
let itemFila: Record<string, unknown> | null;
let escrituras: Array<{ tabla: string; op: string; datos: unknown; filtros: Record<string, unknown> }>;

function tablaDoble(tabla: string) {
  const filtros: Record<string, unknown> = {};
  const cadena = {
    select: () => cadena,
    eq: (col: string, val: unknown) => { filtros[col] = val; return cadena; },
    maybeSingle: async () => ({ data: tabla === "guia_transporte" ? guiaFila : itemFila, error: null }),
    update: (datos: unknown) => { escrituras.push({ tabla, op: "update", datos, filtros }); return cadena; },
    insert: (datos: unknown) => { escrituras.push({ tabla, op: "insert", datos, filtros }); return cadena; },
    delete: () => { escrituras.push({ tabla, op: "delete", datos: null, filtros }); return cadena; },
  };
  return cadena;
}

vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: { from: (tabla: string) => tablaDoble(tabla) },
}));

beforeEach(() => {
  escrituras = [];
  logueado.length = 0;
  // 🔴 La guía está DESPACHADA. Ése es el caso que este endpoint existe para
  // resolver, no una excepción rara.
  guiaFila = { id: GUIA_ID, numero: 204, estado: "Completada", deleted: false };
  itemFila = { id: ITEM_ID, cliente: "CITY MALL PASO CANOA", numero_guia_transp: "" };
});

async function pedir(body: Record<string, unknown>, id = GUIA_ID) {
  const { PATCH } = await import("@/app/api/guias/[id]/numero-transp/route");
  const req = { json: async () => body } as never;
  const res = await PATCH(req, { params: { id } });
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

describe("🔴 en una guía YA DESPACHADA se puede anotar el N° — y SOLO eso", () => {
  it("lo escribe aunque la guía esté Completada", async () => {
    const r = await pedir({ itemId: ITEM_ID, numero_guia_transp: "TR-4471" });
    expect(r.json.error).toBeUndefined();
    const upd = escrituras.filter((e) => e.op === "update");
    expect(upd).toHaveLength(1);
    expect(upd[0].tabla).toBe("guia_items");
    expect(upd[0].datos).toEqual({ numero_guia_transp: "TR-4471" });
  });

  it("una Rechazada también: el estado NO es una condición acá", async () => {
    guiaFila = { ...guiaFila!, estado: "Rechazada" };
    const r = await pedir({ itemId: ITEM_ID, numero_guia_transp: "TR-1" });
    expect(r.json.error).toBeUndefined();
  });

  it("🔴 escribe UNA sola columna: nada más de la línea se toca", async () => {
    await pedir({
      itemId: ITEM_ID,
      numero_guia_transp: "TR-9",
      // Todo esto tiene que ser ignorado: es lo que el candado protege.
      bultos: 99, cliente: "OTRO", cliente_codigo: "D-25", direccion: "x",
      empresa: "Fashion Wear", facturas: "F-9", deleted: true, orden: 5,
    });
    const upd = escrituras.find((e) => e.op === "update")!;
    expect(Object.keys(upd.datos as object)).toEqual(["numero_guia_transp"]);
  });

  it("no toca `guia_transporte`, ni para escribir el N° de la cabecera", async () => {
    await pedir({ itemId: ITEM_ID, numero_guia_transp: "TR-9" });
    expect(escrituras.some((e) => e.tabla === "guia_transporte")).toBe(false);
  });

  it("no borra ni inserta renglones", async () => {
    await pedir({ itemId: ITEM_ID, numero_guia_transp: "TR-9" });
    expect(escrituras.some((e) => e.op === "delete" || e.op === "insert")).toBe(false);
  });

  it("🔴 no puede escribir en OTRA guía aunque le pasen un id de renglón ajeno", async () => {
    await pedir({ itemId: ITEM_ID, numero_guia_transp: "TR-9" });
    const upd = escrituras.find((e) => e.op === "update")!;
    expect(upd.filtros.id).toBe(ITEM_ID);
    expect(upd.filtros.guia_id).toBe(GUIA_ID);
    // Y si la línea no es de esta guía, ni se intenta.
    escrituras = [];
    itemFila = null;
    const r = await pedir({ itemId: ITEM_ID, numero_guia_transp: "TR-9" });
    expect(r.json.error).toBe("Esa línea no es de esta guía");
    expect(escrituras.filter((e) => e.op === "update")).toHaveLength(0);
  });

  it("⚠️ queda QUIÉN y CUÁNDO: se anota en el registro de actividad", async () => {
    await pedir({ itemId: ITEM_ID, numero_guia_transp: "TR-4471" });
    expect(logueado).toHaveLength(1);
    const [rol, accion, modulo, detalle, usuario] = logueado[0] as [string, string, string, Record<string, unknown>, string];
    expect(rol).toBe("bodega");
    expect(accion).toBe("guia_item_numero_transp");
    expect(modulo).toBe("guias");
    expect(usuario).toBe("Bodega");
    expect(detalle.de).toBe("");
    expect(detalle.a).toBe("TR-4471");
    expect(detalle.guiaId).toBe(GUIA_ID);
  });
});

describe("⚠️ lo que NO se puede guardar", () => {
  it("🔴 un '0' pelado: el papel y la marca lo tratan como vacío", async () => {
    const r = await pedir({ itemId: ITEM_ID, numero_guia_transp: "0" });
    expect(r.json.error).toMatch(/Un 0 no es un N° de guía/);
    expect(escrituras.filter((e) => e.op === "update")).toHaveLength(0);
  });

  it("…pero nada que CONTENGA un cero se pierde", async () => {
    for (const bueno of ["EK0700", "TR-0", "00"]) {
      escrituras = [];
      itemFila = { ...itemFila!, numero_guia_transp: "" };
      const r = await pedir({ itemId: ITEM_ID, numero_guia_transp: bueno });
      expect(r.json.error, bueno).toBeUndefined();
      expect((escrituras.find((e) => e.op === "update")!.datos as Record<string, string>).numero_guia_transp).toBe(bueno);
    }
  });

  it("un id de línea que no es uuid se rechaza", async () => {
    const r = await pedir({ itemId: "1; drop", numero_guia_transp: "TR-1" });
    expect(r.json.error).toBe("Línea inválida");
  });

  it("una guía borrada da 404", async () => {
    guiaFila = { ...guiaFila!, deleted: true };
    const r = await pedir({ itemId: ITEM_ID, numero_guia_transp: "TR-1" });
    expect(r.json.error).toBe("Guía no encontrada");
  });

  it("se puede BORRAR lo anotado (alguien pudo escribir el número equivocado)", async () => {
    itemFila = { ...itemFila!, numero_guia_transp: "TR-MAL" };
    const r = await pedir({ itemId: ITEM_ID, numero_guia_transp: "" });
    expect(r.json.error).toBeUndefined();
    expect((escrituras.find((e) => e.op === "update")!.datos as Record<string, string>).numero_guia_transp).toBe("");
  });

  it("guardar el mismo número no escribe nada", async () => {
    itemFila = { ...itemFila!, numero_guia_transp: "TR-1" };
    const r = await pedir({ itemId: ITEM_ID, numero_guia_transp: " TR-1 " });
    expect(r.json.sinCambios).toBe(true);
    expect(escrituras.filter((e) => e.op === "update")).toHaveLength(0);
  });
});

describe("🔴 el candado de la guía despachada NO se aflojó por esta puerta", () => {
  const leer = (p: string) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("node:fs").readFileSync(p, "utf8") as string;
  };

  it("el PUT y el PATCH de la guía siguen rechazando editar una despachada", () => {
    const guia = leer("src/app/api/guias/[id]/route.ts");
    expect((guia.match(/Guía ya despachada, no se puede editar/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it("la corrección de bodega SÍ mira el estado (es lo contrario de este endpoint)", () => {
    const item = leer("src/app/api/guias/[id]/item/route.ts");
    expect(item).toContain('guia.estado === "Completada"');
    expect(item).toContain("Guía ya despachada, no se puede editar");
  });

  it("este endpoint solo nombra la columna del N° — ninguna otra", () => {
    const codigo = leer("src/app/api/guias/[id]/numero-transp/route.ts")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    const updates = codigo.match(/\.update\(\s*\{[^}]*\}/g) ?? [];
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatch(/numero_guia_transp/);
    for (const prohibido of ["bultos", "facturas", "direccion", "empresa", "placa", "firma", "estado"]) {
      expect(updates[0], prohibido).not.toMatch(new RegExp(prohibido));
    }
    // Y no escribe en la cabecera de la guía.
    expect(codigo).not.toMatch(/from\("guia_transporte"\)\s*\n?\s*\.update/);
  });

  it("es de escritura: vendedor no entra", () => {
    const codigo = leer("src/app/api/guias/[id]/numero-transp/route.ts");
    expect(codigo).toMatch(/requireRole/);
    expect(codigo).toMatch(/\["admin", "secretaria", "bodega"\]/);
  });
});
