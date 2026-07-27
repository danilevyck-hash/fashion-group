/**
 * CANDADO — un sync no puede anotarse `success` habiendo escrito 0 filas cuando
 * SÍ había documentos que escribir.
 *
 * Contexto (27-jul-2026): `switch_factura_utilidad` no tenía ni una fila de
 * `joystep` en toda su historia y la pantalla de comisiones mostraba $0,00 como
 * si fuera un dato real. La causa de fondo era otra (joystep nunca estuvo en la
 * lista de empresas del sync — ver empresa-capabilities.test.ts), pero destapó
 * un modo de falla peor que un error: correr, no escribir nada, y quedar
 * registrado como éxito. Un sync que falla se ve y se repara; uno que reporta
 * éxito con la tabla vacía es invisible.
 *
 * La regla que se fija acá:
 *   - 0 documentos y 0 facturas en el rango  → success legítimo (no facturó).
 *   - 0 documentos con facturas en el rango  → ERROR, no success.
 *   - documentos > 0                          → success, sin consultar nada más.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Doble de Supabase ────────────────────────────────────────────────────────
// Solo hace falta responder tres cosas: el COUNT de switch_facturas (el guard),
// las lecturas de switch_facturas de buildSwitchIdMap, y tragarse los upserts /
// escrituras de log.
let countFacturas = 0;
const upserts: { tabla: string; filas: unknown[] }[] = [];
let logFinal: { status?: string; error_message?: string | null } = {};

vi.mock("@/lib/supabase-server", () => {
  const chain = (tabla: string) => {
    const c: Record<string, unknown> = {};
    let head = false;
    Object.assign(c, {
      select: (_cols?: string, opts?: { count?: string; head?: boolean }) => {
        head = opts?.head === true;
        return c;
      },
      eq: () => c,
      gte: () => c,
      lt: () => c,
      order: () => c,
      range: async () => ({ data: [], error: null, count: countFacturas }),
      single: async () => ({ data: { id: "log-1" }, error: null }),
      insert: () => c,
      update: (patch: Record<string, unknown>) => {
        if (tabla === "switch_sync_log") logFinal = patch;
        return { eq: async () => ({ data: null, error: null }) };
      },
      upsert: async (filas: unknown[]) => {
        upserts.push({ tabla, filas });
        return { data: null, error: null };
      },
      then: undefined,
    });
    // head:true → la promesa se resuelve con el count (patrón de PostgREST).
    (c as { _esHead: () => boolean })._esHead = () => head;
    return c;
  };
  return {
    supabaseServer: {
      from: (tabla: string) => {
        const c = chain(tabla) as Record<string, unknown>;
        // `select(..., {head:true})` se espera directo (await) → thenable.
        const orig = c.select as (cols?: string, opts?: Record<string, unknown>) => unknown;
        c.select = (cols?: string, opts?: { count?: string; head?: boolean }) => {
          orig(cols, opts);
          if (opts?.head) {
            const p = {
              eq: () => p,
              gte: () => p,
              lt: () => p,
              then: (res: (v: unknown) => void) =>
                res({ count: countFacturas, error: null, data: null }),
            } as Record<string, unknown>;
            return p;
          }
          return c;
        };
        return c;
      },
    },
  };
});

vi.mock("@/lib/switch-api/sync-log", () => ({ clearStaleRunning: async () => {} }));

// Cliente API JSON: cartera y maestro de vendedores vacíos (no aportan al caso).
vi.mock("@/lib/switch-api/client", () => ({
  createSwitchClient: () => ({
    listClientes: async () => ({ clientes: [], paginacion: { total: 0 } }),
    listVendedores: async () => ({ vendedores: [], paginacion: { total: 0 } }),
  }),
}));

// Cliente WEB: lo que devuelve el reporte de utilidad, controlado por el test.
let filasReporte: unknown[] = [];
vi.mock("@/lib/switch-api/web-client", () => ({
  loginSwitchWeb: async () => ({ empresaKey: "joystep", baseUrl: "", cookies: new Map() }),
  fetchUtilidadMes: async () => filasReporte,
}));

import { syncEmpresaUtilidad } from "@/lib/switch-api/sync-utilidad";

const MESES = [{ year: 2026, month: 7 }];

const docUtilidad = (secuencial: string) => ({
  secuencial,
  fecha: "2026-07-15",
  tipoComprobante: "Factura",
  vendedor: "ALGUIEN",
  cliente: "CLIENTE X",
  clienteSwitchId: 1,
  subtotalConDescuento: 1000,
  costo: 700,
  utilidad: 300,
  pctUtilidad: 30,
});

beforeEach(() => {
  countFacturas = 0;
  upserts.length = 0;
  logFinal = {};
  filasReporte = [];
});

describe("guard del cero silencioso en sync-utilidad", () => {
  it("0 documentos CON facturas en el rango → error, no success", async () => {
    countFacturas = 15; // joystep tiene 15 facturas en julio 2026
    filasReporte = [];

    const r = await syncEmpresaUtilidad("joystep", MESES, "manual");

    expect(r.ok).toBe(false);
    expect(r.documentos).toBe(0);
    expect(r.error).toMatch(/0 documentos/);
    expect(r.error).toMatch(/15/);
    expect(logFinal.status).toBe("error");
    // Y no escribió nada en la tabla de utilidad.
    expect(upserts.filter((u) => u.tabla === "switch_factura_utilidad")).toEqual([]);
  });

  it("0 documentos SIN facturas en el rango → success legítimo (no facturó)", async () => {
    countFacturas = 0;
    filasReporte = [];

    const r = await syncEmpresaUtilidad("joystep", MESES, "manual");

    expect(r.ok).toBe(true);
    expect(r.documentos).toBe(0);
    expect(logFinal.status).toBe("success");
  });

  it("con documentos → success normal", async () => {
    countFacturas = 15;
    filasReporte = [docUtilidad("11-000000001"), docUtilidad("11-000000002")];

    const r = await syncEmpresaUtilidad("joystep", MESES, "manual");

    expect(r.ok).toBe(true);
    expect(r.documentos).toBe(2);
    expect(logFinal.status).toBe("success");
    expect(upserts.some((u) => u.tabla === "switch_factura_utilidad")).toBe(true);
  });
});
