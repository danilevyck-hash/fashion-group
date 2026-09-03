// ============================================================================
// CANDADO — Marketing ya NO tolera "esa tabla no existe" (3-sep-2026)
//
// Cuando se estrenaron `mk_periodos`, `mk_periodo_documentos`,
// `mk_mobiliario_notas_proveedor` y las columnas `bultos` / `foto_path`, el
// código se escribió para funcionar ANTES de que Daniel corriera la migración
// a mano: si Supabase contestaba 42P01 / PGRST205 (tabla) o 42703 / PGRST204
// (columna), se degradaba a "no hay datos" en silencio. Era correcto mientras
// la migración estaba pendiente.
//
// Las cuatro migraciones corrieron (verificado contra producción el
// 3-sep-2026: las tablas contestan filas y las columnas existen). Desde
// entonces ese código era una rama muerta que escondía errores reales: un
// permiso, un timeout o un cambio de esquema con el mismo código dejaban la
// pantalla diciendo "sin datos" y nadie se enteraba.
//
// Un caso por archivo tocado. Cada uno simula el error que antes se tragaba y
// exige que ahora FALLE VISIBLE: promesa rechazada, 500 con mensaje humano, o
// (donde sellar no puede ser fatal, 🩸) un `console.error` que deje rastro.
//
// Mutación probada: volver a poner el `if (esTablaAusente(...))` / el
// reintento "sin la columna" en cualquiera de los ocho → su caso pinta rojo.
// ============================================================================
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= "test-anon-key";
  process.env.SESSION_SECRET ||= "test-secret";
});

// ── Doble de PostgREST: todo contesta vacío, salvo las tablas "rotas" ───────
type ErrorPg = { code: string; message: string };

const estado = {
  /** tabla → error que devuelve CUALQUIER operación sobre ella. */
  rotas: new Map<string, ErrorPg>(),
  /** Cuántas escrituras (insert/update/upsert) recibió cada tabla. */
  escrituras: new Map<string, number>(),
  /** Filas que devuelve un SELECT de una tabla sana. */
  filas: new Map<string, Array<Record<string, unknown>>>(),
};

const TABLA_AUSENTE: ErrorPg = {
  code: "PGRST205",
  message: "Could not find the table 'public.x' in the schema cache",
};
const COLUMNA_AUSENTE: ErrorPg = {
  code: "PGRST204",
  message: "Could not find the 'bultos' column of 'mk_entrega_items' in the schema cache",
};

class Consulta implements PromiseLike<{ data: unknown; error: unknown }> {
  private escribe = false;
  constructor(private tabla: string) {}
  select() {
    return this;
  }
  insert() {
    this.escribe = true;
    return this;
  }
  update() {
    this.escribe = true;
    return this;
  }
  upsert() {
    this.escribe = true;
    return this;
  }
  delete() {
    return this;
  }
  eq() {
    return this;
  }
  in() {
    return this;
  }
  is() {
    return this;
  }
  order() {
    return this;
  }
  limit() {
    return this;
  }
  private ejecutar(): { data: unknown; error: unknown } {
    if (this.escribe) {
      estado.escrituras.set(this.tabla, (estado.escrituras.get(this.tabla) ?? 0) + 1);
    }
    const roto = estado.rotas.get(this.tabla);
    if (roto) return { data: null, error: roto };
    return { data: estado.filas.get(this.tabla) ?? [], error: null };
  }
  async single() {
    const r = this.ejecutar();
    if (r.error) return r;
    const filas = r.data as Array<Record<string, unknown>>;
    return filas.length === 1
      ? { data: filas[0], error: null }
      : { data: null, error: { code: "PGRST116", message: "no single" } };
  }
  async maybeSingle() {
    const r = this.ejecutar();
    if (r.error) return r;
    const filas = r.data as Array<Record<string, unknown>>;
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
        createSignedUrls: async () => ({ data: [], error: null }),
      }),
    },
  },
}));

import { NextRequest } from "next/server";
import { signSession } from "@/lib/session-cookie";
import { GET as inicioRoute } from "@/app/api/marketing/inicio/route";
import { GET as proyectosListaRoute } from "@/app/api/marketing/proyectos-lista/route";
import { GET as periodosRoute } from "@/app/api/marketing/periodos/route";
import { GET as reporteRoute } from "@/app/api/marketing/periodos/[id]/reporte/route";
import { cargarDatosPeriodos } from "@/lib/marketing/periodos-reporte";
import { periodoAbiertoDe, sellarDocumento } from "@/lib/marketing/periodos-io";
import { createProducto, updateProducto } from "@/lib/marketing/inventario";
import {
  createNotaProveedor,
  listNotasProveedor,
} from "@/lib/marketing/notas-proveedor-server";

function req(path: string): NextRequest {
  const cookie = signSession({
    role: "admin",
    userId: "u1",
    userName: "Daniel",
    sessionToken: "t1",
  });
  return new NextRequest(`http://localhost${path}`, {
    headers: { cookie: `cxc_session=${cookie}` },
  });
}

const PERIODO_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc";

beforeEach(() => {
  estado.rotas = new Map();
  estado.escrituras = new Map();
  estado.filas = new Map();
  vi.restoreAllMocks();
});

// ────────────────────────────────────────────────────────────────────────────
describe("PGRST205 en las tablas de período ya no es 'no hay períodos'", () => {
  it("api/marketing/inicio → 500, no una pantalla con el archivo como gasto abierto", async () => {
    estado.rotas.set("mk_periodo_documentos", TABLA_AUSENTE);
    vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await inicioRoute(req("/api/marketing/inicio"));
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error?: string; bloques?: unknown };
    expect(body.error).toMatch(/periodo_documentos/);
    expect(body.bloques).toBeUndefined();
  });

  it("api/marketing/proyectos-lista → 500, no secciones sin período", async () => {
    estado.rotas.set("mk_periodos", TABLA_AUSENTE);
    vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await proyectosListaRoute(req("/api/marketing/proyectos-lista?bloque=TH"));
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error?: string; secciones?: unknown };
    expect(body.error).toMatch(/periodos/);
    expect(body.secciones).toBeUndefined();
  });

  it("api/marketing/periodos → 500 con mensaje humano, nunca `hayPeriodos: false`", async () => {
    estado.rotas.set("mk_periodos", TABLA_AUSENTE);
    vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await periodosRoute(req("/api/marketing/periodos"));
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error?: string; hayPeriodos?: boolean };
    expect(body.error).toBe("No se pudieron cargar los períodos. Intenta de nuevo.");
    expect(body.hayPeriodos).toBeUndefined();
  });

  it("api/marketing/periodos/[id]/reporte → 500, no el 409 de 'falta la actualización'", async () => {
    estado.rotas.set("mk_periodos", TABLA_AUSENTE);
    vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await reporteRoute(req(`/api/marketing/periodos/${PERIODO_ID}/reporte`), {
      params: { id: PERIODO_ID },
    });
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("No se pudo generar el Excel. Intenta de nuevo.");
    expect(body.error).not.toMatch(/actualización en la base de datos/);
  });

  it("lib/marketing/periodos-reporte: cargarDatosPeriodos LANZA (antes: vacío + hayTablas=false)", async () => {
    estado.rotas.set("mk_periodo_documentos", TABLA_AUSENTE);
    await expect(cargarDatosPeriodos()).rejects.toThrow(/periodo_documentos/);
  });

  it("lib/marketing/periodos-io: leer LANZA y sellar (no fatal, 🩸) deja rastro en el log", async () => {
    estado.rotas.set("mk_periodos", TABLA_AUSENTE);
    const errores = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(periodoAbiertoDe("TH")).rejects.toMatchObject({ code: "PGRST205" });

    // Sellar sigue sin lanzar — el documento ya está guardado — pero el
    // tropiezo ya no se calla.
    await expect(
      sellarDocumento({ tipo: "factura", documentoId: "f-1", marcaKeys: ["TH"] }),
    ).resolves.toBeUndefined();
    expect(errores).toHaveBeenCalledTimes(1);
    expect(String(errores.mock.calls[0][0])).toMatch(/sellarDocumento\[periodos\].*schema cache/);
  });
});

// ────────────────────────────────────────────────────────────────────────────
describe("la columna / la tabla de Mobiliario ya no se 'reintenta sin ella'", () => {
  it("lib/marketing/inventario: PGRST204 en foto_path → LANZA, con UNA sola escritura (sin reintento sin foto)", async () => {
    estado.rotas.set("mk_inventario_productos", COLUMNA_AUSENTE);

    await expect(
      createProducto({ nombre: "Panel", precio: 65, stockTotal: 10, fotoPath: "a.jpg" }),
    ).rejects.toThrow(/schema cache/);
    expect(estado.escrituras.get("mk_inventario_productos")).toBe(1);

    await expect(
      updateProducto("p-1", { precio: 70, fotoPath: "b.jpg" }),
    ).rejects.toThrow(/schema cache/);
    // Antes: un segundo update sin `foto_path`. Ahora: ninguno.
    expect(estado.escrituras.get("mk_inventario_productos")).toBe(2);
  });

  it("lib/marketing/notas-proveedor-server: PGRST205 → LANZA (antes: lista vacía + ddlPendiente)", async () => {
    estado.rotas.set("mk_mobiliario_notas_proveedor", TABLA_AUSENTE);

    await expect(listNotasProveedor()).rejects.toThrow(/schema cache/);
    // Y la escritura ya no disfraza el error de "falta correr la migración".
    const err = (await createNotaProveedor({
      producto: "Paneles",
      precio: 65,
      nota: null,
      fotoPaths: [],
    }).catch((e: unknown) => e)) as Error;
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toMatch(/schema cache/);
    expect(err.message).not.toMatch(/falta correr la migración/);
  });
});
