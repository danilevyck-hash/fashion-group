/**
 * CANDADO — el guard del "cero silencioso" de utilidad cuenta SOLO lo que el
 * reporte de utilidad puede traer, y sigue sonando cuando falta lo que sí trae.
 *
 * 🩸 6-sep-2026: sonó 🔧 SISTEMA dos veces por `active_shoes` y `joystep` sin
 * que pasara nada. El guard comparaba los documentos del reporte contra TODAS
 * las filas de `switch_facturas` del rango, incluidas las ventas de mostrador
 * (`Transacción`, serie 155), que el reporte no trae nunca. Los tres documentos
 * que lo dispararon sumaban $149. Medido en 2026: de 513 `Transacción` el
 * reporte trajo 0, mientras Factura (1.197), Nota de Crédito (428) y Nota de
 * Débito (212) cuadran exactas.
 *
 * 🔴 Este candado va en LAS DOS DIRECCIONES. El guard existe porque un reporte
 * vacío anotado como éxito esconde un dato que no llegó — y esa tabla decide
 * qué facturas comisionan. Así que:
 *   · solo mostrador en el rango  → NO suena (era la falsa alarma);
 *   · falta una Factura de verdad → SIGUE sonando;
 *   · un tipo que Switch estrene   → cuenta, y suena. Ante la duda, se dice.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  TIPOS_FUERA_DEL_REPORTE_DE_UTILIDAD,
  elReporteDeUtilidadLoTrae,
  filtroTiposFueraDelReporteDeUtilidad,
} from "@/lib/switch-api/utilidad-cobertura";
import { TIPOS_VENTA_CONOCIDOS } from "@/lib/ventas/tipos-comprobante";

// ─── El universo que finge producción ────────────────────────────────────────
// El doble de Supabase NO devuelve un número puesto a mano: guarda los tipos de
// comprobante de las facturas del rango y le aplica los filtros que el código
// real pidió. Así el test mide la CONDUCTA del guard, no una constante.
let facturasDelRango: string[] = [];
let filtroNotIn: { columna: string; lista: string } | null = null;
const upserts: { tabla: string; filas: unknown[] }[] = [];
let logFinal: { status?: string; error_message?: string | null } = {};

function contarConFiltro(): number {
  if (!filtroNotIn) return facturasDelRango.length;
  const excluidos = filtroNotIn.lista
    .replace(/^\(|\)$/g, "")
    .split(",")
    .map((v) => v.trim().replace(/^"|"$/g, ""));
  return facturasDelRango.filter((t) => !excluidos.includes(t)).length;
}

vi.mock("@/lib/supabase-server", () => {
  const chain = (tabla: string) => {
    const c: Record<string, unknown> = {};
    Object.assign(c, {
      select: () => c,
      eq: () => c,
      gte: () => c,
      lt: () => c,
      not: () => c,
      order: () => c,
      range: async () => ({ data: [], error: null, count: 0 }),
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
    });
    return c;
  };
  return {
    supabaseServer: {
      from: (tabla: string) => {
        const c = chain(tabla) as Record<string, unknown>;
        const orig = c.select as (cols?: string, opts?: Record<string, unknown>) => unknown;
        c.select = (cols?: string, opts?: { count?: string; head?: boolean }) => {
          orig(cols, opts);
          if (opts?.head) {
            // Cadena del COUNT: registra el `.not(...)` y resuelve contando.
            const p: Record<string, unknown> = {
              eq: () => p,
              gte: () => p,
              lt: () => p,
              not: (columna: string, op: string, lista: string) => {
                if (op === "in") filtroNotIn = { columna, lista };
                return p;
              },
              then: (res: (v: unknown) => void) =>
                res({ count: contarConFiltro(), error: null, data: null }),
            };
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
vi.mock("@/lib/switch-api/client", () => ({
  createSwitchClient: () => ({
    listClientes: async () => ({ clientes: [], paginacion: { total: 0 } }),
    listVendedores: async () => ({ vendedores: [], paginacion: { total: 0 } }),
  }),
}));

let filasReporte: unknown[] = [];
vi.mock("@/lib/switch-api/web-client", () => ({
  loginSwitchWeb: async () => ({ empresaKey: "joystep", baseUrl: "", cookies: new Map() }),
  fetchUtilidadMes: async () => filasReporte,
}));

import { syncEmpresaUtilidad } from "@/lib/switch-api/sync-utilidad";

const MESES = [{ year: 2026, month: 9 }];

beforeEach(() => {
  facturasDelRango = [];
  filtroNotIn = null;
  upserts.length = 0;
  logFinal = {};
  filasReporte = [];
});

// ─────────────────────────────────────────────────────────────────────────────
describe("qué puede traer el reporte de utilidad (módulo puro)", () => {
  it("el mostrador está fuera: el reporte no trae `Transacción`", () => {
    expect(TIPOS_FUERA_DEL_REPORTE_DE_UTILIDAD).toContain("Transacción");
    expect(elReporteDeUtilidadLoTrae("Transacción")).toBe(false);
  });

  it("los tres que SÍ cuadran contra producción siguen contando", () => {
    for (const tipo of ["Factura", "Nota de Crédito", "Nota de Débito"]) {
      expect(elReporteDeUtilidadLoTrae(tipo)).toBe(true);
    }
  });

  it("🔴 un tipo que Switch estrene CUENTA — contar de menos calla el guard", () => {
    expect(elReporteDeUtilidadLoTrae("Comprobante Nuevo De Switch")).toBe(true);
    expect(elReporteDeUtilidadLoTrae(null)).toBe(true);
    expect(elReporteDeUtilidadLoTrae("")).toBe(true);
  });

  it("la lista de exclusiones es CERRADA: nada se agrega sin medirlo", () => {
    // `Tiquete` NO está a propósito: su historia (hasta el 30-jun-2025) no se
    // toca con la del reporte (desde el 3-ene-2026), así que no hay con qué
    // probarlo. Ver el encabezado de utilidad-cobertura.ts.
    expect([...TIPOS_FUERA_DEL_REPORTE_DE_UTILIDAD].sort()).toEqual(["Transacción"]);
  });

  it("lo que se excluye es vocabulario que el sistema sabe leer", () => {
    // Una exclusión mal escrita no excluiría nada y nadie se enteraría.
    for (const tipo of TIPOS_FUERA_DEL_REPORTE_DE_UTILIDAD) {
      expect(TIPOS_VENTA_CONOCIDOS).toContain(tipo);
    }
  });

  it("el filtro para la consulta sale de la misma lista, con comillas", () => {
    const filtro = filtroTiposFueraDelReporteDeUtilidad();
    for (const tipo of TIPOS_FUERA_DEL_REPORTE_DE_UTILIDAD) {
      expect(filtro).toContain(`"${tipo}"`);
    }
    expect(filtro.startsWith("(")).toBe(true);
    expect(filtro.endsWith(")")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("el guard, con el universo de producción", () => {
  it("🩸 solo mostrador en el rango → NO suena (la falsa alarma del 6-sep)", async () => {
    // active_shoes / joystep: lo único de la ventana eran 3 `Transacción`.
    facturasDelRango = ["Transacción", "Transacción", "Transacción"];
    filasReporte = [];

    const r = await syncEmpresaUtilidad("joystep", MESES, "manual");

    expect(r.ok).toBe(true);
    expect(logFinal.status).toBe("success");
  });

  it("🔴 falta una Factura de verdad → SIGUE sonando", async () => {
    facturasDelRango = ["Factura", "Transacción"];
    filasReporte = [];

    const r = await syncEmpresaUtilidad("joystep", MESES, "manual");

    expect(r.ok).toBe(false);
    expect(logFinal.status).toBe("error");
    expect(r.error).toMatch(/0 documentos/);
    // Cuenta 1, no 2: el mostrador no infla el reclamo.
    expect(r.error).toMatch(/\b1\b/);
  });

  it("🔴 falta una nota de crédito o de débito → también suena", async () => {
    for (const tipo of ["Nota de Crédito", "Nota de Débito"]) {
      facturasDelRango = [tipo];
      filtroNotIn = null;
      logFinal = {};
      filasReporte = [];
      const r = await syncEmpresaUtilidad("joystep", MESES, "manual");
      expect(r.ok, `${tipo} tiene que disparar`).toBe(false);
    }
  });

  it("🔴 un tipo desconocido en el rango → suena (ante la duda, se dice)", async () => {
    facturasDelRango = ["Comprobante Nuevo De Switch"];
    filasReporte = [];

    const r = await syncEmpresaUtilidad("joystep", MESES, "manual");

    expect(r.ok).toBe(false);
  });

  it("rango vacío de verdad → success legítimo, como siempre", async () => {
    facturasDelRango = [];
    filasReporte = [];

    const r = await syncEmpresaUtilidad("joystep", MESES, "manual");

    expect(r.ok).toBe(true);
    expect(logFinal.status).toBe("success");
  });

  it("el COUNT del guard pide el filtro sobre el tipo de comprobante", async () => {
    facturasDelRango = ["Transacción"];
    filasReporte = [];
    await syncEmpresaUtilidad("joystep", MESES, "manual");

    expect(filtroNotIn).not.toBeNull();
    expect(filtroNotIn?.columna).toBe("tipo_comprobante");
    expect(filtroNotIn?.lista).toBe(filtroTiposFueraDelReporteDeUtilidad());
  });

  it("con documentos, el guard ni pregunta: success normal", async () => {
    facturasDelRango = ["Factura"];
    filasReporte = [
      {
        secuencial: "11-000000001",
        fecha: "2026-09-03",
        tipoComprobante: "Factura",
        vendedor: "ALGUIEN",
        cliente: "CLIENTE X",
        clienteSwitchId: 1,
        subtotalConDescuento: 1000,
        costo: 700,
        utilidad: 300,
        pctUtilidad: 30,
      },
    ];

    const r = await syncEmpresaUtilidad("joystep", MESES, "manual");

    expect(r.ok).toBe(true);
    expect(r.documentos).toBe(1);
    expect(upserts.some((u) => u.tabla === "switch_factura_utilidad")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("la regla se dice UNA vez", () => {
  const raiz = path.join(process.cwd(), "src");
  const sync = readFileSync(path.join(raiz, "lib/switch-api/sync-utilidad.ts"), "utf8");

  it("el sync importa la lista, no la vuelve a escribir a mano", () => {
    expect(sync).toContain('from "./utilidad-cobertura"');
    // Ni el nombre del tipo ni la serie sueltos dentro del sync.
    expect(sync).not.toMatch(/"Transacción"/);
    expect(sync).not.toMatch(/'Transacción'/);
  });

  it("el COUNT del guard acota por tipo de comprobante", () => {
    expect(sync).toMatch(/\.not\(\s*"tipo_comprobante"\s*,\s*"in"/);
  });
});
