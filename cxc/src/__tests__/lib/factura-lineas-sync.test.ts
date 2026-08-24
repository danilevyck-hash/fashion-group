/**
 * Candados de CONDUCTA del sync del detalle de línea.
 *
 * 🩸 POR QUÉ ESTE ARCHIVO EXISTE: la primera verificación por mutación dio
 * 12 de 14 y las DOS que sobrevivieron eran las más caras del módulo —
 * «las líneas no se escriben pero el documento se marca» y «la lectura deja de
 * paginar». Las dos las vigilaba un barrido de TEXTO, y un barrido de texto no
 * puede ver que un `if` quedó en `false` ni que una función se llama y su
 * resultado se tira a la basura.
 *
 * Acá se ejecuta `sincronizarLineasEmpresa` de verdad, con Supabase y Switch
 * DOBLADOS, y se mira qué se escribió.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// ── El doble de Supabase ────────────────────────────────────────────────────
// Registra cada escritura para poder afirmar el ORDEN y el CONTENIDO.
interface Escritura {
  tabla: string;
  op: "upsert" | "update";
  filas: unknown[];
  filtros?: Record<string, unknown>;
}

const escrituras: Escritura[] = [];
let pendientes: Record<string, unknown>[] = [];
let paginasPedidas: { desde: number; hasta: number }[] = [];
/** Si es true, el upsert de líneas falla — el caso que decide si el documento
 *  queda marcado sin sus líneas (un hueco permanente y mudo). */
let upsertFalla = false;

function fakeFrom(tabla: string) {
  const filtros: Record<string, unknown> = {};
  const api: Record<string, unknown> = {
    select: (_cols: string, _opts?: unknown) => api,
    eq: (k: string, v: unknown) => {
      filtros[k] = v;
      return api;
    },
    in: (k: string, v: unknown) => {
      filtros[k] = v;
      return api;
    },
    is: (k: string, v: unknown) => {
      filtros[k] = v;
      return api;
    },
    order: () => api,
    limit: () => api,
    range: (desde: number, hasta: number) => {
      paginasPedidas.push({ desde, hasta });
      const lote = pendientes.slice(desde, hasta + 1);
      return Promise.resolve({ data: lote, error: null, count: pendientes.length });
    },
    upsert: (filas: unknown[]) => {
      if (upsertFalla) {
        return Promise.resolve({ data: null, error: { message: "upsert reventó" } });
      }
      escrituras.push({ tabla, op: "upsert", filas });
      return Promise.resolve({ data: null, error: null });
    },
    update: (fila: unknown) => {
      const upd: Record<string, unknown> = {
        eq: (k: string, v: unknown) => {
          filtros[k] = v;
          return upd;
        },
        in: (k: string, v: unknown) => {
          filtros[k] = v;
          escrituras.push({ tabla, op: "update", filas: [fila], filtros: { ...filtros } });
          return Promise.resolve({ data: null, error: null });
        },
      };
      return upd;
    },
  };
  return api;
}

vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: { from: (t: string) => fakeFrom(t) },
}));

// ── El doble de Switch ──────────────────────────────────────────────────────
let detallePorId: Record<number, unknown[] | "falla"> = {};
let llamadasSwitch: string[] = [];
let sesionesCerradas = 0;

vi.mock("@/lib/switch-api/client", () => ({
  createSwitchClient: () => ({
    getFactura: async (id: number) => {
      llamadasSwitch.push(`FA:${id}`);
      const d = detallePorId[id];
      if (d === "falla") throw new Error("400 NO SE HA ENCONTRADO INFORMACIÓN");
      return { detalle: d ?? [] };
    },
    getNotaCredito: async (id: number) => {
      llamadasSwitch.push(`NC:${id}`);
      const d = detallePorId[id];
      if (d === "falla") throw new Error("400 NO SE HA ENCONTRADO INFORMACIÓN");
      return { detalle: d ?? [] };
    },
  }),
  logoutAllSwitchSessions: async () => {
    sesionesCerradas++;
  },
}));

vi.mock("@/lib/switch-api/sync-log", () => ({
  createSwitchSyncLog: async () => "log-1",
  finishSwitchSyncLog: async () => {},
}));

const { sincronizarLineasEmpresa } = await import("@/lib/switch-api/sync-factura-lineas");

const LINEA = {
  articuloId: 1324,
  codigoArticulo: "100250388",
  descripcion: "VERSE",
  cantidad: "24.0000",
  precio: "30.0000",
  descuento: "0.0000",
  subTotalConDescuento: "720.0000",
};

function doc(id: number, tipo = "Factura") {
  return {
    switch_factura_id: id,
    tipo_comprobante: tipo,
    secuencial: `11-${id}`,
    fecha: "2026-08-07T17:23:30+00:00",
    cliente_switch_id: 69,
    cliente_nombre: "City Mall Paso Canoa",
    vendedor_switch_id: 2,
    vendedor_nombre: "REINALDO ESPINOSA",
  };
}

beforeEach(() => {
  escrituras.length = 0;
  paginasPedidas = [];
  llamadasSwitch = [];
  pendientes = [];
  detallePorId = {};
  upsertFalla = false;
  sesionesCerradas = 0;
});

describe("🔴 el documento NO se marca si sus líneas no se escribieron", () => {
  it("con el upsert fallando, NADIE queda marcado", async () => {
    // Es el peor modo de fallo del módulo: el documento quedaría como «ya lo
    // bajé» y sus líneas no se pedirían NUNCA MÁS. Un hueco permanente, sin
    // error a la vista y sin forma de detectarlo después.
    pendientes = [doc(1), doc(2)];
    detallePorId = { 1: [LINEA], 2: [LINEA] };
    upsertFalla = true;

    const r = await sincronizarLineasEmpresa("active_shoes");

    expect(r.ok).toBe(false);
    const marcas = escrituras.filter((e) => e.op === "update");
    expect(marcas).toHaveLength(0);
  });

  it("con todo bien, primero se escriben las líneas y DESPUÉS la marca", async () => {
    pendientes = [doc(1)];
    detallePorId = { 1: [LINEA] };

    const r = await sincronizarLineasEmpresa("active_shoes");

    expect(r.ok).toBe(true);
    expect(escrituras.map((e) => `${e.tabla}:${e.op}`)).toEqual([
      "switch_factura_lineas:upsert",
      "switch_facturas:update",
    ]);
    expect(r.lineasEscritas).toBe(1);
  });

  it("un documento que Switch no entrega NO se marca — se reintenta mañana", async () => {
    pendientes = [doc(1), doc(2)];
    detallePorId = { 1: [LINEA], 2: "falla" };

    const r = await sincronizarLineasEmpresa("active_shoes");

    expect(r.documentosBajados).toBe(1);
    expect(r.documentosFallados).toBe(1);
    const marcados = escrituras
      .filter((e) => e.op === "update")
      .flatMap((e) => (e.filtros?.switch_factura_id as number[]) ?? []);
    expect(marcados).toEqual([1]);
    expect(marcados).not.toContain(2);
  });

  it("Switch se reintenta una vez antes de darlo por perdido", async () => {
    // Medido: 15 de 489 facturas de active_shoes fallaron con un 400
    // transitorio y las 15 salieron bien en la segunda pasada.
    pendientes = [doc(1)];
    detallePorId = { 1: "falla" };

    await sincronizarLineasEmpresa("active_shoes");

    expect(llamadasSwitch.filter((l) => l === "FA:1")).toHaveLength(2);
  });
});

describe("🔴 la lectura de pendientes PAGINA de verdad", () => {
  it("con más de 1000 documentos se piden varias páginas y se bajan TODOS", async () => {
    // db-max-rows = 1000 corta EN SILENCIO: sin paginar se bajarían 1.000 de
    // 2.500 y la corrida se anotaría `success` con el 60% de las ventas
    // invisible. Sin un solo error.
    pendientes = Array.from({ length: 2500 }, (_, i) => doc(i + 1));
    for (let i = 1; i <= 2500; i++) detallePorId[i] = [LINEA];

    const r = await sincronizarLineasEmpresa("active_shoes");

    expect(r.pendientesAlEmpezar).toBe(2500);
    expect(paginasPedidas.length).toBeGreaterThan(1);
    expect(r.documentosBajados).toBe(2500);
    expect(r.lineasEscritas).toBe(2500);
  });

  it("el límite recorta DESPUÉS de contar, no la lectura", async () => {
    // El tope del cron existe para que la corrida siempre termine; no puede
    // esconder cuántos quedan pendientes de verdad.
    pendientes = Array.from({ length: 50 }, (_, i) => doc(i + 1));
    for (let i = 1; i <= 50; i++) detallePorId[i] = [LINEA];

    const r = await sincronizarLineasEmpresa("active_shoes", { limite: 10 });

    expect(r.documentosBajados).toBe(10);
  });
});

describe("las notas de crédito se piden por SU endpoint", () => {
  it("una NC llama a getNotaCredito, no a getFactura", async () => {
    // Pedirle una NC a /apifactura/info devuelve vacío, y eso se guardaría
    // como «documento sin líneas»: la devolución desaparecería del sistema.
    pendientes = [doc(7, "Nota de Crédito")];
    detallePorId = { 7: [{ ...LINEA, cantidad: "-4.0000" }] };

    await sincronizarLineasEmpresa("active_shoes");

    expect(llamadasSwitch).toEqual(["NC:7"]);
  });

  it("la cantidad negativa de la NC se guarda como magnitud", async () => {
    pendientes = [doc(7, "Nota de Crédito")];
    detallePorId = { 7: [{ ...LINEA, cantidad: "-4.0000" }] };

    await sincronizarLineasEmpresa("active_shoes");

    const fila = escrituras.find((e) => e.op === "upsert")!.filas[0] as {
      cantidad: number;
      tipo_comprobante: string;
    };
    expect(fila.cantidad).toBe(4);
    expect(fila.tipo_comprobante).toBe("Nota de Crédito");
  });
});

describe("sin nada pendiente no se toca Switch", () => {
  it("cero pendientes = cero llamadas y cero escrituras", async () => {
    const r = await sincronizarLineasEmpresa("active_shoes");
    expect(r.ok).toBe(true);
    expect(llamadasSwitch).toHaveLength(0);
    expect(escrituras).toHaveLength(0);
  });
});
