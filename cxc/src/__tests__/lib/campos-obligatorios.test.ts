// ─────────────────────────────────────────────────────────────────────────────
// Candado de las columnas NOT NULL sin default en las rutas con body de usuario.
//
// EL BUG QUE ESTO IMPIDE VOLVER A TENER es el de `cheques.banco`: el body no
// trae la columna → `undefined` → `JSON.stringify` la borra → PostgREST manda
// el INSERT sin ella → Postgres 23502 → la app contesta "Error interno". Tres
// meses y medio sin poder guardar un cheque, en silencio.
//
// Cada bloque prueba las TRES cosas que importan, por ruta:
//   1. sin el campo obligatorio → 400 que DICE qué falta (no 500 mudo);
//   2. el caso feliz sigue guardando;
//   3. si la base rechazara igual, la respuesta es reportable y no filtra
//      nombres de tabla/columna al navegador.
//
// El doble de Supabase RECHAZA como la base de verdad. Si fuera complaciente,
// ninguno de estos tests probaría nada — por eso hay un test de mutación que
// exige que el doble sí devuelva 23502.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";

const mockFrom = vi.fn();
const mockRpc = vi.fn();
vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: {
    from: (...a: unknown[]) => mockFrom(...a),
    rpc: (...a: unknown[]) => mockRpc(...a),
  },
}));

const mockEnviarSistema = vi.fn(async () => true);
vi.mock("@/lib/alertas/canal", () => ({
  enviarSistema: (...a: unknown[]) => mockEnviarSistema(...a),
  enviarNegocio: async () => true,
}));

vi.mock("@/lib/log-activity", () => ({ logActivity: async () => {} }));

import { NextRequest } from "next/server";
import { signSession } from "@/lib/session-cookie";
import {
  CAMPOS_OBLIGATORIOS,
  faltan,
  textoObligatorio,
  _resetAvisos,
} from "@/lib/campos-obligatorios";
import { POST as postResponsable } from "@/app/api/caja/responsables/route";
import { POST as postVendor } from "@/app/api/vendors/route";
import { POST as postContacto, PATCH as patchContacto } from "@/app/api/reclamos/contactos/route";
import { POST as postPackingList } from "@/app/api/packing-lists/route";
import { POST as postGuia } from "@/app/api/guias/route";
import { POST as postOverride } from "@/app/api/overrides/route";

process.env.SESSION_SECRET ||= "test-secret-para-firmar-sesiones";

function req(url: string, body: unknown, method = "POST"): NextRequest {
  const cookie = signSession({ role: "admin", userId: "u1", userName: "test", sessionToken: "t1" });
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers: { cookie: `cxc_session=${cookie}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/**
 * Doble de una tabla que se comporta como Postgres: 23502 si a la fila le falta
 * (o le llega en null) una columna NOT NULL sin default, y PGRST204 si le llega
 * una columna que la tabla no tiene.
 *
 * `JSON.parse(JSON.stringify(...))` reproduce el paso exacto donde `undefined`
 * desaparece sin avisar — para la base "la mandé undefined" y "no la mandé"
 * son el MISMO caso.
 */
function tablaComoPostgres(tabla: keyof typeof CAMPOS_OBLIGATORIOS, columnasReales?: string[]) {
  const recibido: Record<string, unknown>[] = [];
  const obligatorias = CAMPOS_OBLIGATORIOS[tabla].map((c) => c.columna) as string[];

  const evaluar = (fila: Record<string, unknown>, esUpdate = false) => {
    const comoLaVeLaBase = JSON.parse(JSON.stringify(fila)) as Record<string, unknown>;
    recibido.push(comoLaVeLaBase);
    if (columnasReales) {
      const ajena = Object.keys(comoLaVeLaBase).find((c) => !columnasReales.includes(c));
      if (ajena) {
        return {
          data: null,
          error: { code: "PGRST204", message: `Could not find the '${ajena}' column of '${tabla}' in the schema cache` },
        };
      }
    }
    // En un UPDATE, una columna AUSENTE es legal (la fila conserva su valor);
    // lo que revienta es mandarla en null. En un INSERT, ausente y null son lo
    // mismo. El doble copia esa diferencia — si no, exigiría más que Postgres.
    const falta = obligatorias.find((c) =>
      esUpdate ? c in comoLaVeLaBase && comoLaVeLaBase[c] === null : !(c in comoLaVeLaBase) || comoLaVeLaBase[c] === null,
    );
    if (falta) {
      return {
        data: null,
        error: { code: "23502", message: `null value in column "${falta}" of relation "${tabla}" violates not-null constraint` },
      };
    }
    return { data: { id: "nuevo", ...comoLaVeLaBase }, error: null };
  };

  const conSelect = (fila: Record<string, unknown>) => {
    const r = evaluar(fila);
    // Chainable como el cliente real (`.select().single()`) y a la vez
    // awaitable directo, que es como lo usa el upsert de /api/vendors.
    return { select: () => ({ single: async () => r }), then: (f: (v: unknown) => unknown) => Promise.resolve(r).then(f) };
  };

  mockFrom.mockReturnValue({
    insert: conSelect,
    upsert: conSelect,
    update: (fila: Record<string, unknown>) => {
      const r = evaluar(fila, true);
      return { eq: () => ({ select: () => ({ single: async () => r }) }) };
    },
  });
  return recibido;
}

async function cuerpo(res: Response): Promise<{ error?: string }> {
  return (await res.json()) as { error?: string };
}

beforeEach(() => {
  vi.clearAllMocks();
  _resetAvisos();
});

// ── 1. caja_responsables.nombre ──────────────────────────────────────────────

describe("POST /api/caja/responsables — nombre es NOT NULL sin default", () => {
  it("sin nombre → 400 que DICE qué falta (antes: 500 'Error interno')", async () => {
    tablaComoPostgres("caja_responsables");
    const res = await postResponsable(req("/api/caja/responsables", {}));
    expect(res.status).toBe(400);
    expect((await cuerpo(res)).error).toContain("nombre del responsable");
  });

  it("nombre en blanco tampoco pasa — '' guardado es una fila fantasma", async () => {
    tablaComoPostgres("caja_responsables");
    const res = await postResponsable(req("/api/caja/responsables", { nombre: "   " }));
    expect(res.status).toBe(400);
  });

  it("caso feliz: se guarda y la base recibe la columna", async () => {
    const recibido = tablaComoPostgres("caja_responsables");
    const res = await postResponsable(req("/api/caja/responsables", { nombre: "  Angela  " }));
    expect(res.status).toBe(200);
    expect(recibido[0].nombre).toBe("Angela");
  });
});

// ── 2. directorio_clientes.nombre ────────────────────────────────────────────
// Retirado el 5-sep-2026: la libreta vieja ya no tiene ruta de escritura
// (`/api/directorio` se fue con ella). Ver `directorio-viejo-retirado.test.ts`.

// ── 3. vendor_assignments — sus TRES campos ──────────────────────────────────

describe("POST /api/vendors — las tres columnas son NOT NULL sin default", () => {
  it.each(
    CAMPOS_OBLIGATORIOS.vendor_assignments.map((c) => [c.columna, c.etiqueta] as const),
  )("sin %s → 400 que nombra el campo", async (columna, etiqueta) => {
    tablaComoPostgres("vendor_assignments");
    const completo: Record<string, string> = {
      company_key: "vistana",
      client_name: "Xtreme Shoes",
      vendor_name: "Edwin",
    };
    delete completo[columna];
    const res = await postVendor(req("/api/vendors", completo));
    expect(res.status).toBe(400);
    expect((await cuerpo(res)).error).toContain(etiqueta);
  });

  it("body vacío → un solo 400 que enumera los tres", async () => {
    tablaComoPostgres("vendor_assignments");
    const res = await postVendor(req("/api/vendors", {}));
    expect(res.status).toBe(400);
    const msg = (await cuerpo(res)).error ?? "";
    expect(msg).toContain("la empresa");
    expect(msg).toContain("cliente");
    expect(msg).toContain("vendedor");
  });

  it("caso feliz: el upsert llega completo", async () => {
    const recibido = tablaComoPostgres("vendor_assignments");
    const res = await postVendor(
      req("/api/vendors", { company_key: "vistana", client_name: "Xtreme Shoes", vendor_name: "Edwin" }),
    );
    expect(res.status).toBe(200);
    expect(recibido[0]).toMatchObject({ company_key: "vistana", client_name: "Xtreme Shoes", vendor_name: "Edwin" });
  });
});

// ── 4. reclamo_contactos — DOS defectos distintos en el mismo lugar ──────────

/** Las columnas que la tabla REALMENTE tiene en producción (medido 27-jul-2026). */
const COLUMNAS_REALES_RECLAMO_CONTACTOS = [
  "id", "empresa", "nombre_contacto", "whatsapp", "correo", "activo", "created_at",
];

describe("POST /api/reclamos/contactos — defecto A: nombre_contacto no se validaba", () => {
  it("con empresa pero sin nombre_contacto → 400 (antes: 500 'Error al crear contacto')", async () => {
    tablaComoPostgres("reclamo_contactos", COLUMNAS_REALES_RECLAMO_CONTACTOS);
    const res = await postContacto(req("/api/reclamos/contactos", { empresa: "vistana" }));
    expect(res.status).toBe(400);
    expect((await cuerpo(res)).error).toContain("nombre del contacto");
  });

  it("caso feliz", async () => {
    const recibido = tablaComoPostgres("reclamo_contactos", COLUMNAS_REALES_RECLAMO_CONTACTOS);
    const res = await postContacto(
      req("/api/reclamos/contactos", { empresa: "vistana", nombre_contacto: "Ana", correo: "a@b.com" }),
    );
    expect(res.status).toBe(200);
    expect(recibido[0]).toMatchObject({ empresa: "vistana", nombre_contacto: "Ana" });
  });
});

describe("POST /api/reclamos/contactos — defecto B: la allow-list tenía una columna muerta", () => {
  it("mandar `nombre` ya NO llega a la base (esa columna no existe → era PGRST204)", async () => {
    const recibido = tablaComoPostgres("reclamo_contactos", COLUMNAS_REALES_RECLAMO_CONTACTOS);
    const res = await postContacto(
      req("/api/reclamos/contactos", { empresa: "vistana", nombre_contacto: "Ana", nombre: "Ana" }),
    );
    expect(res.status).toBe(200);
    expect(recibido[0]).not.toHaveProperty("nombre");
  });

  it("la ruta ya no menciona la columna muerta en su allow-list", () => {
    const fuente = fs.readFileSync(
      path.join(process.cwd(), "src/app/api/reclamos/contactos/route.ts"),
      "utf8",
    );
    const allowList = fuente.match(/const ALLOWED_FIELDS = \[[^\]]*\]/)?.[0] ?? "";
    expect(allowList).not.toContain('"nombre"');
    expect(allowList).toContain('"nombre_contacto"');
  });

  it("el doble NO miente: una columna ajena sí produce PGRST204", async () => {
    // Mutación deliberada. Sin este test, el caso de arriba pasaría aunque la
    // allow-list siguiera rota.
    tablaComoPostgres("reclamo_contactos", COLUMNAS_REALES_RECLAMO_CONTACTOS);
    const tabla = mockFrom();
    const insertReal = tabla.insert;
    mockFrom.mockReturnValue({ insert: (f: Record<string, unknown>) => insertReal({ ...f, nombre: "Ana" }) });
    const res = await postContacto(
      req("/api/reclamos/contactos", { empresa: "vistana", nombre_contacto: "Ana" }),
    );
    expect(res.status).toBe(500);
    expect((await cuerpo(res)).error).toContain("CAMPO-DESCONOCIDO");
  });
});

describe("PATCH /api/reclamos/contactos — parcial sí, vaciar un obligatorio no", () => {
  it("un PATCH que no toca los obligatorios pasa", async () => {
    tablaComoPostgres("reclamo_contactos", COLUMNAS_REALES_RECLAMO_CONTACTOS);
    const res = await patchContacto(
      req("/api/reclamos/contactos", { id: "abc", correo: "nuevo@b.com" }, "PATCH"),
    );
    expect(res.status).toBe(200);
  });

  it("un PATCH que manda nombre_contacto vacío → 400, no borra el nombre", async () => {
    tablaComoPostgres("reclamo_contactos", COLUMNAS_REALES_RECLAMO_CONTACTOS);
    const res = await patchContacto(
      req("/api/reclamos/contactos", { id: "abc", nombre_contacto: "" }, "PATCH"),
    );
    expect(res.status).toBe(400);
  });
});

// ── 5. pl_items.estilo / .producto ───────────────────────────────────────────

function itemPL(over: Record<string, unknown> = {}) {
  return { estilo: "40EM124110", producto: "CAMISA", totalPcs: 12, distribution: {}, bultoMuestra: "1", isOS: false, ...over };
}

describe("POST /api/packing-lists — un item sin estilo ya no tumba el PL entero", () => {
  it("modo simple: item sin estilo → 400 que dice QUÉ FILA (antes: 500 y el PL perdido)", async () => {
    mockRpc.mockResolvedValue({ data: "pl-1", error: null });
    const res = await postPackingList(
      req("/api/packing-lists", {
        numeroPL: "PL-001",
        items: [itemPL(), itemPL({ estilo: undefined }), itemPL()],
      }),
    );
    expect(res.status).toBe(400);
    expect((await cuerpo(res)).error).toContain("fila 2");
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("modo lote: el PL malo se reporta y los BUENOS se guardan igual", async () => {
    mockRpc.mockResolvedValue({ data: "pl-ok", error: null });
    mockFrom.mockReturnValue({
      select: () => ({ eq: () => ({ single: async () => ({ data: { total_bultos: 1, total_piezas: 12, total_estilos: 1 } }) }) }),
    });
    const res = await postPackingList(
      req("/api/packing-lists", {
        packingLists: [
          { numeroPL: "PL-BUENO", indexRows: [itemPL()] },
          { numeroPL: "PL-MALO", indexRows: [itemPL({ estilo: "  " })] },
        ],
      }),
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { totalSaved: number; totalFailed: number; results: { numeroPL: string; error?: string }[] };
    expect(data.totalSaved).toBe(1);
    expect(data.totalFailed).toBe(1);
    expect(data.results.find((r) => r.numeroPL === "PL-MALO")?.error).toContain("fila 1");
  });

  it("producto vacío SÍ se guarda — el parser lo produce a propósito", async () => {
    // `parse-packing-list.ts` hace `currentProducto = producto ? … : ""`.
    // Rechazarlo sería inventar un error que el parser ya decidió que no lo es.
    mockRpc.mockResolvedValue({ data: "pl-1", error: null });
    const res = await postPackingList(
      req("/api/packing-lists", { numeroPL: "PL-002", items: [itemPL({ producto: "" })] }),
    );
    expect(res.status).toBe(200);
  });

  it("producto AUSENTE se normaliza a '' — funciona con o sin la migración", async () => {
    mockRpc.mockResolvedValue({ data: "pl-1", error: null });
    const res = await postPackingList(
      req("/api/packing-lists", { numeroPL: "PL-003", items: [itemPL({ producto: undefined })] }),
    );
    expect(res.status).toBe(200);
    const payload = mockRpc.mock.calls[0][1] as { pl_items_payload: { producto: unknown }[] };
    expect(payload.pl_items_payload[0].producto).toBe("");
    // Y sobrevive al viaje por JSON, que es donde `undefined` desaparece.
    const serializado = JSON.parse(JSON.stringify(payload.pl_items_payload[0])) as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(serializado, "producto")).toBe(true);
  });
});

// ── 6. Los que aparecieron en el barrido, más allá de los 5 reportados ───────

describe("POST /api/guias — fecha es NOT NULL sin default y solo la validaba el navegador", () => {
  const GUIA_OK = {
    fecha: "2026-07-27",
    modo_entrega: "entrega_directa",
    items: [{ cliente: "Xtreme", empresa: "vistana", bultos: 2, facturas: "F1" }],
  };

  it("sin fecha → 400 (antes: 23502 con el mensaje de Postgres en pantalla)", async () => {
    tablaComoPostgres("guia_transporte");
    const { fecha: _sin, ...sinFecha } = GUIA_OK;
    const res = await postGuia(req("/api/guias", sinFecha));
    expect(res.status).toBe(400);
    expect((await cuerpo(res)).error).toContain("fecha");
  });

  it("el 400 llega ANTES de tocar la base", async () => {
    const recibido = tablaComoPostgres("guia_transporte");
    const { fecha: _sin, ...sinFecha } = GUIA_OK;
    await postGuia(req("/api/guias", sinFecha));
    expect(recibido).toHaveLength(0);
  });
});

describe("POST /api/overrides — se alineó con su ruta hermana /api/cxc/overrides", () => {
  // `cartera` es obligatoria desde el #523 (las anotaciones del CXC se separan
  // por cartera): va en todos los casos para que lo que se mida acá siga siendo
  // la validación de `nombre_normalized` y no el 400 de la cartera faltante.
  it("sin nombre_normalized → 400 (era la llave del onConflict, sin validar)", async () => {
    tablaComoPostgres("cxc_client_overrides");
    const res = await postOverride(req("/api/overrides", { correo: "a@b.com", cartera: "grupo" }));
    expect(res.status).toBe(400);
  });

  it("caso feliz", async () => {
    const recibido = tablaComoPostgres("cxc_client_overrides");
    const res = await postOverride(
      req("/api/overrides", { nombre_normalized: "xtreme shoes", correo: "a@b.com", cartera: "grupo" }),
    );
    expect(res.status).toBe(200);
    expect(recibido[0].nombre_normalized).toBe("xtreme shoes");
  });
});

// ── El módulo compartido ─────────────────────────────────────────────────────

describe("textoObligatorio / faltan", () => {
  it.each([
    [undefined, null],
    [null, null],
    ["", null],
    ["   ", null],
    [42, null],
    ["  Ana  ", "Ana"],
  ])("textoObligatorio(%s) = %s", (entrada, esperado) => {
    expect(textoObligatorio(entrada)).toBe(esperado);
  });

  it("detecta el caso exacto del bug: la clave existe pero vale undefined", () => {
    const campos = CAMPOS_OBLIGATORIOS.caja_responsables;
    expect(faltan({ nombre: undefined }, campos)).toHaveLength(1);
    // Y es indistinguible de no mandarla, porque para la base lo es.
    expect(faltan({}, campos)).toHaveLength(1);
  });
});

describe("respuestaErrorEscritura — no queda muda, pero no filtra la base", () => {
  it("un 23502 que sobrevive a la validación avisa por Telegram UNA vez", async () => {
    // La ruta valida, así que para llegar acá hay que romper el schema: se
    // simula quitando la columna en el camino a la base, igual que hacía el
    // código roto de cheques.
    tablaComoPostgres("caja_responsables");
    const tabla = mockFrom();
    const insertReal = tabla.insert;
    mockFrom.mockReturnValue({
      insert: (f: Record<string, unknown>) => {
        const { nombre: _fuera, ...sinNombre } = f;
        return insertReal(sinNombre);
      },
    });

    const res = await postResponsable(req("/api/caja/responsables", { nombre: "Angela" }));
    expect(res.status).toBe(500);
    const msg = (await cuerpo(res)).error ?? "";
    expect(msg).toContain("FALTA-DATO");
    expect(mockEnviarSistema).toHaveBeenCalledTimes(1);

    // El segundo intento seguido NO vuelve a sonar (ventana de 1h).
    await postResponsable(req("/api/caja/responsables", { nombre: "Angela" }));
    expect(mockEnviarSistema).toHaveBeenCalledTimes(1);
  });

  it("el navegador NO recibe nombres de tabla, de columna ni el mensaje de Postgres", async () => {
    tablaComoPostgres("caja_responsables");
    const tabla = mockFrom();
    const insertReal = tabla.insert;
    mockFrom.mockReturnValue({
      insert: (f: Record<string, unknown>) => {
        const { nombre: _fuera, ...sinNombre } = f;
        return insertReal(sinNombre);
      },
    });
    const res = await postResponsable(req("/api/caja/responsables", { nombre: "Angela" }));
    const msg = (await cuerpo(res)).error ?? "";
    expect(msg).not.toContain("caja_responsables");
    expect(msg).not.toContain("not-null");
    expect(msg).not.toContain("23502");
    expect(msg).not.toContain("relation");
    // Pero SÍ le da algo que puede reportar.
    expect(msg).toMatch(/FALTA-DATO/);
  });

  it("un error cualquiera sigue siendo el 500 genérico y NO despierta a nadie", async () => {
    mockFrom.mockReturnValue({
      insert: () => ({ select: () => ({ single: async () => ({ data: null, error: { code: "57014", message: "canceling statement due to statement timeout" } }) }) }),
    });
    const res = await postResponsable(req("/api/caja/responsables", { nombre: "Angela" }));
    expect(res.status).toBe(500);
    expect((await cuerpo(res)).error).toContain("Intenta de nuevo");
    expect(mockEnviarSistema).not.toHaveBeenCalled();
  });
});

describe("ninguna de las rutas arregladas vuelve al 500 mudo", () => {
  const RUTAS = [
    "src/app/api/caja/responsables/route.ts",
    "src/app/api/vendors/route.ts",
    "src/app/api/reclamos/contactos/route.ts",
    "src/app/api/guias/route.ts",
    "src/app/api/overrides/route.ts",
  ];

  it.each(RUTAS)("%s valida antes de escribir", (ruta) => {
    const fuente = fs.readFileSync(path.join(process.cwd(), ruta), "utf8");
    expect(fuente).toContain("validarObligatorios");
    expect(fuente).toContain("respuestaErrorEscritura");
  });

  it.each(RUTAS.filter((r) => !r.includes("/guias/")))(
    "%s ya no contesta 'Error interno' en el camino de escritura",
    (ruta) => {
      const fuente = fs.readFileSync(path.join(process.cwd(), ruta), "utf8");
      // El GET puede seguir con su 500 genérico (no escribe nada); lo que no
      // puede quedar es un `.insert`/`.upsert`/`.update` con un catch mudo.
      const escrituras = fuente.match(/\.(insert|upsert|update)\([\s\S]{0,600}?if \(error\)[^\n]*/g) ?? [];

      if (escrituras.length === 0) {
        // La ruta DELEGA su escritura en un módulo compartido (`/api/overrides`
        // pasó a escribir por `lib/cxc/anotaciones.ts` en el #523, para que
        // ninguna consulta a las tablas de anotaciones nazca sin cartera).
        // El requisito no cambia, cambia dónde se cumple: el `catch` que
        // envuelve la llamada tiene que terminar en `respuestaErrorEscritura`.
        // 🩸 El `> 0` de antes existía para que este chequeo no fuera vacuo;
        // esta rama conserva esa garantía exigiendo el catch en vez de saltear.
        expect(fuente).toMatch(/catch[\s\S]{0,400}?respuestaErrorEscritura\(/);
        return;
      }
      for (const bloque of escrituras) {
        expect(bloque).toContain("respuestaErrorEscritura");
      }
    },
  );

  it("guías tampoco filtra el mensaje crudo de Postgres al navegador", () => {
    // Su POST tiene el error fuera del `if (error)` (reintento por 23505), así
    // que se verifica lo específico: que ya no devuelva `.message` en el JSON.
    const fuente = fs.readFileSync(path.join(process.cwd(), "src/app/api/guias/route.ts"), "utf8");
    expect(fuente).not.toMatch(/error:\s*(guiaErr|itemsErr)\??\.message/);
  });
});
