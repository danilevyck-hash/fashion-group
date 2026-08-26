/**
 * ─────────────────────────────────────────────────────────────────────────────
 * PATCH /api/guias/[id]/item — CORREGIR UN RENGLÓN SIN REEMPLAZAR LOS OTROS.
 *
 * 🔴 EL RIESGO QUE ESTE ARCHIVO VIGILA. `items` en el PUT de la guía es un
 * REEMPLAZO COMPLETO: borra todos los renglones e inserta otros nuevos, así que
 * **les cambia el id** y se lleva puesto el trabajo de atar clientes
 * (`guia_items.cliente_codigo`). Con bodega parada al lado del camión, corregir
 * un nombre mal escrito no puede costar la lista entera.
 *
 * Se LLAMA al handler real con la base doblada y se mira qué se escribió: un
 * barrido de texto vería el `.update(...)` en el archivo y se daría por
 * satisfecho aunque el resultado se tirara a la basura — ya pasó en este repo
 * (`/api/saldos-banco`, `/api/guias/frecuencias`).
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/require-auth", () => ({
  getSession: () => ({ role: "bodega", userName: "Bodega" }),
}));
vi.mock("@/lib/requireRole", () => ({
  requireRole: () => ({ role: "bodega", userName: "Bodega" }),
}));
vi.mock("@/lib/log-activity", () => ({ logActivity: async () => {} }));
vi.mock("@/lib/clientes/directorio-cache", () => ({
  leerClientesDelGrupo: async () => [
    { codigo: "D-25", nombre: "City Mall Paso Canoa" },
    { codigo: "D-24", nombre: "City Mall David" },
  ],
}));

const GUIA_ID = "11111111-1111-4111-8111-111111111111";
const ITEM_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

/** Lo que la guía y la línea traen hoy en la base. */
let guiaFila: Record<string, unknown>;
let itemFila: Record<string, unknown>;
/** Todo lo que se intentó ESCRIBIR, tabla por tabla. */
let escrituras: Array<{ tabla: string; op: string; datos: unknown; filtros: Record<string, unknown> }>;

function tablaDoble(tabla: string) {
  const filtros: Record<string, unknown> = {};
  const cadena = {
    select: () => cadena,
    eq: (col: string, val: unknown) => {
      filtros[col] = val;
      return cadena;
    },
    maybeSingle: async () => ({
      data: tabla === "guia_transporte" ? guiaFila : itemFila,
      error: null,
    }),
    update: (datos: unknown) => {
      escrituras.push({ tabla, op: "update", datos, filtros });
      return cadena;
    },
    insert: (datos: unknown) => {
      escrituras.push({ tabla, op: "insert", datos, filtros });
      return cadena;
    },
    delete: () => {
      escrituras.push({ tabla, op: "delete", datos: null, filtros });
      return cadena;
    },
  };
  return cadena;
}

vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: { from: (tabla: string) => tablaDoble(tabla) },
}));

beforeEach(() => {
  escrituras = [];
  guiaFila = { id: GUIA_ID, numero: 204, estado: "Pendiente Bodega", deleted: false };
  itemFila = {
    id: ITEM_ID,
    cliente: "CITY MAL",
    cliente_codigo: null,
    direccion: "Paso Canoas",
    empresa: "Fashion Wear",
    facturas: "F-1001",
    bultos: 4,
  };
});

async function pedir(body: Record<string, unknown>, id = GUIA_ID) {
  const { PATCH } = await import("@/app/api/guias/[id]/item/route");
  const req = { json: async () => body } as never;
  const res = await PATCH(req, { params: { id } });
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

describe("🔴 escribe UNA fila, y solo los campos que vinieron", () => {
  it("corregir los bultos escribe SOLO bultos", async () => {
    const r = await pedir({ itemId: ITEM_ID, bultos: 9 });
    expect(r.status).toBe(200);
    const upd = escrituras.filter((e) => e.op === "update");
    expect(upd).toHaveLength(1);
    expect(upd[0].tabla).toBe("guia_items");
    expect(upd[0].datos).toEqual({ bultos: 9 });
  });

  it("acota a la línea Y a la guía: sin eso, cualquier id serviría", async () => {
    await pedir({ itemId: ITEM_ID, direccion: "David" });
    const upd = escrituras.find((e) => e.op === "update")!;
    expect(upd.filtros.id).toBe(ITEM_ID);
    expect(upd.filtros.guia_id).toBe(GUIA_ID);
  });

  it("🔴 NUNCA borra ni inserta renglones — eso es lo que hace `items`", async () => {
    await pedir({ itemId: ITEM_ID, cliente: "CITY MALL PASO CANOA", cliente_codigo: "D-25" });
    expect(escrituras.some((e) => e.op === "delete")).toBe(false);
    expect(escrituras.some((e) => e.op === "insert")).toBe(false);
  });

  it("no toca `guia_transporte` más que para mirar si la guía existe", async () => {
    await pedir({ itemId: ITEM_ID, bultos: 1 });
    expect(escrituras.some((e) => e.tabla === "guia_transporte")).toBe(false);
  });

  it("un campo que no está en la lista se ignora — no se cuela por el body", async () => {
    // 🔑 LA LISTA NO SE COPIA ACÁ: se LEE de `campos-editables.ts`, la fuente
    // única. Este test se puso rojo el día que la lista creció con
    // `numero_guia_transp` porque tenía su propia copia escrita a mano — la
    // lección es no volver a tenerla, no arreglar la copia.
    const { CAMPOS_DE_RENGLON } = await import("@/lib/guias/campos-editables");
    const inventados = ["orden", "estado", "placa", "deleted", "guia_id", "receptor_nombre"];
    for (const c of inventados) {
      expect(CAMPOS_DE_RENGLON as readonly string[], c).not.toContain(c);
    }

    await pedir({
      itemId: ITEM_ID,
      bultos: 2,
      ...Object.fromEntries(inventados.map((c) => [c, "colado"])),
    });
    const upd = escrituras.find((e) => e.op === "update")!;
    expect(upd.datos).toEqual({ bultos: 2 });
  });

  it("⚠️ y lo que SÍ está en la lista se escribe — `numero_guia_transp` entró el 18-ago", async () => {
    // Es la otra mitad del test de arriba: si la lista se recortara, este campo
    // dejaría de escribirse en silencio y nadie se enteraría.
    const { CAMPOS_DE_RENGLON } = await import("@/lib/guias/campos-editables");
    expect(CAMPOS_DE_RENGLON as readonly string[]).toContain("numero_guia_transp");
    const r = await pedir({ itemId: ITEM_ID, numero_guia_transp: "TR-9" });
    expect(r.status).toBe(200);
    expect(escrituras.find((e) => e.op === "update")!.datos).toEqual({ numero_guia_transp: "TR-9" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 ESTE BLOQUE SE DIO VUELTA — QUÉ AFIRMABA ANTES, Y POR QUÉ CAMBIÓ.
//
// Hasta el 24-ago-2026 exigía que una guía `Completada` o `Rechazada` se
// rechazara ENTERA, con el mismo mensaje del PUT ("Guía ya despachada, no se
// puede editar"). Daniel aprobó punto por punto que una guía YA DESPACHADA se
// pueda corregir en TRES cosas y sólo tres: el **N° del transportista**, el
// **cliente** y las **facturas**. El papel que sale con la factura equivocada
// existe igual, y la única forma de arreglarlo era no tener el papel.
//
// Así que el filtro dejó de ser POR GUÍA y pasó a ser POR CAMPO
// (`camposEditablesDeRenglon`): lo permitido se escribe, lo prohibido contesta
// 400 y no toca una sola fila.
//
// 🔴 LO QUE SIGUE CERRADO, y es la mitad de esto:
//   · **`bultos` — es lo que el transportista FIRMÓ.** Daniel: *"los bultos de
//     una despachada NO se tocan"*. Es lo más importante de este archivo.
//   · `direccion` y `empresa`: describen un envío que ya se hizo.
//   · Un cuerpo MIXTO se rechaza ENTERO — media escritura sería peor que
//     ninguna: dejaría la guía diciendo una cosa y el papel firmado otra.
//   · Placa, receptor, cédula y **las dos firmas** no se tocan desde acá ni
//     desde ninguna parte, y **el candado del PUT de `/api/guias/[id]` sobre una
//     guía despachada quedó exactamente igual de duro** (lo vigila
//     `guias-numero-transp-tarde-route.test.ts`).
// ─────────────────────────────────────────────────────────────────────────────
describe.each(["Completada", "Rechazada"])(
  "🔴 en una guía %s se corrigen TRES campos, y sólo tres",
  (estado) => {
    beforeEach(() => {
      guiaFila = { ...guiaFila, estado };
    });

    it("las FACTURAS sí se escriben", async () => {
      const r = await pedir({ itemId: ITEM_ID, facturas: "F-2002" });
      expect(r.status).toBe(200);
      const upd = escrituras.filter((e) => e.op === "update");
      expect(upd).toHaveLength(1);
      expect(upd[0].tabla).toBe("guia_items");
      expect(upd[0].datos).toEqual({ facturas: "F-2002" });
      // Acotado a la línea Y a la guía: sin el segundo, el id de cualquier
      // renglón del sistema serviría para escribirle encima desde acá.
      expect(upd[0].filtros.id).toBe(ITEM_ID);
      expect(upd[0].filtros.guia_id).toBe(GUIA_ID);
    });

    it("el CLIENTE sí se escribe (nombre y código van juntos: son el mismo dato)", async () => {
      const r = await pedir({
        itemId: ITEM_ID,
        cliente: "City Mall Paso Canoa",
        cliente_codigo: "D-25",
      });
      expect(r.status).toBe(200);
      const upd = escrituras.filter((e) => e.op === "update");
      expect(upd).toHaveLength(1);
      expect(upd[0].datos).toEqual({ cliente: "City Mall Paso Canoa", cliente_codigo: "D-25" });
    });

    it("🔴 los BULTOS se rechazan y NO se escribe nada — es lo que el transportista firmó", async () => {
      const r = await pedir({ itemId: ITEM_ID, bultos: 9 });
      expect(r.status).toBe(400);
      expect(r.json.error).toBe(
        "Esta guía ya se despachó: de un envío solo se pueden corregir el cliente, las facturas y el N° del transportista.",
      );
      expect(r.json.campos).toEqual(["bultos"]);
      expect(escrituras.filter((e) => e.op === "update")).toHaveLength(0);
    });

    it("la DIRECCIÓN y la EMPRESA también se rechazan, y sin escribir", async () => {
      for (const campo of ["direccion", "empresa"] as const) {
        escrituras = [];
        const r = await pedir({ itemId: ITEM_ID, [campo]: "Fashion Wear" });
        expect(r.status, campo).toBe(400);
        expect(r.json.campos, campo).toEqual([campo]);
        expect(escrituras.filter((e) => e.op === "update"), campo).toHaveLength(0);
      }
    });

    it("🔴 un cuerpo MIXTO se rechaza ENTERO: la parte permitida tampoco se escribe", async () => {
      const r = await pedir({ itemId: ITEM_ID, facturas: "F-2002", bultos: 9 });
      expect(r.status).toBe(400);
      expect(r.json.campos).toEqual(["bultos"]);
      expect(escrituras.filter((e) => e.op === "update")).toHaveLength(0);
    });

    it("nunca borra ni inserta renglones — eso es lo que hace `items` en el PUT", async () => {
      await pedir({ itemId: ITEM_ID, facturas: "F-2002" });
      await pedir({ itemId: ITEM_ID, bultos: 9 });
      expect(escrituras.some((e) => e.op === "delete" || e.op === "insert")).toBe(false);
      expect(escrituras.some((e) => e.tabla === "guia_transporte")).toBe(false);
    });
  },
);

describe("⚠️ atar cliente sigue teniendo su propio camino", () => {
  it("va por SU endpoint, que no mira el estado", async () => {
    // Son dos cosas distintas y siguen separadas: el 98% de las guías está
    // cerrada, y atarles el cliente tiene que seguir siendo posible.
    const { readFileSync } = await import("node:fs");
    const atar = readFileSync("src/app/api/guias/[id]/cliente/route.ts", "utf8");
    expect(atar).toContain("cliente_codigo");
  });
});

describe("⚠️ lo que se valida antes de escribir", () => {
  it("una guía borrada o inexistente da 404", async () => {
    guiaFila = { ...guiaFila, deleted: true };
    const r = await pedir({ itemId: ITEM_ID, bultos: 1 });
    expect(r.json.error).toBe("Guía no encontrada");
  });

  it("una línea de OTRA guía da 404", async () => {
    itemFila = null as unknown as Record<string, unknown>;
    const r = await pedir({ itemId: ITEM_ID, bultos: 1 });
    expect(r.json.error).toBe("Esa línea no es de esta guía");
  });

  it("un id de línea que no es uuid se rechaza", async () => {
    const r = await pedir({ itemId: "1; drop", bultos: 1 });
    expect(r.json.error).toBe("Línea inválida");
  });

  it("bultos tiene que ser un entero de 0 en adelante", async () => {
    for (const malo of [-1, 1.5, "muchos", 99999]) {
      const r = await pedir({ itemId: ITEM_ID, bultos: malo });
      expect(r.json.error, String(malo)).toMatch(/número entero/);
    }
    expect(escrituras.filter((e) => e.op === "update")).toHaveLength(0);
  });

  it("la empresa se cierra a las del grupo (más la que la línea ya tenía)", async () => {
    const r = await pedir({ itemId: ITEM_ID, empresa: "Empresa Inventada" });
    expect(r.json.error).toMatch(/no es una de las del grupo/);
    // La que ya estaba guardada sí pasa: una guía vieja con texto sucio se
    // puede corregir en otro campo sin pelear.
    itemFila = { ...itemFila, empresa: "VISTANA / FASHION WEAR" };
    const ok = await pedir({ itemId: ITEM_ID, empresa: "VISTANA / FASHION WEAR", bultos: 3 });
    expect(ok.json.error).toBeUndefined();
  });

  it("🔴 el código del cliente pasa por la MISMA puerta que el selector", async () => {
    const malo = await pedir({ itemId: ITEM_ID, cliente_codigo: "D-999" });
    expect(malo.json.error).toBe("Ese cliente ya no está en el directorio");
    const boston = await pedir({ itemId: ITEM_ID, cliente_codigo: "111380" });
    expect(boston.json.error).toMatch(/no es de un cliente del grupo/);
    const bueno = await pedir({ itemId: ITEM_ID, cliente_codigo: "D-25" });
    expect(bueno.json.error).toBeUndefined();
  });

  it("desatar guarda NULL, nunca la cadena vacía", async () => {
    itemFila = { ...itemFila, cliente_codigo: "D-25" };
    await pedir({ itemId: ITEM_ID, cliente_codigo: "" });
    const upd = escrituras.find((e) => e.op === "update")!;
    expect(upd.datos).toEqual({ cliente_codigo: null });
  });

  it("un cuerpo sin ningún campo corregible no escribe nada", async () => {
    const r = await pedir({ itemId: ITEM_ID });
    expect(r.json.error).toBe("No hay nada que corregir");
    expect(escrituras.filter((e) => e.op === "update")).toHaveLength(0);
  });

  it("una corrección que no cambia nada no se escribe", async () => {
    const r = await pedir({ itemId: ITEM_ID, bultos: 4, direccion: "Paso Canoas" });
    expect(r.json.sinCambios).toBe(true);
    expect(escrituras.filter((e) => e.op === "update")).toHaveLength(0);
  });
});
